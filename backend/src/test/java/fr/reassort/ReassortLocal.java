package fr.reassort;

import org.springframework.boot.SpringApplication;

/**
 * Lancement local avec PostgreSQL embarqué : ./mvnw spring-boot:test-run
 */
public class ReassortLocal {

	public static void main(String[] args) {
		SpringApplication.from(ReassortApplication::main).with(PostgresEmbarque.class).run(args);
	}
}
