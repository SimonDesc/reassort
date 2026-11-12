package fr.reassort;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresEmbarque.class)
class ReassortApplicationTests {

	@LocalServerPort
	int port;

	@Test
	void lApplicationDemarreEtRepondEnBonneSante() {
		String sante = RestClient.create("http://localhost:" + port)
				.get().uri("/actuator/health").retrieve().body(String.class);
		assertThat(sante).contains("UP");
	}
}
