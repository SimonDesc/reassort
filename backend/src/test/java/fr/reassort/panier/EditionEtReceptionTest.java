package fr.reassort.panier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import fr.reassort.PostgresEmbarque;
import fr.reassort.Refus;
import fr.reassort.demo.ChargementDemo;
import fr.reassort.panier.Panier.CommandeFournisseur;
import fr.reassort.panier.Panier.Ligne;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.prevision.PrevisionService;

/** Le pharmacien retouche le panier avant de le valider, puis réceptionne les cartons. */
@SpringBootTest
@Import(PostgresEmbarque.class)
class EditionEtReceptionTest {

	@Autowired
	PanierService paniers;

	@Autowired
	PrevisionService previsions;

	@Autowired
	ChargementDemo demo;

	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void rechargerLaDemo() {
		demo.reinitialiser();
	}

	@Test
	void modifierLaQuantiteDUneLigneRecalculeLesTotaux() {
		Panier panier = paniers.proposer(7);
		Ligne ligne = grossiste(panier).lignes().getFirst();

		Panier modifie = paniers.modifierLigne(panier.id(), ligne.id(), ligne.quantite() + 10, null);

		Ligne apres = trouver(modifie, ligne.id());
		assertThat(apres.quantite()).isEqualTo(ligne.quantite() + 10);
		assertThat(modifie.total()).isEqualByComparingTo(panier.total().add(ligne.prixUnitaire().multiply(java.math.BigDecimal.TEN)));
	}

	@Test
	void changerDeFournisseurArrondiAuColisageEtDeplaceLaLigne() {
		Panier panier = paniers.proposer(14);
		Ligne ligne = grossiste(panier).lignes().stream()
				.filter(l -> l.libelle().startsWith("Paracétamol 1000")).findFirst()
				.orElse(grossiste(panier).lignes().getFirst());
		long offreLabo = jdbc.sql("SELECT id FROM offre WHERE cip13 = ? AND fournisseur_id = 'labo-direct-occitanie'")
				.param(ligne.cip13()).query(Long.class).optional()
				.orElseGet(() -> jdbc.sql("SELECT id FROM offre WHERE cip13 = ? AND colisage > 1 LIMIT 1")
						.param(ligne.cip13()).query(Long.class).single());

		Panier modifie = paniers.modifierLigne(panier.id(), ligne.id(), null, offreLabo);

		Ligne apres = trouver(modifie, ligne.id());
		assertThat(apres.offreId()).isEqualTo(offreLabo);
		assertThat(apres.quantite() % apres.colisage()).isZero();
		assertThat(apres.quantite()).isGreaterThanOrEqualTo(ligne.quantite());
	}

	@Test
	void uneQuantiteHorsColisageEstRefuseeAvecLaBonneQuantite() {
		Panier panier = paniers.proposer(14);
		Ligne ligneCarton = panier.commandes().stream().flatMap(c -> c.lignes().stream())
				.filter(l -> l.colisage() > 1).findFirst().orElseThrow();

		assertThatThrownBy(() -> paniers.modifierLigne(panier.id(), ligneCarton.id(), ligneCarton.quantite() + 1, null))
				.isInstanceOf(Refus.class)
				.hasMessageContaining("par carton de " + ligneCarton.colisage());
	}

	@Test
	void retirerUneLigneLaSortDuPanier() {
		Panier panier = paniers.proposer(7);
		Ligne ligne = grossiste(panier).lignes().getFirst();

		Panier apres = paniers.retirerLigne(panier.id(), ligne.id());

		assertThat(apres.nombreLignes()).isEqualTo(panier.nombreLignes() - 1);
	}

	@Test
	void unPanierValideNeSeModifiePlus() {
		Panier panier = paniers.valider(paniers.proposer(7).id());
		long ligne = panier.commandes().getFirst().lignes().getFirst().id();

		assertThatThrownBy(() -> paniers.retirerLigne(panier.id(), ligne)).isInstanceOf(PanierService.PanierDejaValide.class);
	}

	@Test
	void receptionnerUnFournisseurAugmenteLeStockPuisLePanierPasseRecu() {
		Panier panier = paniers.valider(paniers.proposer(7).id());
		CommandeFournisseur grossiste = grossiste(panier);
		Ligne ligne = grossiste.lignes().getFirst();
		int stockAvant = stock(ligne.cip13());

		Panier partiel = paniers.recevoir(panier.id(), grossiste.fournisseurId());
		assertThat(stock(ligne.cip13())).isEqualTo(stockAvant + ligne.quantite());
		assertThat(grossiste(partiel).recueLe()).isNotNull();

		Panier recu = partiel;
		for (CommandeFournisseur commande : partiel.commandes()) {
			if (commande.recueLe() == null) {
				recu = paniers.recevoir(panier.id(), commande.fournisseurId());
			}
		}
		assertThat(recu.statut()).isEqualTo(Panier.Statut.RECU);
		assertThat(recu.recuLe()).isNotNull();
		// Reçu : plus « en commande », et le stock couvre le besoin
		assertThat(previsions.prevoir(7, ligne.cip13()).enCommande()).isZero();
		assertThat(previsions.prevoir(7, ligne.cip13()).statut()).isNotEqualTo(Statut.RUPTURE_IMMINENTE);
		assertThatThrownBy(() -> paniers.recevoir(panier.id(), grossiste.fournisseurId())).isInstanceOf(Refus.class);
	}

	@Test
	void lHistoriqueContientLesCommandesPasseesDeLaDemo() {
		List<Panier> historique = paniers.historique();

		assertThat(historique).hasSizeGreaterThanOrEqualTo(3).allSatisfy(p -> assertThat(p.statut()).isEqualTo(Panier.Statut.RECU));
	}

	private int stock(String cip13) {
		return jdbc.sql("SELECT quantite FROM stock WHERE cip13 = ?").param(cip13).query(Integer.class).single();
	}

	private static CommandeFournisseur grossiste(Panier panier) {
		return panier.commandes().stream().filter(c -> c.typeFournisseur().equals("GROSSISTE")).findFirst().orElseThrow();
	}

	private static Ligne trouver(Panier panier, long ligneId) {
		return panier.commandes().stream().flatMap(c -> c.lignes().stream()).filter(l -> l.id() == ligneId).findFirst()
				.orElseThrow();
	}
}
