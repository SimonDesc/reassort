package fr.reassort.prevision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import fr.reassort.prevision.CalculPrevision.Entree;
import fr.reassort.prevision.CalculPrevision.Parametres;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;

class CalculPrevisionTest {

	/** 28 jours d'historique, 3 jours de sécurité, commande pour 7 jours. */
	static final Parametres PARAMETRES = new Parametres(28, 3, 7);
	static final LocalDate AUJOURDHUI = LocalDate.of(2026, 11, 12);

	/** 56 ventes sur 28 jours : 2 par jour. */
	static Prevision prevoir(int stock, Integer delai) {
		return CalculPrevision.calculer(new Entree("3400999000017", "Paracétamol", stock, 56, 0, delai), PARAMETRES, AUJOURDHUI);
	}

	@Test
	void laCouvertureEstLeStockDiviseParLaVenteMoyenne() {
		Prevision prevision = prevoir(30, 1);

		assertThat(prevision.venteMoyenneParJour()).isEqualTo(2.0);
		assertThat(prevision.couvertureJours()).isEqualTo(15.0);
		assertThat(prevision.ruptureEstimeeLe()).isEqualTo(AUJOURDHUI.plusDays(15));
	}

	@ParameterizedTest(name = "stock {0}, délai {1} j : {2}")
	@CsvSource({
			// délai 1 j : urgence sous 4 j de couverture (8 boîtes), commande sous 11 j (22 boîtes)
			"0,  1, RUPTURE_IMMINENTE",
			"7,  1, RUPTURE_IMMINENTE",
			"8,  1, A_COMMANDER",
			"21, 1, A_COMMANDER",
			"22, 1, OK",
			// délai 5 j (labo en direct seulement) : les seuils reculent d'autant
			"14, 5, RUPTURE_IMMINENTE",
			"16, 5, A_COMMANDER",
			"30, 5, OK",
	})
	void leStatutDependDuDelaiDeLivraison(int stock, int delai, Statut attendu) {
		assertThat(prevoir(stock, delai).statut()).isEqualTo(attendu);
	}

	@Test
	void laQuantiteSuggereeCouvreHorizonDelaiEtSecuriteMoinsLeStock() {
		// besoin : 2 / jour × (7 + 1 + 3) = 22 boîtes ; stock 5 → 17 à commander
		assertThat(prevoir(5, 1).quantiteSuggeree()).isEqualTo(17);
	}

	@Test
	void uneCommandeEnCoursQuiCouvreLeBesoinPasseLeProduitEnCommande() {
		// besoin 22, stock 5, 17 déjà commandés : plus rien à proposer
		Prevision prevision = CalculPrevision.calculer(
				new Entree("3400999000017", "Paracétamol", 5, 56, 17, 1), PARAMETRES, AUJOURDHUI);

		assertThat(prevision.statut()).isEqualTo(Statut.COMMANDE);
		assertThat(prevision.quantiteSuggeree()).isZero();
	}

	@Test
	void uneCommandeEnCoursPartielleReduitLaQuantiteSuggeree() {
		Prevision prevision = CalculPrevision.calculer(
				new Entree("3400999000017", "Paracétamol", 5, 56, 10, 1), PARAMETRES, AUJOURDHUI);

		assertThat(prevision.statut()).isEqualTo(Statut.RUPTURE_IMMINENTE);
		assertThat(prevision.quantiteSuggeree()).isEqualTo(7);
	}

	@Test
	void unProduitBienCouvertNeSuggereRien() {
		assertThat(prevoir(100, 1).quantiteSuggeree()).isZero();
	}

	@Test
	void unProduitSansVenteNEstJamaisEnRupture() {
		Prevision prevision = CalculPrevision.calculer(new Entree("3400999000017", "Bandes", 0, 0, 0, 1), PARAMETRES, AUJOURDHUI);

		assertThat(prevision.statut()).isEqualTo(Statut.OK);
		assertThat(prevision.couvertureJours()).isNull();
		assertThat(prevision.quantiteSuggeree()).isZero();
	}

	@Test
	void auDelaDe90JoursDeCouvertureLeSurplusEstADestocker() {
		// 2 par jour, 200 en stock : 100 jours de couverture ; on garde 60 jours (120 boîtes), 80 à déstocker
		Prevision prevision = prevoir(200, 1);

		assertThat(prevision.statut()).isEqualTo(Statut.SURSTOCK);
		assertThat(prevision.quantiteADestocker()).isEqualTo(80);
		assertThat(prevision.quantiteSuggeree()).isZero();
	}

	@Test
	void jusquA90JoursDeCouvertureRienADestocker() {
		Prevision prevision = prevoir(180, 1);

		assertThat(prevision.statut()).isEqualTo(Statut.OK);
		assertThat(prevision.quantiteADestocker()).isZero();
	}

	@Test
	void unProduitQuiNeSeVendPlusEstEntierementADestocker() {
		Prevision prevision = CalculPrevision.calculer(new Entree("3400999000017", "Bandes", 14, 0, 0, 1), PARAMETRES, AUJOURDHUI);

		assertThat(prevision.statut()).isEqualTo(Statut.SURSTOCK);
		assertThat(prevision.quantiteADestocker()).isEqualTo(14);
	}

	@Test
	void sansOffreOnSupposeUneSemaineDeDelai() {
		// délai supposé 7 j : urgence sous 10 j de couverture (20 boîtes)
		assertThat(prevoir(19, null).statut()).isEqualTo(Statut.RUPTURE_IMMINENTE);
		assertThat(prevoir(19, null).delaiLePlusCourt()).isNull();
	}

	@Test
	void refuseDesParametresIncoherents() {
		assertThatThrownBy(() -> new Parametres(0, 3, 7)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new Parametres(28, 3, 0)).isInstanceOf(IllegalArgumentException.class);
	}
}
