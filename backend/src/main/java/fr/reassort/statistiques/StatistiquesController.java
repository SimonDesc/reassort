package fr.reassort.statistiques;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.Refus;

/**
 * La consommation de l'officine et ses réassorts sur une période de semaines entières finissant hier, comparées à la
 * période précédente de même durée quand l'historique la couvre. La consommation est valorisée au prix d'achat le plus
 * bas hors déstockage, pour se lire en face des achats.
 */
@RestController
@RequestMapping("/api/statistiques")
class StatistiquesController {

	private static final List<Integer> SEMAINES_PERMISES = List.of(4, 6, 12);
	private static final String JOUR_COMMANDE = "(pa.valide_le AT TIME ZONE 'Europe/Paris')::date";

	private final JdbcClient jdbc;
	private final Clock horloge;

	StatistiquesController(JdbcClient jdbc, Clock horloge) {
		this.jdbc = jdbc;
		this.horloge = horloge;
	}

	/** Une valeur sur la période, et sur la précédente quand l'historique la couvre (sinon {@code null}). */
	record Comparaison(BigDecimal valeur, BigDecimal avant) {
	}

	record Synthese(Comparaison boitesVendues, Comparaison consommation, Comparaison achats, Comparaison commandes,
			BigDecimal delaiAnnonce, BigDecimal delaiReel, Integer livraisonsALHeure, int livraisons) {
	}

	record Semaine(LocalDate debut, LocalDate fin, int boitesVendues, BigDecimal consommation, int boitesAchetees,
			BigDecimal achats) {
	}

	/** Un jour de la période : consommation valorisée et réassort commandé ce jour-là. */
	record Jour(LocalDate jour, BigDecimal consommation, BigDecimal achats) {
	}

	record ProduitStat(String cip13, String libelle, int vendues, Integer venduesAvant, int achetees, int stock,
			BigDecimal consommation, List<Integer> parSemaine) {
	}

	record FournisseurStat(String fournisseur, String typeFournisseur, int livraisons, int boites, BigDecimal montant,
			BigDecimal delaiAnnonce, BigDecimal delaiReel, int aLHeure, int recues) {
	}

	record Statistiques(LocalDate debut, LocalDate fin, int semaines, boolean comparable, Synthese synthese,
			List<Semaine> parSemaine, List<Jour> parJour, List<ProduitStat> produits, List<FournisseurStat> fournisseurs) {
	}

