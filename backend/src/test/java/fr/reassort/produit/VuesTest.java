package fr.reassort.produit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import fr.reassort.demo.ChargementDemo;
import fr.reassort.produit.FicheProduitController.FicheProduit;
import fr.reassort.produit.TableauDeBordController.TableauDeBord;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.reglages.Reglages;

/** Les vues de l'interface : tableau de bord, fiche produit, réglages. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class VuesTest {

	@LocalServerPort
	int port;

	@Autowired
	ChargementDemo demo;

	RestClient api;

	@BeforeEach
	void preparer() {
		demo.reinitialiser();
		api = RestClient.create("http://localhost:" + port);
	}

	@Test
	void leTableauDeBordResumeLaPharmacie() {
		TableauDeBord tableau = api.get().uri("/api/tableau-de-bord").retrieve().body(TableauDeBord.class);

		assertThat(tableau.produitsParStatut().values().stream().mapToLong(Long::longValue).sum()).isEqualTo(40);
		assertThat(tableau.produitsParStatut().get(Statut.RUPTURE_IMMINENTE)).isPositive();
		assertThat(tableau.valeurStock()).isPositive();
		assertThat(tableau.valeurSurstock()).isPositive();
		assertThat(tableau.ventesParJour()).hasSize(90);
		assertThat(tableau.achatsParFournisseur()).hasSize(3);
		assertThat(tableau.economies90Jours()).isPositive();
		assertThat(tableau.urgences()).isNotEmpty();
	}

	@Test
	void laFicheProduitDonneVentesOffresEtPrevision() {
		FicheProduit fiche = api.get().uri("/api/produits/3400999000024").retrieve().body(FicheProduit.class);

		assertThat(fiche.prevision().libelle()).isEqualTo("Paracétamol 500 mg, 16 gélules");
		assertThat(fiche.ventes()).hasSize(90);
		assertThat(fiche.offres()).extracting(FicheProduitController.OffreProduit::typeFournisseur)
				.contains("GROSSISTE", "CONFRERE");
		assertThat(fiche.enCommande()).isEmpty();
	}

	@Test
	void lesOffresDePlusieursProduitsArriventEnUnAppel() {
		Map<String, java.util.List<?>> offres = api.get()
				.uri("/api/produits/offres?cip13=3400999000024&cip13=3400999000024&cip13=3400999999999").retrieve()
				.body(new org.springframework.core.ParameterizedTypeReference<Map<String, java.util.List<?>>>() {
				});

		assertThat(offres).containsOnlyKeys("3400999000024", "3400999999999");
		assertThat(offres.get("3400999000024")).hasSizeGreaterThan(1);
		assertThat(offres.get("3400999999999")).isEmpty();
	}

	@Test
	void unProduitInconnuRenvoie404() {
		assertThatThrownBy(() -> api.get().uri("/api/produits/3400999999999").retrieve().toBodilessEntity())
				.isInstanceOfSatisfying(HttpClientErrorException.class,
						e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
	}

	@Test
	void lesReglagesSeModifientEtChangentLaPrevision() {
		long rupturesAvant = rupturesImminentes();

		Reglages plusDeSecurite = api.put().uri("/api/reglages").contentType(MediaType.APPLICATION_JSON)
				.body(new Reglages(28, 10, 90, 60)).retrieve().body(Reglages.class);

		assertThat(plusDeSecurite.stockSecuriteJours()).isEqualTo(10);
		assertThat(rupturesImminentes()).isGreaterThan(rupturesAvant);

		assertThatThrownBy(() -> api.put().uri("/api/reglages").contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("joursHistorique", 28, "stockSecuriteJours", 3, "surstockJours", 60, "conserverJours", 90))
				.retrieve().toBodilessEntity())
				.isInstanceOfSatisfying(HttpClientErrorException.class,
						e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT));
	}

	private long rupturesImminentes() {
		return api.get().uri("/api/tableau-de-bord").retrieve().body(TableauDeBord.class)
				.produitsParStatut().get(Statut.RUPTURE_IMMINENTE);
	}
}
