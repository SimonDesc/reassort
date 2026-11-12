package fr.reassort.prevision;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

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
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;

/** Sur le jeu de démo, chargé au démarrage. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class PrevisionServiceTest {

	@Autowired
	PrevisionService service;

	@Autowired
	ChargementDemo demo;

	@LocalServerPort
	int port;

	/** La base est partagée entre classes de test : repartir de la démo, sans panier validé. */
	@BeforeEach
	void rechargerLaDemo() {
		demo.reinitialiser();
	}

	@Test
	void laDemoMontreDesRupturesDesProduitsACommanderEtDesProduitsCouverts() {
		Map<Statut, Long> parStatut = service.prevoir(7).stream()
				.collect(Collectors.groupingBy(Prevision::statut, Collectors.counting()));

		assertThat(parStatut.get(Statut.RUPTURE_IMMINENTE)).isBetween(5L, 12L);
		assertThat(parStatut.get(Statut.A_COMMANDER)).isBetween(5L, 15L);
		assertThat(parStatut.get(Statut.OK)).isGreaterThan(15L);
	}

	@Test
	void lesPlusUrgentsSontEnTete() {
		List<Prevision> previsions = service.prevoir(7);

		assertThat(previsions).extracting(Prevision::statut).isSortedAccordingTo(Enum::compareTo);
		assertThat(previsions).hasSize(40);
	}

	@Test
	void unHorizonPlusLongFaitCommanderPlusDeProduits() {
		Map<String, Prevision> semaine = indexer(service.prevoir(7));
		Map<String, Prevision> mois = indexer(service.prevoir(30));

		long aCommanderSemaine = semaine.values().stream().filter(p -> p.quantiteSuggeree() > 0).count();
		long aCommanderMois = mois.values().stream().filter(p -> p.quantiteSuggeree() > 0).count();
		assertThat(aCommanderMois).isGreaterThan(aCommanderSemaine);
	}

	@Test
	void lApiRefuseUnHorizonHorsLimites() {
		RestClient api = RestClient.create("http://localhost:" + port);

		assertThat(api.get().uri("/api/previsions?horizon=7").retrieve().body(Prevision[].class)).hasSize(40);
		try {
			api.get().uri("/api/previsions?horizon=0").retrieve().toBodilessEntity();
		} catch (HttpClientErrorException e) {
			assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
			return;
		}
		throw new AssertionError("horizon=0 aurait dû être refusé");
	}

	private static Map<String, Prevision> indexer(List<Prevision> previsions) {
		return previsions.stream().collect(Collectors.toMap(Prevision::cip13, Function.identity()));
	}
}
