package fr.reassort.produit;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.ReassortApplication;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.PrevisionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Tout ce qu'il faut savoir d'un produit pour décider : ventes, prévision, offres comparées, commandes en cours. */
@RestController
@RequestMapping("/api/produits")
class FicheProduitController {

	static final int JOURS_DE_VENTES = 90;

	private final JdbcClient jdbc;
	private final PrevisionService previsions;
	private final Clock horloge;

	FicheProduitController(JdbcClient jdbc, PrevisionService previsions, Clock horloge) {
		this.jdbc = jdbc;
		this.previsions = previsions;
		this.horloge = horloge;
	}

	record VenteJour(LocalDate jour, int quantite) {
	}

	record OffreProduit(long id, String fournisseurId, String fournisseur, String typeFournisseur, BigDecimal prixUnitaire,
			int delaiJours, int colisage, Integer quantiteDisponible, LocalDate peremption, BigDecimal franco) {
	}

	record CommandeEnCours(String panierId, String fournisseur, int quantite, Instant valideLe, LocalDate livraisonPrevueLe) {
	}

	record FicheProduit(Prevision prevision, List<VenteJour> ventes, List<OffreProduit> offres,
			List<CommandeEnCours> enCommande) {
	}

	/** Les offres de plusieurs produits d'un coup : de quoi changer de fournisseur dans le panier. */
	@GetMapping("/offres")
	java.util.Map<String, List<OffreProduit>> offres(@RequestParam List<String> cip13) {
		return cip13.stream().distinct().collect(java.util.stream.Collectors.toMap(c -> c, this::offresDe));
	}

	private List<OffreProduit> offresDe(String cip13) {
		return jdbc.sql("""
				SELECT o.id, f.id AS fournisseur_id, f.nom, f.type, o.prix_unitaire, o.delai_jours, o.colisage,
				       o.quantite_disponible, o.peremption, f.franco
				FROM offre o JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE o.cip13 = ?
				ORDER BY o.prix_unitaire""")
				.param(cip13)
				.query((rs, i) -> new OffreProduit(rs.getLong("id"), rs.getString("fournisseur_id"), rs.getString("nom"),
						rs.getString("type"), rs.getBigDecimal("prix_unitaire"), rs.getInt("delai_jours"), rs.getInt("colisage"),
						rs.getObject("quantite_disponible", Integer.class), rs.getObject("peremption", LocalDate.class),
						rs.getBigDecimal("franco")))
				.list();
	}

	@GetMapping("/{cip13}")
	FicheProduit fiche(@PathVariable String cip13, @RequestParam(defaultValue = "7") @Min(1) @Max(60) int horizon) {
		Prevision prevision = previsions.prevoir(horizon, cip13);
		LocalDate hier = LocalDate.now(horloge).minusDays(1);

		// Une valeur par jour, zéro compris (dimanches, jours sans vente) : la courbe se lit sans trou.
		List<VenteJour> ventes = jdbc.sql("""
				SELECT j.jour::date AS jour, coalesce(v.quantite, 0) AS quantite
				FROM generate_series(CAST(:debut AS DATE), CAST(:fin AS DATE), INTERVAL '1 day') AS j(jour)
				LEFT JOIN vente v ON v.jour = j.jour::date AND v.cip13 = :cip13
				ORDER BY j.jour""")
				.param("debut", hier.minusDays(JOURS_DE_VENTES - 1))
				.param("fin", hier)
				.param("cip13", cip13)
				.query((rs, i) -> new VenteJour(rs.getObject("jour", LocalDate.class), rs.getInt("quantite")))
				.list();

		List<OffreProduit> offres = offresDe(cip13);

		List<CommandeEnCours> enCommande = jdbc.sql("""
				SELECT pa.id, f.nom, l.quantite, pa.valide_le, o.delai_jours
				FROM ligne_panier l
				JOIN panier pa ON pa.id = l.panier_id
				JOIN offre o ON o.id = l.offre_id
				JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE o.cip13 = ? AND pa.statut = 'VALIDE' AND l.recue_le IS NULL
				ORDER BY pa.valide_le""")
				.param(cip13)
				.query((rs, i) -> {
					Instant valide = rs.getTimestamp("valide_le").toInstant();
					return new CommandeEnCours(rs.getString("id"), rs.getString("nom"), rs.getInt("quantite"), valide,
							LocalDate.ofInstant(valide, ReassortApplication.FUSEAU).plusDays(rs.getInt("delai_jours")));
				})
				.list();

		return new FicheProduit(prevision, ventes, offres, enCommande);
	}
}
