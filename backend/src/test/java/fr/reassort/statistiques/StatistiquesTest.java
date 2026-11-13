package fr.reassort.statistiques;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import fr.reassort.PostgresEmbarque;
import fr.reassort.demo.ChargementDemo;
import fr.reassort.statistiques.StatistiquesController.Statistiques;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class StatistiquesTest {

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

	private Statistiques lire(int semaines) {
		return api.get().uri("/api/statistiques?semaines={s}", semaines).retrieve().body(Statistiques.class);
	}

	@Test
	void quatreSemainesSeComparentAuxQuatrePrecedentes() {
		Statistiques stats = lire(4);

		assertThat(stats.parSemaine()).hasSize(4);
		assertThat(stats.parJour()).hasSize(28);
		assertThat(stats.parJour().stream().map(StatistiquesController.Jour::consommation).reduce(BigDecimal.ZERO, BigDecimal::add))
				.isEqualByComparingTo(stats.synthese().consommation().valeur());
		assertThat(stats.comparable()).isTrue();
		assertThat(stats.synthese().boitesVendues().valeur()).isPositive();
		assertThat(stats.synthese().boitesVendues().avant()).isPositive();
		assertThat(stats.produits()).hasSize(40);
		assertThat(stats.produits().getFirst().consommation()).isGreaterThanOrEqualTo(stats.produits().getLast().consommation());
		assertThat(stats.produits()).allSatisfy(p -> assertThat(p.parSemaine()).hasSize(4));
	}

	@Test
	void lesReassortsSuiventLaConsommation() {
		Statistiques stats = lire(4);
		BigDecimal consommation = stats.synthese().consommation().valeur();
		BigDecimal achats = stats.synthese().achats().valeur();

		// La démo réassortit chaque semaine ce qui s'est vendu : achats et consommation restent du même ordre.
		assertThat(achats).isBetween(consommation.multiply(BigDecimal.valueOf(0.6)), consommation.multiply(BigDecimal.valueOf(1.5)));
		assertThat(stats.synthese().commandes().valeur()).isEqualByComparingTo("4");
		assertThat(stats.fournisseurs()).isNotEmpty().allSatisfy(f -> {
			assertThat(f.recues()).isEqualTo(f.livraisons());
			assertThat(f.delaiReel()).isGreaterThanOrEqualTo(f.delaiAnnonce());
		});
		assertThat(stats.synthese().livraisonsALHeure()).isBetween(0, 100);
	}

	@Test
	void douzeSemainesNeSeComparentPasFauteDHistorique() {
		Statistiques stats = lire(12);

		assertThat(stats.comparable()).isFalse();
		assertThat(stats.synthese().boitesVendues().avant()).isNull();
		assertThat(stats.produits()).allSatisfy(p -> assertThat(p.venduesAvant()).isNull());
	}

	@Test
	void unePeriodeHorsListeEstRefusee() {
		assertThatThrownBy(() -> lire(5)).isInstanceOfSatisfying(HttpClientErrorException.class,
				e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT));
	}
}
