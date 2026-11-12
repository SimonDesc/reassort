package fr.reassort;

import java.io.IOException;
import java.io.UncheckedIOException;

import javax.sql.DataSource;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;

/**
 * PostgreSQL embarqué pour les tests et le lancement local : aucun Docker ni installation.
 * En production, la base vient des variables DB_URL, DB_USER et DB_PASSWORD.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresEmbarque {

	@Bean(destroyMethod = "close")
	EmbeddedPostgres embeddedPostgres() {
		try {
			return EmbeddedPostgres.builder().start();
		} catch (IOException e) {
			throw new UncheckedIOException("Démarrage de PostgreSQL embarqué impossible", e);
		}
	}

	@Bean
	DataSource dataSource(EmbeddedPostgres postgres) {
		return postgres.getPostgresDatabase();
	}
}
