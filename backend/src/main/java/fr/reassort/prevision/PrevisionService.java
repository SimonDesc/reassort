package fr.reassort.prevision;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import fr.reassort.prevision.CalculPrevision.Entree;
import fr.reassort.prevision.CalculPrevision.Parametres;
import fr.reassort.prevision.CalculPrevision.Prevision;

/** Prévision de tous les produits suivis : une requête pour les données, {@link CalculPrevision} pour la règle. */
@Service
public class PrevisionService {

	/** Les plus urgents d'abord : statut, puis couverture la plus courte. */
	private static final Comparator<Prevision> URGENCE = Comparator
			.comparing(Prevision::statut)
			.thenComparing(Prevision::couvertureJours, Comparator.nullsLast(Comparator.naturalOrder()))
			.thenComparing(Prevision::libelle);

	private final JdbcClient jdbc;
	private final Clock horloge;
	private final int joursHistorique;
	private final int stockSecuriteJours;

	PrevisionService(JdbcClient jdbc, Clock horloge,
			@Value("${reassort.prevision.jours-historique:28}") int joursHistorique,
			@Value("${reassort.prevision.stock-securite-jours:3}") int stockSecuriteJours) {
		this.jdbc = jdbc;
		this.horloge = horloge;
		this.joursHistorique = joursHistorique;
		this.stockSecuriteJours = stockSecuriteJours;
	}

	public List<Prevision> prevoir(int horizonJours) {
		LocalDate aujourdhui = LocalDate.now(horloge);
		Parametres parametres = new Parametres(joursHistorique, stockSecuriteJours, horizonJours);

		List<Entree> produits = jdbc.sql("""
				SELECT p.cip13, p.libelle, s.quantite AS stock,
				       coalesce((SELECT sum(v.quantite) FROM vente v
				                 WHERE v.cip13 = p.cip13 AND v.jour >= :debut AND v.jour < :aujourdhui), 0) AS ventes,
				       (SELECT min(o.delai_jours) FROM offre o WHERE o.cip13 = p.cip13) AS delai
				FROM produit p
				JOIN stock s ON s.cip13 = p.cip13
				""")
				.param("debut", aujourdhui.minusDays(joursHistorique))
				.param("aujourdhui", aujourdhui)
				.query((rs, i) -> new Entree(
						rs.getString("cip13"),
						rs.getString("libelle"),
						rs.getInt("stock"),
						rs.getInt("ventes"),
						rs.getObject("delai", Integer.class)))
				.list();

		return produits.stream()
				.map(produit -> CalculPrevision.calculer(produit, parametres, aujourdhui))
				.sorted(URGENCE)
				.toList();
	}
}
