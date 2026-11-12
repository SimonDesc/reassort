package fr.reassort.reglages;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.Refus;
import jakarta.validation.Valid;

@Service
public class ReglagesService {

	private final JdbcClient jdbc;

	ReglagesService(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Reglages lire() {
		return jdbc.sql("SELECT jours_historique, stock_securite_jours, surstock_jours, conserver_jours FROM reglages")
				.query((rs, i) -> new Reglages(rs.getInt(1), rs.getInt(2), rs.getInt(3), rs.getInt(4)))
				.single();
	}

	@Transactional
	public Reglages modifier(Reglages reglages) {
		if (reglages.conserverJours() > reglages.surstockJours()) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT,
					"Les jours de ventes à conserver ne peuvent pas dépasser le seuil de surstock.");
		}
		jdbc.sql("""
				UPDATE reglages SET jours_historique = ?, stock_securite_jours = ?, surstock_jours = ?, conserver_jours = ?""")
				.params(reglages.joursHistorique(), reglages.stockSecuriteJours(), reglages.surstockJours(),
						reglages.conserverJours())
				.update();
		return lire();
	}

	@RestController
	@RequestMapping("/api/reglages")
	static class Api {

		private final ReglagesService reglages;

		Api(ReglagesService reglages) {
			this.reglages = reglages;
		}

		@GetMapping
		Reglages lire() {
			return reglages.lire();
		}

		@PutMapping
		Reglages modifier(@Valid @RequestBody Reglages modifies) {
			return reglages.modifier(modifies);
		}
	}
}
