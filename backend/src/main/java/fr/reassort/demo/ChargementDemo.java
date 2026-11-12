package fr.reassort.demo;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

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
		jdbc.execute("TRUNCATE ligne_panier, panier, offre, fournisseur, vente, stock, produit");

		DonneesOfficine donnees = officine.lire();
		List<VenteDuJour> ventes = recalerSurHier(donnees.ventes());
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
				List.of("cip13", "fournisseur", "prix_unitaire", "delai_jours", "colisage"), v -> v);
		jdbc.batchUpdate("""
				INSERT INTO offre (cip13, fournisseur_id, prix_unitaire, delai_jours, colisage)
				VALUES (?, ?, ?, ?, ?)""", offres, 500,
				(ps, v) -> {
					ps.setString(1, v[0]);
					ps.setString(2, v[1]);
					ps.setBigDecimal(3, new BigDecimal(v[2]));
					ps.setInt(4, Integer.parseInt(v[3]));
					ps.setInt(5, Integer.parseInt(v[4]));
				});

		LOG.info("Démo chargée : {} produits, {} lignes de ventes, {} fournisseurs, {} offres",
				donnees.stock().size(), ventes.size(), fournisseurs.size(), offres.size());
	}

	private List<VenteDuJour> recalerSurHier(List<VenteDuJour> ventes) {
		LocalDate hier = LocalDate.now(horloge).minusDays(1);
		LocalDate derniere = ventes.stream().map(VenteDuJour::jour).max(Comparator.naturalOrder()).orElse(hier);
		long decalage = ChronoUnit.DAYS.between(derniere, hier);
		return ventes.stream()
				.map(v -> new VenteDuJour(v.jour().plusDays(decalage), v.cip13(), v.quantite()))
				.toList();
	}
}
