package fr.reassort.panier;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import fr.reassort.panier.ChoixOffre.Choix;
import fr.reassort.panier.ChoixOffre.Offre;

class ChoixOffreTest {

	static final LocalDate AUJOURDHUI = LocalDate.of(2026, 11, 12);
	static final Offre GROSSISTE = Offre.classique(1, "grossiste", "2.00", 1, 1);
	static final Offre DEPOSITAIRE = Offre.classique(2, "depositaire", "1.85", 3, 1);
	static final Offre LABO = Offre.classique(3, "labo", "1.60", 6, 12);
	static final List<Offre> OFFRES = List.of(GROSSISTE, DEPOSITAIRE, LABO);

	static Offre confrere(int disponible, LocalDate peremption) {
		return new Offre(4, "confrere", new BigDecimal("1.20"), 2, 1, disponible, peremption);
	}

	static Choix choisir(int besoin, double couverture, List<Offre> offres) {
		return ChoixOffre.choisir(besoin, couverture, offres, AUJOURDHUI).orElseThrow();
	}

	@Test
	void retientLaMoinsChereParmiCellesQuiArriventAvantLaRupture() {
		// 4 jours de couverture : le labo (6 j) arriverait trop tard, le dépositaire (3 j) est à temps et moins cher
		Choix choix = choisir(20, 4.0, OFFRES);

		assertThat(choix.offre()).isEqualTo(DEPOSITAIRE);
		assertThat(choix.quantite()).isEqualTo(20);
		assertThat(choix.montant()).isEqualByComparingTo("37.00");
		assertThat(choix.livreApresRupture()).isFalse();
	}

	@Test
	void avecDuTempsLeLaboEnDirectEstLeMoinsCher() {
		// 24 boîtes au labo : 38,40 € ; chez le dépositaire : 44,40 €
		Choix choix = choisir(24, 10.0, OFFRES);

		assertThat(choix.offre()).isEqualTo(LABO);
		assertThat(choix.montant()).isEqualByComparingTo("38.40");
	}

	@Test
	void comparerLeTotalEtNonLePrixUnitaire() {
		// Besoin de 3 : un carton de 12 au labo (19,20 €) coûte plus que 3 boîtes chez le dépositaire (5,55 €)
		Choix choix = choisir(3, 10.0, OFFRES);

		assertThat(choix.offre()).isEqualTo(DEPOSITAIRE);
		assertThat(choix.quantite()).isEqualTo(3);
	}

	@Test
	void siRienNArriveATempsPrendreLePlusRapideEtLeSignaler() {
		Choix choix = choisir(10, 0.5, OFFRES);

		assertThat(choix.offre()).isEqualTo(GROSSISTE);
		assertThat(choix.livreApresRupture()).isTrue();
	}

	@Test
	void unLotDeDestockageAssezGrandEtLoinDeLaPeremptionLEmporte() {
		Choix choix = choisir(20, 4.0, List.of(GROSSISTE, DEPOSITAIRE, confrere(30, AUJOURDHUI.plusMonths(8))));

		assertThat(choix.offre().fournisseurId()).isEqualTo("confrere");
		assertThat(choix.montant()).isEqualByComparingTo("24.00");
	}

	@Test
	void unLotTropPetitEstEcarte() {
		Choix choix = choisir(20, 4.0, List.of(GROSSISTE, DEPOSITAIRE, confrere(10, AUJOURDHUI.plusMonths(8))));

		assertThat(choix.offre()).isEqualTo(DEPOSITAIRE);
	}

	@Test
	void unLotTropProcheDeLaPeremptionEstEcarte() {
		// livré dans 2 jours, périmé dans 2 mois : moins de 3 mois pour écouler les boîtes
		Choix choix = choisir(20, 4.0, List.of(GROSSISTE, DEPOSITAIRE, confrere(30, AUJOURDHUI.plusMonths(2))));

		assertThat(choix.offre()).isEqualTo(DEPOSITAIRE);
	}

	@Test
	void sansBesoinOuSansOffreRienAChoisir() {
		assertThat(ChoixOffre.choisir(0, 2.0, OFFRES, AUJOURDHUI)).isEmpty();
		assertThat(ChoixOffre.choisir(10, 2.0, List.of(), AUJOURDHUI)).isEmpty();
	}

	@ParameterizedTest(name = "besoin {0}, colisage {1} : {2}")
	@CsvSource({ "1, 1, 1", "7, 6, 12", "12, 12, 12", "13, 12, 24" })
	void laQuantiteEstArrondieAuColisageSuperieur(int besoin, int colisage, int attendu) {
		assertThat(ChoixOffre.arrondirAuColisage(besoin, colisage)).isEqualTo(attendu);
	}
}
