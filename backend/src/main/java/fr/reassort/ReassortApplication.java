package fr.reassort;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ReassortApplication {

	public static final ZoneId FUSEAU = ZoneId.of("Europe/Paris");

	public static void main(String[] args) {
		SpringApplication.run(ReassortApplication.class, args);
	}

	/** L'heure de l'officine : injectée partout où « aujourd'hui » compte, pour pouvoir la fixer en test. */
	@Bean
	Clock horloge() {
		return Clock.system(FUSEAU);
	}
}
