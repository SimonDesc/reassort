package fr.reassort.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpRequest;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import fr.reassort.PostgresEmbarque;
import fr.reassort.demo.ChargementDemo;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema.CallToolRequest;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import io.modelcontextprotocol.spec.McpSchema.TextContent;
import io.modelcontextprotocol.spec.McpSchema.Tool;

/** Un vrai client MCP, en HTTP streamable, contre le serveur démarré avec un jeton. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "reassort.mcp.jeton=secret-de-test")
@Import(PostgresEmbarque.class)
class ServeurMcpTest {

	@LocalServerPort
	int port;

	@Autowired
	ChargementDemo demo;

	McpSyncClient client;

	@BeforeEach
	void connecter() {
		demo.reinitialiser();
		client = client("secret-de-test");
		client.initialize();
	}

	@AfterEach
	void fermer() {
		client.close();
	}

	@Test
	void laDemoDonneLeJetonPourBrancherUnAssistant() throws Exception {
		var reponse = java.net.http.HttpClient.newHttpClient().send(
				HttpRequest.newBuilder(java.net.URI.create("http://localhost:" + port + "/api/mcp/connexion")).build(),
				java.net.http.HttpResponse.BodyHandlers.ofString());

		assertThat(reponse.statusCode()).isEqualTo(200);
		assertThat(reponse.body()).isEqualTo("{\"jeton\":\"secret-de-test\"}");
	}

	@Test
	void lesCinqOutilsSontExposesAvecLeursIndicationsDeRisque() {
		Map<String, Tool> outils = client.listTools().tools().stream()
				.collect(java.util.stream.Collectors.toMap(Tool::name, t -> t));

		assertThat(outils).containsOnlyKeys("ruptures_a_venir", "proposer_panier", "valider_panier",
				"produits_a_destocker", "publier_annonce_destockage");
		assertThat(outils.get("ruptures_a_venir").annotations().readOnlyHint()).isTrue();
		assertThat(outils.get("valider_panier").annotations().destructiveHint()).isTrue();
	}

	@Test
	void claudePeutProposerPuisValiderLePanier() {
		CallToolResult ruptures = appeler("ruptures_a_venir", Map.of("horizonJours", 7));
		assertThat(texte(ruptures)).contains("RUPTURE_IMMINENTE", "Sérum physiologique");

		CallToolResult propose = appeler("proposer_panier", Map.of("horizonJours", 14));
		assertThat(texte(propose)).contains("BROUILLON", "Confrère · Toulouse Nord");
		String panierId = texte(propose).replaceAll("(?s).*?\"id\"\\s*:\\s*\"([0-9a-f-]{36})\".*", "$1");

		CallToolResult valide = appeler("valider_panier", Map.of("panierId", panierId));
		assertThat(valide.isError()).isNotEqualTo(Boolean.TRUE);
		assertThat(texte(valide)).contains("VALIDE");

		CallToolResult encore = appeler("valider_panier", Map.of("panierId", panierId));
		assertThat(encore.isError()).isTrue();
		assertThat(texte(encore)).contains("déjà validé");
	}

	@Test
	void unePeremptionTropProcheRevientCommeUneErreurLisible() {
		CallToolResult resultat = appeler("publier_annonce_destockage",
				Map.of("cip13", "3400999000406", "quantite", 10, "prixUnitaire", 4.5, "peremption", "2020-01-01"));

		assertThat(resultat.isError()).isTrue();
		assertThat(texte(resultat)).contains("Péremption trop proche");
	}

	@Test
	void sansLeBonJetonLeServeurRefuseLaConnexion() {
		try (McpSyncClient intrus = client("mauvais-jeton")) {
			assertThatThrownBy(intrus::initialize).isInstanceOf(RuntimeException.class);
		}
	}

	private CallToolResult appeler(String outil, Map<String, Object> arguments) {
		return client.callTool(new CallToolRequest(outil, arguments));
	}

	private static String texte(CallToolResult resultat) {
		return resultat.content().stream()
				.filter(TextContent.class::isInstance)
				.map(c -> ((TextContent) c).text())
				.reduce("", String::concat);
	}

	private McpSyncClient client(String jeton) {
		var transport = HttpClientStreamableHttpTransport.builder("http://localhost:" + port)
				.endpoint("/mcp")
				.requestBuilder(HttpRequest.newBuilder().header("Authorization", "Bearer " + jeton))
				.build();
		return McpClient.sync(transport).requestTimeout(java.time.Duration.ofSeconds(20)).build();
	}
}