	@GetMapping
	Statistiques statistiques(@RequestParam(defaultValue = "4") int semaines) {
		if (!SEMAINES_PERMISES.contains(semaines)) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT, "Période possible : 4, 6 ou 12 semaines.");
		}
		LocalDate fin = LocalDate.now(horloge).minusDays(1);
		LocalDate debut = fin.minusDays(7L * semaines - 1);
		LocalDate finAvant = debut.minusDays(1);
		LocalDate debutAvant = finAvant.minusDays(7L * semaines - 1);
		LocalDate premiereVente = jdbc.sql("SELECT min(jour) FROM vente").query(LocalDate.class).optional().orElse(debut);
		boolean comparable = !debutAvant.isBefore(premiereVente);

		Map<String, BigDecimal> prix = new HashMap<>();
		jdbc.sql("""
				SELECT o.cip13, min(o.prix_unitaire) FROM offre o JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE f.type <> 'CONFRERE' GROUP BY o.cip13""")
				.query((rs, i) -> prix.put(rs.getString(1), rs.getBigDecimal(2))).list();

		// Ventes par produit et par semaine (0 = la plus ancienne), et sur la période précédente.
		Map<String, int[]> ventesParSemaine = new HashMap<>();
		jdbc.sql("SELECT cip13, (CAST(:fin AS DATE) - jour) / 7, sum(quantite) FROM vente WHERE jour BETWEEN :debut AND :fin GROUP BY 1, 2")
				.param("debut", debut).param("fin", fin)
				.query((rs, i) -> {
					ventesParSemaine.computeIfAbsent(rs.getString(1), c -> new int[semaines])[semaines - 1 - rs.getInt(2)] = rs.getInt(3);
					return null;
				}).list();
		Map<String, Integer> ventesAvant = new HashMap<>();
		jdbc.sql("SELECT cip13, sum(quantite) FROM vente WHERE jour BETWEEN :debut AND :fin GROUP BY cip13")
				.param("debut", debutAvant).param("fin", finAvant)
				.query((rs, i) -> ventesAvant.put(rs.getString(1), rs.getInt(2))).list();

		// Achats : lignes des paniers validés, datées du jour de la commande.
		Map<String, Integer> acheteesParProduit = new HashMap<>();
		int[] boitesAcheteesParSemaine = new int[semaines];
		BigDecimal[] achatsParSemaine = zeros(semaines);
		jdbc.sql("""
				SELECT o.cip13, (CAST(:fin AS DATE) - %s) / 7, sum(l.quantite), sum(l.quantite * l.prix_unitaire)
				FROM panier pa JOIN ligne_panier l ON l.panier_id = pa.id JOIN offre o ON o.id = l.offre_id
				WHERE pa.statut IN ('VALIDE', 'RECU') AND %s BETWEEN :debut AND :fin
				GROUP BY 1, 2""".formatted(JOUR_COMMANDE, JOUR_COMMANDE))
				.param("debut", debut).param("fin", fin)
				.query((rs, i) -> {
					int s = semaines - 1 - rs.getInt(2);
					acheteesParProduit.merge(rs.getString(1), rs.getInt(3), Integer::sum);
					boitesAcheteesParSemaine[s] += rs.getInt(3);
					achatsParSemaine[s] = achatsParSemaine[s].add(rs.getBigDecimal(4));
					return null;
				}).list();
		record Totaux(BigDecimal montant, int commandes) {
		}
		Totaux achatsAvant = jdbc.sql("""
				SELECT coalesce(sum(l.quantite * l.prix_unitaire), 0), count(DISTINCT pa.id)
				FROM panier pa JOIN ligne_panier l ON l.panier_id = pa.id
				WHERE pa.statut IN ('VALIDE', 'RECU') AND %s BETWEEN :debut AND :fin""".formatted(JOUR_COMMANDE))
				.param("debut", debutAvant).param("fin", finAvant)
				.query((rs, i) -> new Totaux(rs.getBigDecimal(1), rs.getInt(2))).single();
		int commandes = jdbc.sql("SELECT count(*) FROM panier pa WHERE pa.statut IN ('VALIDE', 'RECU') AND %s BETWEEN :debut AND :fin"
				.formatted(JOUR_COMMANDE))
				.param("debut", debut).param("fin", fin).query(Integer.class).single();

		// Produits : tous ceux du catalogue de l'officine, du plus consommé au moins consommé.
		List<ProduitStat> produits = jdbc.sql("""
				SELECT p.cip13, p.libelle, coalesce(s.quantite, 0) FROM produit p LEFT JOIN stock s ON s.cip13 = p.cip13""")
				.query((rs, i) -> {
					String cip13 = rs.getString(1);
					int[] parSemaine = ventesParSemaine.getOrDefault(cip13, new int[semaines]);
					int vendues = IntStream.of(parSemaine).sum();
					return new ProduitStat(cip13, rs.getString(2), vendues, comparable ? ventesAvant.getOrDefault(cip13, 0) : null,
							acheteesParProduit.getOrDefault(cip13, 0), rs.getInt(3), valoriser(prix, cip13, vendues),
							IntStream.of(parSemaine).boxed().toList());
				})
				.list().stream()
				.sorted((a, b) -> b.consommation().compareTo(a.consommation()))
				.toList();

		List<Semaine> parSemaine = IntStream.range(0, semaines).mapToObj(s -> {
			LocalDate debutSemaine = debut.plusDays(7L * s);
			int vendues = produits.stream().mapToInt(p -> p.parSemaine().get(s)).sum();
			BigDecimal consommation = produits.stream().map(p -> valoriser(prix, p.cip13(), p.parSemaine().get(s)))
					.reduce(BigDecimal.ZERO, BigDecimal::add);
			return new Semaine(debutSemaine, debutSemaine.plusDays(6), vendues, consommation, boitesAcheteesParSemaine[s],
					achatsParSemaine[s].setScale(2, RoundingMode.HALF_UP));
		}).toList();

		List<FournisseurStat> fournisseurs = jdbc.sql("""
				WITH livraison AS (
				    SELECT pa.id, f.nom, f.type, sum(l.quantite) AS boites, sum(l.quantite * l.prix_unitaire) AS montant,
				           max(o.delai_jours) AS annonce,
				           (max(l.recue_le) AT TIME ZONE 'Europe/Paris')::date - %s AS reel
				    FROM panier pa
				    JOIN ligne_panier l ON l.panier_id = pa.id
				    JOIN offre o ON o.id = l.offre_id
				    JOIN fournisseur f ON f.id = o.fournisseur_id
				    WHERE pa.statut IN ('VALIDE', 'RECU') AND %s BETWEEN :debut AND :fin
				    GROUP BY pa.id, pa.valide_le, f.nom, f.type
				    HAVING bool_and(l.recue_le IS NOT NULL) OR bool_and(l.recue_le IS NULL))
				SELECT nom, type, count(*), sum(boites), sum(montant), avg(annonce), avg(reel),
				       count(*) FILTER (WHERE reel <= annonce), count(reel)
				FROM livraison GROUP BY nom, type ORDER BY 5 DESC""".formatted(JOUR_COMMANDE, JOUR_COMMANDE))
				.param("debut", debut).param("fin", fin)
				.query((rs, i) -> new FournisseurStat(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(4),
						rs.getBigDecimal(5), arrondi(rs.getBigDecimal(6)), arrondi(rs.getBigDecimal(7)), rs.getInt(8), rs.getInt(9)))
				.list();

		// Jour par jour, pour suivre consommation et réassort cumulés sur la période.
		List<Jour> parJour = jdbc.sql("""
				SELECT j.jour::date,
				       coalesce((SELECT sum(v.quantite * px.prix) FROM vente v
				                 JOIN (SELECT o.cip13, min(o.prix_unitaire) AS prix FROM offre o
				                       JOIN fournisseur f ON f.id = o.fournisseur_id WHERE f.type <> 'CONFRERE' GROUP BY o.cip13) px
				                   ON px.cip13 = v.cip13
				                 WHERE v.jour = j.jour::date), 0),
				       coalesce((SELECT sum(l.quantite * l.prix_unitaire) FROM panier pa JOIN ligne_panier l ON l.panier_id = pa.id
				                 WHERE pa.statut IN ('VALIDE', 'RECU') AND %s = j.jour::date), 0)
				FROM generate_series(CAST(:debut AS DATE), CAST(:fin AS DATE), INTERVAL '1 day') AS j(jour)
				ORDER BY 1""".formatted(JOUR_COMMANDE))
				.param("debut", debut).param("fin", fin)
				.query((rs, i) -> new Jour(rs.getObject(1, LocalDate.class), rs.getBigDecimal(2).setScale(2, RoundingMode.HALF_UP),
						rs.getBigDecimal(3).setScale(2, RoundingMode.HALF_UP)))
				.list();

		int livraisons = fournisseurs.stream().mapToInt(FournisseurStat::livraisons).sum();
		int recues = fournisseurs.stream().mapToInt(FournisseurStat::recues).sum();
		int aLHeure = fournisseurs.stream().mapToInt(FournisseurStat::aLHeure).sum();
		Synthese synthese = new Synthese(
				new Comparaison(BigDecimal.valueOf(produits.stream().mapToInt(ProduitStat::vendues).sum()),
						comparable ? BigDecimal.valueOf(ventesAvant.values().stream().mapToInt(Integer::intValue).sum()) : null),
				new Comparaison(parSemaine.stream().map(Semaine::consommation).reduce(BigDecimal.ZERO, BigDecimal::add),
						comparable ? ventesAvant.entrySet().stream().map(e -> valoriser(prix, e.getKey(), e.getValue()))
								.reduce(BigDecimal.ZERO, BigDecimal::add) : null),
				new Comparaison(parSemaine.stream().map(Semaine::achats).reduce(BigDecimal.ZERO, BigDecimal::add),
						comparable ? achatsAvant.montant() : null),
				new Comparaison(BigDecimal.valueOf(commandes), comparable ? BigDecimal.valueOf(achatsAvant.commandes()) : null),
				moyenne(fournisseurs, true), moyenne(fournisseurs, false),
				recues == 0 ? null : Math.round(100f * aLHeure / recues), livraisons);

		return new Statistiques(debut, fin, semaines, comparable, synthese, parSemaine, parJour, produits, fournisseurs);
	}

	private static BigDecimal valoriser(Map<String, BigDecimal> prix, String cip13, int quantite) {
		return prix.getOrDefault(cip13, BigDecimal.ZERO).multiply(BigDecimal.valueOf(quantite)).setScale(2, RoundingMode.HALF_UP);
	}

	private static BigDecimal[] zeros(int n) {
		BigDecimal[] t = new BigDecimal[n];
		java.util.Arrays.fill(t, BigDecimal.ZERO);
		return t;
	}

	private static BigDecimal arrondi(BigDecimal valeur) {
		return valeur == null ? null : valeur.setScale(1, RoundingMode.HALF_UP);
	}

	/** Délai moyen pondéré par le nombre de livraisons de chaque fournisseur : annoncé, ou constaté à la réception. */
	private static BigDecimal moyenne(List<FournisseurStat> fournisseurs, boolean annonce) {
		BigDecimal somme = BigDecimal.ZERO;
		int nombre = 0;
		for (FournisseurStat f : fournisseurs) {
			BigDecimal delai = annonce ? f.delaiAnnonce() : f.delaiReel();
			int poids = annonce ? f.livraisons() : f.recues();
			if (delai != null && poids > 0) {
				somme = somme.add(delai.multiply(BigDecimal.valueOf(poids)));
				nombre += poids;
			}
		}
		return nombre == 0 ? null : somme.divide(BigDecimal.valueOf(nombre), 1, RoundingMode.HALF_UP);
	}
}
