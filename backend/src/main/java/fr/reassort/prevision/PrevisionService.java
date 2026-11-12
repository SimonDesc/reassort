package fr.reassort.prevision;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import fr.reassort.Refus;
import fr.reassort.prevision.CalculPrevision.Entree;
import fr.reassort.prevision.CalculPrevision.Parametres;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.reglages.Reglages;
import fr.reassort.reglages.ReglagesService;

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
	private final ReglagesService reglages;

	PrevisionService(JdbcClient jdbc, Clock horloge, ReglagesService reglages) {
		this.jdbc = jdbc;
		this.horloge = horloge;
		this.reglages = reglages;
	}

	public List<Prevision> prevoir(int horizonJours) {
		return calculer(horizonJours, null);
	}

	/** La prévision d'un seul produit (fiche produit), avec les mêmes réglages. */
	public Prevision prevoir(int horizonJours, String cip13) {
		return calculer(horizonJours, cip13).stream().findFirst()
				.orElseThrow(() -> new Refus(HttpStatus.NOT_FOUND, "Produit inconnu : " + cip13));
	}

	private List<Prevision> calculer(int horizonJours, String filtreCip13) {
		LocalDate aujourdhui = LocalDate.now(horloge);
		Reglages r = reglages.lire();
		int joursHistorique = r.joursHistorique();
		Parametres parametres = new Parametres(joursHistorique, r.stockSecuriteJours(), horizonJours, r.surstockJours(),
				r.conserverJours());

		List<Entree> produits = jdbc.sql("""
				SELECT p.cip13, p.libelle, s.quantite AS stock,
				       coalesce((SELECT sum(v.quantite) FROM vente v
				                 WHERE v.cip13 = p.cip13 AND v.jour >= :debut AND v.jour < :aujourdhui), 0) AS ventes,
				       coalesce((SELECT sum(l.quantite) FROM ligne_panier l
				                 JOIN panier pa ON pa.id = l.panier_id
				                 JOIN offre o ON o.id = l.offre_id
				                 WHERE o.cip13 = p.cip13 AND pa.statut = 'VALIDE' AND l.recue_le IS NULL), 0) AS en_commande,
				       (SELECT min(o.delai_jours) FROM offre o WHERE o.cip13 = p.cip13) AS delai
				FROM produit p
				JOIN stock s ON s.cip13 = p.cip13
				WHERE CAST(:cip13 AS CHAR(13)) IS NULL OR p.cip13 = :cip13
				""")
				.param("cip13", filtreCip13)
				.param("debut", aujourdhui.minusDays(joursHistorique))
				.param("aujourdhui", aujourdhui)
				.query((rs, i) -> new Entree(
						rs.getString("cip13"),
						rs.getString("libelle"),
						rs.getInt("stock"),
						rs.getInt("ventes"),
						rs.getInt("en_commande"),
						rs.getObject("delai", Integer.class)))
				.list();

		return produits.stream()
				.map(produit -> CalculPrevision.calculer(produit, parametres, aujourdhui))
				.sorted(URGENCE)
				.toList();
	}
}
