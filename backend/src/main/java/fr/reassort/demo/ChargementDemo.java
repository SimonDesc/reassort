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

	/**
	 * Trois commandes passées et reçues ces dernières semaines (labo, grossiste, dépositaire) : l'historique des
	 * commandes n'est pas vide au premier lancement. Déjà reçues, elles ne changent pas la prévision.
	 */
	private void historiqueDeCommandes() {
		record Passee(int ilYaJours, String fournisseur, int premier, int colis) {
		}
		for (Passee passee : List.of(
				new Passee(21, "labo-direct-occitanie", 0, 2),
				new Passee(14, "repartiteur-garonne", 6, 0),
				new Passee(7, "depositaire-sud-ouest", 12, 4))) {
			UUID id = UUID.randomUUID();
			Instant valide = horloge.instant().minus(passee.ilYaJours(), ChronoUnit.DAYS);
			Instant recu = valide.plus(passee.ilYaJours() == 21 ? 5 : passee.ilYaJours() == 7 ? 2 : 1, ChronoUnit.DAYS);
			jdbc.update("INSERT INTO panier (id, statut, horizon_jours, cree_le, valide_le, recu_le) VALUES (?, 'RECU', 14, ?, ?, ?)",
					id, Timestamp.from(valide), Timestamp.from(valide), Timestamp.from(recu));
			// Quantités : quelques colis (labo, dépositaire) ou une quantité ronde à l'unité (grossiste).
			jdbc.update("""
					INSERT INTO ligne_panier (panier_id, offre_id, quantite, prix_unitaire, statut_produit, quantite_suggeree,
					                          couverture_jours, livre_apres_rupture, recue_le)
					SELECT ?, o.id, q.quantite, o.prix_unitaire, 'A_COMMANDER', q.quantite, NULL, FALSE, ?
					FROM (SELECT o.*, row_number() OVER (ORDER BY o.cip13) AS rang FROM offre o WHERE o.fournisseur_id = ?) o
					CROSS JOIN LATERAL (SELECT CASE WHEN ? > 0 THEN o.colisage * ? ELSE 10 + (o.rang * 7) % 30 END AS quantite) q
					WHERE o.rang > ? AND o.rang <= ? + 6""",
					id, Timestamp.from(recu), passee.fournisseur(), passee.colis(), passee.colis(), passee.premier(),
					passee.premier());
		}
	}

	private long decalageVersHier(List<VenteDuJour> ventes) {
		LocalDate hier = LocalDate.now(horloge).minusDays(1);
		LocalDate derniere = ventes.stream().map(VenteDuJour::jour).max(Comparator.naturalOrder()).orElse(hier);
		return ChronoUnit.DAYS.between(derniere, hier);
	}
}
