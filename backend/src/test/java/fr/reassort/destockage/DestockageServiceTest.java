package fr.reassort.destockage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import fr.reassort.PostgresEmbarque;
import fr.reassort.ReassortApplication;
import fr.reassort.Refus;
import fr.reassort.demo.ChargementDemo;
import fr.reassort.destockage.DestockageService.Annonce;
import fr.reassort.destockage.DestockageService.Publication;
import fr.reassort.destockage.DestockageService.Suggestion;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class DestockageServiceTest {

	static final LocalDate DANS_UN_AN = LocalDate.now(ReassortApplication.FUSEAU).plusYears(1);

	@Autowired
	DestockageService destockage;

	@Autowired
	ChargementDemo demo;

	@LocalServerPort
	int port;

	@BeforeEach
	void rechargerLaDemo() {
		demo.reinitialiser();
	}

	@Test
	void laDemoProposeDeDestockerLesProduitsSurstockesEtDormants() {
		List<Suggestion> suggestions = destockage.suggestions();

		assertThat(suggestions).extracting(Suggestion::libelle).contains(
				"Mélatonine 1 mg, 30 comprimés", "Pansements hydrocolloïdes, boîte de 10",
				"Bandes de contention classe 2", "Desloratadine 5 mg, 30 comprimés");
		assertThat(suggestions).allSatisfy(s -> {
			assertThat(s.quantiteADestocker()).isPositive().isLessThanOrEqualTo(s.stock());
			assertThat(s.prixConseille()).isPositive();
			assertThat(s.annonce()).isNull();
		});
		assertThat(suggestions).extracting(Suggestion::quantiteADestocker).isSortedAccordingTo((a, b) -> b - a);
	}

	@Test
	void publierPuisRepublierMetAJourLAnnonce() {
		Suggestion melatonine = suggestion("Mélatonine 1 mg, 30 comprimés");

		destockage.publier(new Publication(melatonine.cip13(), 50, melatonine.prixConseille(), DANS_UN_AN));
		Annonce annonce = destockage.publier(new Publication(melatonine.cip13(), 80, new BigDecimal("4.00"), DANS_UN_AN));

		assertThat(destockage.annonces()).hasSize(1);
		assertThat(annonce.quantite()).isEqualTo(80);
		assertThat(annonce.montant()).isEqualByComparingTo("320.00");
		assertThat(suggestion("Mélatonine 1 mg, 30 comprimés").annonce()).isEqualTo(annonce);
	}

	@Test
	void refuseUnLotPlusGrandQueLeStock() {
		Suggestion bandes = suggestion("Bandes de contention classe 2");

		assertThatThrownBy(() -> destockage.publier(new Publication(bandes.cip13(), bandes.stock() + 1, BigDecimal.ONE, DANS_UN_AN)))
				.isInstanceOf(Refus.class)
				.hasMessageStartingWith("Quantité supérieure au stock");
	}

	@Test
	void refuseUnLotTropProcheDeLaPeremption() {
		Suggestion bandes = suggestion("Bandes de contention classe 2");
		LocalDate dansDeuxMois = LocalDate.now(ReassortApplication.FUSEAU).plusMonths(2);

		assertThatThrownBy(() -> destockage.publier(new Publication(bandes.cip13(), 1, BigDecimal.ONE, dansDeuxMois)))
				.isInstanceOf(Refus.class)
				.hasMessageStartingWith("Péremption trop proche");
	}

	@Test
	void lApiPublieRetireEtValideLaSaisie() {
		RestClient api = RestClient.create("http://localhost:" + port);
		Suggestion bandes = suggestion("Bandes de contention classe 2");

		Annonce annonce = api.post().uri("/api/destockage/annonces").contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("cip13", bandes.cip13(), "quantite", 10, "prixUnitaire", "8.50", "peremption", DANS_UN_AN.toString()))
				.retrieve().body(Annonce.class);
		assertThat(annonce.quantite()).isEqualTo(10);

		assertThatThrownBy(() -> api.post().uri("/api/destockage/annonces").contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("cip13", "123", "quantite", 0, "prixUnitaire", "0", "peremption", DANS_UN_AN.toString()))
				.retrieve().toBodilessEntity())
				.isInstanceOfSatisfying(HttpClientErrorException.class,
						e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

		api.delete().uri("/api/destockage/annonces/{id}", annonce.id()).retrieve().toBodilessEntity();
		assertThat(destockage.annonces()).isEmpty();
	}

	private Suggestion suggestion(String libelle) {
		return destockage.suggestions().stream().filter(s -> s.libelle().equals(libelle)).findFirst().orElseThrow();
	}
}
