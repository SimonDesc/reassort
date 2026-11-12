package fr.reassort.demo;

import java.time.Instant;
import java.time.LocalDate;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/demo")
class DemoController {

	private final ChargementDemo chargement;
	private final JdbcTemplate jdbc;

	DemoController(ChargementDemo chargement, JdbcTemplate jdbc) {
		this.chargement = chargement;
		this.jdbc = jdbc;
	}

	/** Ce que contient la base : de quoi dire au pharmacien sur quelles données porte la prévision. */
	@GetMapping("/resume")
	Resume resume() {
		return jdbc.queryForObject("""
				SELECT (SELECT count(*) FROM produit)     AS produits,
				       (SELECT count(*) FROM fournisseur) AS fournisseurs,
				       (SELECT count(*) FROM offre)       AS offres,
				       (SELECT min(jour) FROM vente)      AS premiere_vente,
				       (SELECT max(jour) FROM vente)      AS derniere_vente,
				       (SELECT max(releve_le) FROM stock) AS stock_releve_le
				""", (rs, i) -> new Resume(
				rs.getInt("produits"),
				rs.getInt("fournisseurs"),
				rs.getInt("offres"),
				rs.getObject("premiere_vente", LocalDate.class),
				rs.getObject("derniere_vente", LocalDate.class),
				rs.getTimestamp("stock_releve_le") == null ? null : rs.getTimestamp("stock_releve_le").toInstant()));
	}

	@PostMapping("/reinitialiser")
	Resume reinitialiser() {
		chargement.reinitialiser();
		return resume();
	}

	record Resume(int produits, int fournisseurs, int offres, LocalDate premiereVente, LocalDate derniereVente,
			Instant stockReleveLe) {
	}

	@Configuration(proxyBeanMethods = false)
	static class DemarrageDemo {

		/** Base vide au démarrage : la démo se charge seule, la première visite montre déjà des données. */
		@Bean
		@ConditionalOnBooleanProperty(name = "reassort.demo.au-demarrage", matchIfMissing = true)
		ApplicationRunner chargerLaDemoSiVide(ChargementDemo chargement) {
			return (ApplicationArguments args) -> {
				if (chargement.estVide()) {
					chargement.reinitialiser();
				}
			};
		}
	}
}
