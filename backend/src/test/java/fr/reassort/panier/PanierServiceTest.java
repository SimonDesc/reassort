package fr.reassort.panier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import fr.reassort.PostgresEmbarque;
import fr.reassort.demo.ChargementDemo;
import fr.reassort.panier.Panier.CommandeFournisseur;
import fr.reassort.panier.Panier.Ligne;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.prevision.PrevisionService;

/** Sur le jeu de démo, rechargé avant chaque test. */
@SpringBootTest
@Import(PostgresEmbarque.class)
class PanierServiceTest {

	@Autowired
	PanierService paniers;

	@Autowired
	PrevisionService previsions;

	@Autowired
	ChargementDemo demo;

	@BeforeEach
	void rechargerLaDemo() {
		demo.reinitialiser();
	}

	@Test
	void lePanierContientUneLignePourChaqueProduitACommander() {
		long aCommander = previsions.prevoir(7).stream().filter(p -> p.quantiteSuggeree() > 0).count();

		Panier panier = paniers.proposer(7);

		assertThat(panier.statut()).isEqualTo(Panier.Statut.BROUILLON);
		assertThat(panier.nombreLignes()).isEqualTo(aCommander);
		assertThat(lignes(panier)).allSatisfy(l -> assertThat(l.quantite()).isGreaterThanOrEqualTo(l.quantiteSuggeree()));
	}

	@Test
	void lesRupturesImminentesPartentChezLeGrossisteLivreLeLendemain() {
		Panier panier = paniers.proposer(7);

		assertThat(lignes(panier))
				.filteredOn(l -> l.statutProduit() == Statut.RUPTURE_IMMINENTE)
				.isNotEmpty()
				.allSatisfy(l -> assertThat(l.delaiJours()).isEqualTo(1));
	}

	@Test
	void lesLotsDeDestockageDUnConfrereSontRetenusQuandIlsConviennent() {
		Panier panier = paniers.proposer(7);

		CommandeFournisseur confrere = panier.commandes().stream()
				.filter(c -> c.typeFournisseur().equals("CONFRERE")).findFirst().orElseThrow();
		assertThat(confrere.lignes()).extracting(Ligne::libelle)
				.contains("Paracétamol 500 mg, 16 gélules")
				// Salbutamol : lot trop proche de la péremption ; Lopéramide : lot trop petit
				.doesNotContain("Salbutamol 100 µg, inhalateur 200 doses", "Lopéramide 2 mg, 12 gélules");
	}

	@Test
	void chaqueCommandeDitCeQuiManquePourLeFranco() {
		Panier panier = paniers.proposer(7);

		assertThat(panier.commandes()).allSatisfy(c -> assertThat(c.resteAvantFranco())
				.isEqualByComparingTo(c.franco().subtract(c.sousTotal()).max(java.math.BigDecimal.ZERO)));
		assertThat(panier.total()).isEqualByComparingTo(panier.commandes().stream()
				.map(CommandeFournisseur::sousTotal).reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add));
	}

	@Test
	void unNouveauBrouillonRemplaceLePrecedent() {
		Panier premier = paniers.proposer(7);
		Panier second = paniers.proposer(14);

		assertThatThrownBy(() -> paniers.lire(premier.id())).isInstanceOf(PanierService.PanierIntrouvable.class);
		assertThat(paniers.dernier()).get().extracting(Panier::id).isEqualTo(second.id());
	}

	@Test
	void apresValidationLesProduitsCommandesNeSontPlusProposes() {
		Panier panier = paniers.valider(paniers.proposer(7).id());

		assertThat(panier.statut()).isEqualTo(Panier.Statut.VALIDE);
		assertThat(panier.valideLe()).isNotNull();

		List<Prevision> apres = previsions.prevoir(7);
		assertThat(apres).filteredOn(p -> p.quantiteSuggeree() > 0).isEmpty();
		assertThat(apres).filteredOn(p -> p.statut() == Statut.COMMANDE).hasSize(panier.nombreLignes());

		assertThat(paniers.proposer(7).nombreLignes()).isZero();
	}

	@Test
	void unPanierNeSeValideQuUneFois() {
		Panier panier = paniers.proposer(7);
		paniers.valider(panier.id());

		assertThatThrownBy(() -> paniers.valider(panier.id())).isInstanceOf(PanierService.PanierDejaValide.class);
	}

	private static List<Ligne> lignes(Panier panier) {
		return panier.commandes().stream().flatMap(c -> c.lignes().stream()).toList();
	}
}
