package fr.reassort.demo;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import fr.reassort.officine.LecteurCsv;
import fr.reassort.officine.SourceOfficine;
import fr.reassort.officine.SourceOfficine.DonneesOfficine;
import fr.reassort.officine.SourceOfficine.VenteDuJour;
import fr.reassort.officine.SourceOfficineCsv;

/**
 * Charge le jeu de démonstration : une pharmacie fictive (ventes et stock, via {@link SourceOfficine}) et le catalogue
 * de la marketplace (fournisseurs et offres). Les ventes sont recalées pour finir la veille : la démo reste à jour.
 */
@Service
public class ChargementDemo {

	private static final Logger LOG = LoggerFactory.getLogger(ChargementDemo.class);
	private static final String DOSSIER = "demo/";

	private final JdbcTemplate jdbc;
	private final Clock horloge;
	private final SourceOfficine officine = new SourceOfficineCsv(
			new ClassPathResource(DOSSIER + "stock.csv"), new ClassPathResource(DOSSIER + "ventes.csv"));

	ChargementDemo(JdbcTemplate jdbc, Clock horloge) {
		this.jdbc = jdbc;
		this.horloge = horloge;
	}

	public boolean estVide() {
		return jdbc.queryForObject("SELECT count(*) FROM produit", Integer.class) == 0;
	}

	/** Efface tout (paniers compris) et recharge la démo. */
	@Transactional
	public void reinitialiser() {
		jdbc.execute("TRUNCATE annonce_destockage, ligne_panier, panier, offre, fournisseur, vente, stock, produit");

		DonneesOfficine donnees = officine.lire();
		long decalage = decalageVersHier(donnees.ventes());
		List<VenteDuJour> ventes = donnees.ventes().stream()
				.map(v -> new VenteDuJour(v.jour().plusDays(decalage), v.cip13(), v.quantite()))
				.toList();
		Timestamp releve = Timestamp.from(horloge.instant());

		jdbc.batchUpdate("INSERT INTO produit (cip13, libelle) VALUES (?, ?)", donnees.stock(), 500,
				(ps, p) -> {
					ps.setString(1, p.cip13());
					ps.setString(2, p.libelle());
				});
		jdbc.batchUpdate("INSERT INTO stock (cip13, quantite, releve_le) VALUES (?, ?, ?)", donnees.stock(), 500,
				(ps, p) -> {
					ps.setString(1, p.cip13());
					ps.setInt(2, p.quantite());
					ps.setTimestamp(3, releve);
				});
		jdbc.batchUpdate("INSERT INTO vente (cip13, jour, quantite) VALUES (?, ?, ?)", ventes, 1000,
				(ps, v) -> {
					ps.setString(1, v.cip13());
					ps.setObject(2, v.jour());
					ps.setInt(3, v.quantite());
				});

		var fournisseurs = LecteurCsv.lire(new ClassPathResource(DOSSIER + "fournisseurs.csv"),
				List.of("id", "nom", "type", "franco"), v -> v);
		jdbc.batchUpdate("INSERT INTO fournisseur (id, nom, type, franco) VALUES (?, ?, ?, ?)", fournisseurs, 100,
				(ps, v) -> {
					ps.setString(1, v[0]);
					ps.setString(2, v[1]);
					ps.setString(3, v[2]);
					ps.setBigDecimal(4, new BigDecimal(v[3]));
				});

		var offres = LecteurCsv.lire(new ClassPathResource(DOSSIER + "offres.csv"),
				List.of("cip13", "fournisseur", "prix_unitaire", "delai_jours", "colisage", "quantite_disponible", "peremption"),
				v -> v);
		jdbc.batchUpdate("""
				INSERT INTO offre (cip13, fournisseur_id, prix_unitaire, delai_jours, colisage, quantite_disponible, peremption)
				VALUES (?, ?, ?, ?, ?, ?, ?)""", offres, 500,
				(ps, v) -> {
					ps.setString(1, v[0]);
					ps.setString(2, v[1]);
					ps.setBigDecimal(3, new BigDecimal(v[2]));
					ps.setInt(4, Integer.parseInt(v[3]));
					ps.setInt(5, Integer.parseInt(v[4]));
					ps.setObject(6, v[5].isEmpty() ? null : Integer.valueOf(v[5]));
					// Les péremptions des lots se décalent avec les ventes : la démo garde les mêmes écarts.
					ps.setObject(7, v[6].isEmpty() ? null : LocalDate.parse(v[6]).plusDays(decalage));
				});

		jdbc.update("UPDATE reglages SET jours_historique = 28, stock_securite_jours = 3, surstock_jours = 90, conserver_jours = 60");
		historiqueDeCommandes();

		LOG.info("Démo chargée : {} produits, {} lignes de ventes, {} fournisseurs, {} offres",
				donnees.stock().size(), ventes.size(), fournisseurs.size(), offres.size());
	}

