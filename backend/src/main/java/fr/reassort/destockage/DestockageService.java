package fr.reassort.destockage;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import fr.reassort.Refus;
import fr.reassort.panier.ChoixOffre;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.prevision.PrevisionService;

/**
 * L'autre face de la marketplace : ce que la pharmacie a en trop, proposé à ses confrères.
 *
 * <p>La prévision repère le surstock (plus de 90 jours de couverture, ou un produit qui ne se vend plus) et la quantité
 * à céder ; le pharmacien publie l'annonce avec la date de péremption de son lot et son prix.
 */
@Service
public class DestockageService {

	/** Prix conseillé : 30 % sous la meilleure offre neuve de la marketplace, pour qu'un confrère y trouve son compte. */
	static final BigDecimal DECOTE_CONSEILLEE = new BigDecimal("0.70");

	private final JdbcClient jdbc;
	private final PrevisionService previsions;
	private final Clock horloge;

	DestockageService(JdbcClient jdbc, PrevisionService previsions, Clock horloge) {
		this.jdbc = jdbc;
		this.previsions = previsions;
		this.horloge = horloge;
	}

	public record Suggestion(
			String cip13,
			String libelle,
			int stock,
			double venteMoyenneParJour,
			Double couvertureJours,
			int quantiteADestocker,
			BigDecimal prixConseille,
			Annonce annonce) {
	}

	public record Annonce(long id, String cip13, String libelle, int quantite, BigDecimal prixUnitaire, BigDecimal montant,
			LocalDate peremption, Instant publieeLe) {
	}

	public record Publication(String cip13, int quantite, BigDecimal prixUnitaire, LocalDate peremption) {
	}

	/** Les produits en surstock, les plus gros surplus d'abord, avec l'annonce déjà publiée s'il y en a une. */
	public List<Suggestion> suggestions() {
		Map<String, Annonce> annonces = annonces().stream().collect(Collectors.toMap(Annonce::cip13, Function.identity()));
		Map<String, BigDecimal> meilleursPrix = jdbc.sql("""
				SELECT o.cip13, min(o.prix_unitaire) AS prix
				FROM offre o JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE f.type <> 'CONFRERE'
				GROUP BY o.cip13""")
				.query((rs, i) -> Map.entry(rs.getString("cip13"), rs.getBigDecimal("prix")))
				.list().stream()
				.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

		return previsions.prevoir(7).stream()
				.filter(p -> p.statut() == Statut.SURSTOCK)
				.sorted((a, b) -> Integer.compare(b.quantiteADestocker(), a.quantiteADestocker()))
				.map((Prevision p) -> new Suggestion(p.cip13(), p.libelle(), p.stock(), p.venteMoyenneParJour(),
						p.couvertureJours(), p.quantiteADestocker(), prixConseille(meilleursPrix.get(p.cip13())),
						annonces.get(p.cip13())))
				.toList();
	}

	/** Publie le lot, ou met à jour l'annonce déjà publiée pour ce produit. */
	@Transactional
	public Annonce publier(Publication publication) {
		Integer stock = jdbc.sql("SELECT quantite FROM stock WHERE cip13 = ?")
				.param(publication.cip13())
				.query(Integer.class)
				.optional()
				.orElseThrow(() -> new Refus(HttpStatus.NOT_FOUND, "Produit inconnu : " + publication.cip13()));
		if (publication.quantite() > stock) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT,
					"Quantité supérieure au stock : " + publication.quantite() + " demandées, " + stock + " en stock.");
		}
		LocalDate peremptionMinimale = LocalDate.now(horloge).plusMonths(ChoixOffre.MOIS_AVANT_PEREMPTION);
		if (publication.peremption().isBefore(peremptionMinimale)) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT, "Péremption trop proche : un confrère n'achète pas un lot "
					+ "à moins de " + ChoixOffre.MOIS_AVANT_PEREMPTION + " mois de sa péremption.");
		}

		jdbc.sql("""
				INSERT INTO annonce_destockage (cip13, quantite, prix_unitaire, peremption, publiee_le)
				VALUES (:cip13, :quantite, :prix, :peremption, :maintenant)
				ON CONFLICT (cip13) DO UPDATE
				SET quantite = :quantite, prix_unitaire = :prix, peremption = :peremption, publiee_le = :maintenant""")
				.param("cip13", publication.cip13())
				.param("quantite", publication.quantite())
				.param("prix", publication.prixUnitaire().setScale(2, RoundingMode.HALF_UP))
				.param("peremption", publication.peremption())
				.param("maintenant", Timestamp.from(horloge.instant()))
				.update();
		return annonces().stream().filter(a -> a.cip13().equals(publication.cip13())).findFirst().orElseThrow();
	}

	public List<Annonce> annonces() {
		return jdbc.sql("""
				SELECT a.id, a.cip13, p.libelle, a.quantite, a.prix_unitaire, a.peremption, a.publiee_le
				FROM annonce_destockage a JOIN produit p ON p.cip13 = a.cip13
				ORDER BY a.publiee_le DESC""")
				.query((rs, i) -> {
					BigDecimal prix = rs.getBigDecimal("prix_unitaire");
					int quantite = rs.getInt("quantite");
					return new Annonce(rs.getLong("id"), rs.getString("cip13"), rs.getString("libelle"), quantite, prix,
							prix.multiply(BigDecimal.valueOf(quantite)), rs.getObject("peremption", LocalDate.class),
							rs.getTimestamp("publiee_le").toInstant());
				})
				.list();
	}

	@Transactional
	public void retirer(long id) {
		if (jdbc.sql("DELETE FROM annonce_destockage WHERE id = ?").param(id).update() == 0) {
			throw new Refus(HttpStatus.NOT_FOUND, "Annonce introuvable : " + id);
		}
	}

	private static BigDecimal prixConseille(BigDecimal meilleurPrix) {
		return meilleurPrix == null ? null : meilleurPrix.multiply(DECOTE_CONSEILLEE).setScale(2, RoundingMode.HALF_UP);
	}
}
