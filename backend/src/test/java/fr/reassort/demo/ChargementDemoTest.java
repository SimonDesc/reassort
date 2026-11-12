package fr.reassort.demo;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

import fr.reassort.PostgresEmbarque;
import fr.reassort.ReassortApplication;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class ChargementDemoTest {

	@LocalServerPort
	int port;

	@Test
	void laDemoSeChargeAuDemarrageAvecDesVentesQuiFinissentHier() {
		DemoController.Resume resume = api().get().uri("/api/demo/resume").retrieve().body(DemoController.Resume.class);

		assertThat(resume.produits()).isEqualTo(40);
		assertThat(resume.fournisseurs()).isEqualTo(4);
		assertThat(resume.offres()).isGreaterThan(40);
		assertThat(resume.derniereVente()).isEqualTo(LocalDate.now(ReassortApplication.FUSEAU).minusDays(1));
		assertThat(resume.premiereVente()).isEqualTo(resume.derniereVente().minusDays(89));
	}

	@Test
	void laReinitialisationRechargeLaMemeDemo() {
		DemoController.Resume avant = api().get().uri("/api/demo/resume").retrieve().body(DemoController.Resume.class);
		DemoController.Resume apres = api().post().uri("/api/demo/reinitialiser").retrieve().body(DemoController.Resume.class);

		assertThat(apres.produits()).isEqualTo(avant.produits());
		assertThat(apres.offres()).isEqualTo(avant.offres());
		assertThat(apres.derniereVente()).isEqualTo(avant.derniereVente());
	}

	private RestClient api() {
		return RestClient.create("http://localhost:" + port);
	}
}