	/** Nombre de semaines de commandes passées : un historique d'achats aussi long que celui des ventes. */
	static final int SEMAINES_HISTORIQUE = 12;

	/**
	 * Douze semaines de commandes passées et reçues, une par semaine : chacune remplace ce qui s'est vendu les sept
	 * jours d'avant, chaque produit chez son fournisseur habituel le moins cher (hors déstockage), arrondi au colis. Les
	 * cartons arrivent après le délai annoncé, parfois avec un jour de retard. Déjà reçues, ces commandes ne changent ni
	 * le stock relevé ni la prévision ; elles nourrissent les statistiques d'achat.
	 */
	private void historiqueDeCommandes() {
		for (int semaine = SEMAINES_HISTORIQUE; semaine >= 1; semaine--) {
			UUID id = UUID.randomUUID();
			Instant valide = horloge.instant().truncatedTo(ChronoUnit.DAYS).minus(7L * semaine, ChronoUnit.DAYS)
					.plus(9, ChronoUnit.HOURS);
			LocalDate veille = LocalDate.ofInstant(valide, fr.reassort.ReassortApplication.FUSEAU).minusDays(1);
			jdbc.update("INSERT INTO panier (id, statut, horizon_jours, cree_le, valide_le, recu_le) VALUES (?, 'RECU', 7, ?, ?, ?)",
					id, Timestamp.from(valide), Timestamp.from(valide), Timestamp.from(valide));
			jdbc.update("""
					INSERT INTO ligne_panier (panier_id, offre_id, quantite, prix_unitaire, statut_produit, quantite_suggeree,
					                          couverture_jours, livre_apres_rupture, recue_le)
					SELECT ?, o.id, CAST(ceil(v.total::numeric / o.colisage) AS INTEGER) * o.colisage, o.prix_unitaire,
					       'A_COMMANDER', v.total, NULL, FALSE,
					       -- Reçue au plus tard maintenant : une commande récente n'arrive pas « demain » dans l'historique.
					       LEAST(CAST(? AS TIMESTAMPTZ) + make_interval(days => o.delai_jours
					           + CASE WHEN abs(hashtext(o.fournisseur_id || ?)) % 4 = 0 THEN 1 ELSE 0 END), CAST(? AS TIMESTAMPTZ))
					FROM (SELECT cip13, sum(quantite) AS total FROM vente
					      WHERE jour > CAST(? AS DATE) - 7 AND jour <= CAST(? AS DATE)
					      GROUP BY cip13 HAVING sum(quantite) > 0) v
					CROSS JOIN LATERAL (
					    SELECT o.* FROM offre o JOIN fournisseur f ON f.id = o.fournisseur_id
					    WHERE o.cip13 = v.cip13 AND f.type <> 'CONFRERE'
					    ORDER BY o.prix_unitaire, o.delai_jours LIMIT 1) o""",
					id, Timestamp.from(valide), String.valueOf(semaine), Timestamp.from(horloge.instant()), veille, veille);
			jdbc.update("UPDATE panier SET recu_le = (SELECT max(recue_le) FROM ligne_panier WHERE panier_id = ?) WHERE id = ?",
					id, id);
		}
	}

	private long decalageVersHier(List<VenteDuJour> ventes) {
		LocalDate hier = LocalDate.now(horloge).minusDays(1);
		LocalDate derniere = ventes.stream().map(VenteDuJour::jour).max(Comparator.naturalOrder()).orElse(hier);
		return ChronoUnit.DAYS.between(derniere, hier);
	}
}
