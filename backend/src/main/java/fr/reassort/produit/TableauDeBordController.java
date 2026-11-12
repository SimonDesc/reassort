package fr.reassort.produit;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.produit.FicheProduitController.VenteJour;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.prevision.PrevisionService;

/**
 * La vue d'ensemble de la pharmacie : ce qui presse, ce que vaut le stock, ce qui dort, ce que la marketplace a fait
 * économiser. Les montants de stock sont valorisés au prix d'achat de référence (meilleure offre neuve).
 */
@RestController
@RequestMapping("/api/tableau-de-bord")
class TableauDeBordController {

	private final JdbcClient jdbc;
	private final PrevisionService previsions;
	private final Clock horloge;

	TableauDeBordController(JdbcClient jdbc, PrevisionService previsions, Clock horloge) {
		this.jdbc = jdbc;
		this.previsions = previsions;
		this.horloge = horloge;
	}

	record AchatsFournisseur(String fournisseur, String typeFournisseur, BigDecimal montant, int commandes) {
	}

	record TableauDeBord(
			Map<Statut, Long> produitsParStatut,
			BigDecimal valeurStock,
			BigDecimal valeurSurstock,
			int commandesEnCours,
			BigDecimal montantEnCours,
			BigDecimal achats90Jours,
			/** Ce qu'auraient coûté les mêmes achats au prix du grossiste, moins ce qu'ils ont coûté. */
			BigDecimal economies90Jours,
			List<VenteJour> ventesParJour,
			List<AchatsFournisseur> achatsParFournisseur,
			List<Prevision> urgences) {
	}

	@GetMapping
	TableauDeBord tableau() {
		List<Prevision> toutes = previsions.prevoir(7);
		LocalDate hier = LocalDate.now(horloge).minusDays(1);

		Map<Statut, Long> parStatut = new EnumMap<>(Statut.class);
		for (Statut statut : Statut.values()) {
			parStatut.put(statut, toutes.stream().filter(p -> p.statut() == statut).count());
		}

		Map<String, BigDecimal> prixReference = jdbc.sql("""
				SELECT o.cip13, min(o.prix_unitaire) FROM offre o JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE f.type <> 'CONFRERE' GROUP BY o.cip13""")
				.query((rs, i) -> Map.entry(rs.getString(1), rs.getBigDecimal(2)))
				.list().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
		Function<Prevision, BigDecimal> prix = p -> prixReference.getOrDefault(p.cip13(), BigDecimal.ZERO);
		BigDecimal valeurStock = toutes.stream()
				.map(p -> prix.apply(p).multiply(BigDecimal.valueOf(p.stock())))
				.reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
		BigDecimal valeurSurstock = toutes.stream()
				.map(p -> prix.apply(p).multiply(BigDecimal.valueOf(p.quantiteADestocker())))
				.reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);

		record EnCours(int commandes, BigDecimal montant) {
		}
		EnCours enCours = jdbc.sql("""
				SELECT count(DISTINCT pa.id), coalesce(sum(l.quantite * l.prix_unitaire), 0)
				FROM panier pa JOIN ligne_panier l ON l.panier_id = pa.id
				WHERE pa.statut = 'VALIDE' AND l.recue_le IS NULL""")
				.query((rs, i) -> new EnCours(rs.getInt(1), rs.getBigDecimal(2)))
				.single();

		List<VenteJour> ventes = jdbc.sql("""
				SELECT j.jour::date, coalesce(sum(v.quantite), 0)
				FROM generate_series(CAST(:debut AS DATE), CAST(:fin AS DATE), INTERVAL '1 day') AS j(jour)
				LEFT JOIN vente v ON v.jour = j.jour::date
				GROUP BY j.jour ORDER BY j.jour""")
				.param("debut", hier.minusDays(FicheProduitController.JOURS_DE_VENTES - 1))
				.param("fin", hier)
				.query((rs, i) -> new VenteJour(rs.getObject(1, LocalDate.class), rs.getInt(2)))
				.list();

		List<AchatsFournisseur> achats = jdbc.sql("""
				SELECT f.nom, f.type, sum(l.quantite * l.prix_unitaire), count(DISTINCT pa.id)
				FROM panier pa
				JOIN ligne_panier l ON l.panier_id = pa.id
				JOIN offre o ON o.id = l.offre_id
				JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE pa.statut IN ('VALIDE', 'RECU') AND pa.valide_le >= now() - INTERVAL '90 days'
				GROUP BY f.nom, f.type ORDER BY 3 DESC""")
				.query((rs, i) -> new AchatsFournisseur(rs.getString(1), rs.getString(2), rs.getBigDecimal(3), rs.getInt(4)))
				.list();
		BigDecimal achats90 = achats.stream().map(AchatsFournisseur::montant).reduce(BigDecimal.ZERO, BigDecimal::add);

		BigDecimal economies = jdbc.sql("""
				SELECT coalesce(sum(l.quantite * (g.prix_unitaire - l.prix_unitaire)), 0)
				FROM panier pa
				JOIN ligne_panier l ON l.panier_id = pa.id
				JOIN offre o ON o.id = l.offre_id
				JOIN offre g ON g.cip13 = o.cip13 AND g.fournisseur_id = 'repartiteur-garonne'
				WHERE pa.statut IN ('VALIDE', 'RECU') AND pa.valide_le >= now() - INTERVAL '90 days'""")
				.query(BigDecimal.class)
				.single();

		List<Prevision> urgences = toutes.stream()
				.filter(p -> p.statut() == Statut.RUPTURE_IMMINENTE || p.statut() == Statut.A_COMMANDER)
				.limit(6)
				.toList();

		return new TableauDeBord(parStatut, valeurStock, valeurSurstock, enCours.commandes(), enCours.montant(), achats90,
				economies, ventes, achats, urgences);
	}
}
