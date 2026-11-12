package fr.reassort.panier;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import fr.reassort.ReassortApplication;
import fr.reassort.Refus;
import fr.reassort.panier.ChoixOffre.Choix;
import fr.reassort.panier.ChoixOffre.Offre;
import fr.reassort.panier.Panier.CommandeFournisseur;
import fr.reassort.panier.Panier.Ligne;
import fr.reassort.prevision.CalculPrevision;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.PrevisionService;

/**
 * Proposer un panier à partir de la prévision, le relire, le valider.
 *
 * <p>Un seul brouillon à la fois : en proposer un nouveau remplace le précédent. Un panier validé ne change plus ; ses
 * quantités comptent ensuite comme « en commande » dans la prévision jusqu'à leur livraison.
 */
@Service
public class PanierService {

	private static final Logger LOG = LoggerFactory.getLogger(PanierService.class);

	private final JdbcClient jdbc;
	private final PrevisionService previsions;
	private final ApplicationEventPublisher evenements;
	private final Clock horloge;

	PanierService(JdbcClient jdbc, PrevisionService previsions, ApplicationEventPublisher evenements, Clock horloge) {
		this.jdbc = jdbc;
		this.previsions = previsions;
		this.evenements = evenements;
		this.horloge = horloge;
	}

	@Transactional
	public Panier proposer(int horizonJours) {
		LocalDate aujourdhui = LocalDate.now(horloge);
		jdbc.sql("DELETE FROM panier WHERE statut = 'BROUILLON'").update();

		UUID id = UUID.randomUUID();
		jdbc.sql("INSERT INTO panier (id, statut, horizon_jours, cree_le) VALUES (?, 'BROUILLON', ?, ?)")
				.params(id, horizonJours, Timestamp.from(horloge.instant()))
				.update();

		Map<String, List<Offre>> offresParProduit = offresParProduit();
		for (Prevision prevision : previsions.prevoir(horizonJours)) {
			if (prevision.quantiteSuggeree() == 0) {
				continue;
			}
			Optional<Choix> choix = ChoixOffre.choisir(prevision.quantiteSuggeree(), prevision.couvertureJours(),
					offresParProduit.getOrDefault(prevision.cip13(), List.of()), aujourdhui);
			if (choix.isEmpty()) {
				LOG.warn("Aucune offre pour {} ({}) : produit absent du panier", prevision.libelle(), prevision.cip13());
				continue;
			}
			Choix c = choix.get();
			jdbc.sql("""
					INSERT INTO ligne_panier (panier_id, offre_id, quantite, prix_unitaire,
					                          statut_produit, quantite_suggeree, couverture_jours, livre_apres_rupture)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)""")
					.params(id, c.offre().id(), c.quantite(), c.offre().prixUnitaire(), prevision.statut().name(),
							prevision.quantiteSuggeree(), prevision.couvertureJours(), c.livreApresRupture())
					.update();
		}
		return lire(id);
	}

	public Panier lire(UUID id) {
		record Entete(Panier.Statut statut, int horizon, Instant creeLe, Instant valideLe, Instant recuLe) {
		}
		Entete entete = jdbc.sql("SELECT statut, horizon_jours, cree_le, valide_le, recu_le FROM panier WHERE id = ?")
				.param(id)
				.query((rs, i) -> new Entete(
						Panier.Statut.valueOf(rs.getString("statut")),
						rs.getInt("horizon_jours"),
						rs.getTimestamp("cree_le").toInstant(),
						instant(rs.getTimestamp("valide_le")),
						instant(rs.getTimestamp("recu_le"))))
				.optional()
				.orElseThrow(() -> new PanierIntrouvable(id));

		// Livraison comptée depuis la validation, ou depuis aujourd'hui tant que le panier est un brouillon.
		LocalDate depart = entete.valideLe() != null
				? LocalDate.ofInstant(entete.valideLe(), ReassortApplication.FUSEAU)
				: LocalDate.now(horloge);

		record LigneLue(String fournisseurId, String fournisseur, String type, BigDecimal franco, Instant recueLe,
				Ligne ligne) {
		}
		List<LigneLue> lignes = jdbc.sql("""
				SELECT l.id, o.id AS offre_id, o.cip13, p.libelle, l.statut_produit, l.couverture_jours, l.quantite_suggeree,
				       l.quantite, o.colisage, l.prix_unitaire, o.delai_jours, l.livre_apres_rupture, o.peremption, l.recue_le,
				       f.id AS fournisseur_id, f.nom AS fournisseur, f.type, f.franco
				FROM ligne_panier l
				JOIN offre o ON o.id = l.offre_id
				JOIN produit p ON p.cip13 = o.cip13
				JOIN fournisseur f ON f.id = o.fournisseur_id
				WHERE l.panier_id = ?
				ORDER BY f.franco DESC, f.nom, l.statut_produit = 'RUPTURE_IMMINENTE' DESC, p.libelle
				""")
				.param(id)
				.query((rs, i) -> {
					BigDecimal prix = rs.getBigDecimal("prix_unitaire");
					int quantite = rs.getInt("quantite");
					int delai = rs.getInt("delai_jours");
					BigDecimal couverture = rs.getBigDecimal("couverture_jours");
					return new LigneLue(rs.getString("fournisseur_id"), rs.getString("fournisseur"), rs.getString("type"),
													rs.getBigDecimal("franco"), instant(rs.getTimestamp("recue_le")), new Ligne(
								rs.getLong("id"),
								rs.getLong("offre_id"),
								rs.getString("cip13"),
									rs.getString("libelle"),
									CalculPrevision.Statut.valueOf(rs.getString("statut_produit")),
									couverture == null ? null : couverture.doubleValue(),
									rs.getInt("quantite_suggeree"),
																	quantite,
								rs.getInt("colisage"),
								prix,
									prix.multiply(BigDecimal.valueOf(quantite)),
									delai,
									depart.plusDays(delai),
									rs.getBoolean("livre_apres_rupture"),
									rs.getObject("peremption", LocalDate.class)));
				})
				.list();

		Map<String, List<LigneLue>> parFournisseur = lignes.stream()
				.collect(Collectors.groupingBy(LigneLue::fournisseurId, LinkedHashMap::new, Collectors.toList()));
		List<CommandeFournisseur> commandes = new ArrayList<>();
		parFournisseur.forEach((fournisseurId, lignesFournisseur) -> {
			LigneLue premiere = lignesFournisseur.getFirst();
			BigDecimal sousTotal = lignesFournisseur.stream().map(l -> l.ligne().montant()).reduce(BigDecimal.ZERO, BigDecimal::add);
			BigDecimal reste = premiere.franco().subtract(sousTotal).max(BigDecimal.ZERO);
			Instant recue = lignesFournisseur.stream().allMatch(l -> l.recueLe() != null) ? premiere.recueLe() : null;
			commandes.add(new CommandeFournisseur(fournisseurId, premiere.fournisseur(), premiere.type(), sousTotal,
					premiere.franco(), reste, recue, lignesFournisseur.stream().map(LigneLue::ligne).toList()));
		});
		BigDecimal total = commandes.stream().map(CommandeFournisseur::sousTotal).reduce(BigDecimal.ZERO, BigDecimal::add);

		return new Panier(id, entete.statut(), entete.horizon(), entete.creeLe(), entete.valideLe(), entete.recuLe(), total,
				lignes.size(), commandes);
	}

	/** Tous les paniers validés ou reçus, du plus récent au plus ancien : l'historique des commandes. */
	public List<Panier> historique() {
		return jdbc.sql("SELECT id FROM panier WHERE statut <> 'BROUILLON' ORDER BY valide_le DESC")
				.query(UUID.class)
				.list().stream()
				.map(this::lire)
				.toList();
	}

	/**
	 * Modifie une ligne d'un brouillon : sa quantité, ou son offre (un autre fournisseur pour le même produit). En
	 * changeant d'offre sans donner de quantité, la quantité est arrondie au colisage du nouveau fournisseur.
	 */
	@Transactional
	public Panier modifierLigne(UUID panierId, long ligneId, Integer quantite, Long offreId) {
		exigerBrouillon(panierId);
		record LigneActuelle(long offreId, int quantite, String cip13, BigDecimal couverture) {
		}
		LigneActuelle actuelle = jdbc.sql("""
				SELECT l.offre_id, l.quantite, o.cip13, l.couverture_jours FROM ligne_panier l JOIN offre o ON o.id = l.offre_id
				WHERE l.id = ? AND l.panier_id = ?""")
				.params(ligneId, panierId)
				.query((rs, i) -> new LigneActuelle(rs.getLong(1), rs.getInt(2), rs.getString(3), rs.getBigDecimal(4)))
				.optional()
				.orElseThrow(() -> new Refus(HttpStatus.NOT_FOUND, "Ligne introuvable dans ce panier."));

		long idOffre = offreId != null ? offreId : actuelle.offreId();
		Offre offre = offresParProduit().getOrDefault(actuelle.cip13(), List.of()).stream()
				.filter(o -> o.id() == idOffre)
				.findFirst()
				.orElseThrow(() -> new Refus(HttpStatus.UNPROCESSABLE_CONTENT, "Cette offre ne concerne pas ce produit."));

		int nouvelle = quantite != null ? quantite : ChoixOffre.arrondirAuColisage(actuelle.quantite(), offre.colisage());
		if (nouvelle <= 0) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT,
					"La quantité doit être positive : retirez la ligne pour ne pas commander ce produit.");
		}
		if (nouvelle % offre.colisage() != 0) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT, "Ce fournisseur vend par carton de " + offre.colisage()
					+ " : commandez " + ChoixOffre.arrondirAuColisage(nouvelle, offre.colisage()) + ".");
		}
		if (offre.quantiteDisponible() != null && nouvelle > offre.quantiteDisponible()) {
			throw new Refus(HttpStatus.UNPROCESSABLE_CONTENT,
					"Ce lot de déstockage ne compte que " + offre.quantiteDisponible() + " boîtes.");
		}
		boolean apresRupture = actuelle.couverture() != null && offre.delaiJours() > actuelle.couverture().doubleValue();
		jdbc.sql("UPDATE ligne_panier SET offre_id = ?, quantite = ?, prix_unitaire = ?, livre_apres_rupture = ? WHERE id = ?")
				.params(offre.id(), nouvelle, offre.prixUnitaire(), apresRupture, ligneId)
				.update();
		return lire(panierId);
	}

	@Transactional
	public Panier retirerLigne(UUID panierId, long ligneId) {
		exigerBrouillon(panierId);
		if (jdbc.sql("DELETE FROM ligne_panier WHERE id = ? AND panier_id = ?").params(ligneId, panierId).update() == 0) {
			throw new Refus(HttpStatus.NOT_FOUND, "Ligne introuvable dans ce panier.");
		}
		return lire(panierId);
	}

	/**
	 * Les cartons d'un fournisseur sont arrivés : ses lignes sont reçues et le stock augmente d'autant. Quand tous les
	 * fournisseurs ont livré, le panier passe « Reçu ».
	 */
	@Transactional
	public Panier recevoir(UUID panierId, String fournisseurId) {
		Panier panier = lire(panierId);
		if (panier.statut() != Panier.Statut.VALIDE) {
			throw new Refus(HttpStatus.CONFLICT, panier.statut() == Panier.Statut.RECU
					? "Cette commande est déjà entièrement reçue."
					: "Seule une commande validée peut être réceptionnée.");
		}
		Timestamp maintenant = Timestamp.from(horloge.instant());
		List<Long> lignes = jdbc.sql("""
				SELECT l.id FROM ligne_panier l JOIN offre o ON o.id = l.offre_id
				WHERE l.panier_id = ? AND o.fournisseur_id = ? AND l.recue_le IS NULL""")
				.params(panierId, fournisseurId)
				.query(Long.class)
				.list();
		if (lignes.isEmpty()) {
			throw new Refus(HttpStatus.CONFLICT, "Rien à réceptionner pour ce fournisseur dans cette commande.");
		}
		jdbc.sql("""
				UPDATE stock s SET quantite = s.quantite + r.quantite, releve_le = :maintenant
				FROM (SELECT o.cip13, sum(l.quantite) AS quantite FROM ligne_panier l JOIN offre o ON o.id = l.offre_id
				      WHERE l.id IN (:lignes) GROUP BY o.cip13) r
				WHERE s.cip13 = r.cip13""")
				.param("maintenant", maintenant)
				.param("lignes", lignes)
				.update();
		jdbc.sql("UPDATE ligne_panier SET recue_le = :maintenant WHERE id IN (:lignes)")
				.param("maintenant", maintenant)
				.param("lignes", lignes)
				.update();
		jdbc.sql("""
				UPDATE panier SET statut = 'RECU', recu_le = ?
				WHERE id = ? AND NOT EXISTS (SELECT 1 FROM ligne_panier WHERE panier_id = ? AND recue_le IS NULL)""")
				.params(maintenant, panierId, panierId)
				.update();
		return lire(panierId);
	}

	private void exigerBrouillon(UUID panierId) {
		Panier.Statut statut = jdbc.sql("SELECT statut FROM panier WHERE id = ?").param(panierId)
				.query((rs, i) -> Panier.Statut.valueOf(rs.getString(1)))
				.optional()
				.orElseThrow(() -> new PanierIntrouvable(panierId));
		if (statut != Panier.Statut.BROUILLON) {
			throw new PanierDejaValide(panierId);
		}
	}

	private static Instant instant(Timestamp horodatage) {
		return horodatage == null ? null : horodatage.toInstant();
	}


	/** Le dernier panier, brouillon ou validé : ce que l'écran rouvre. */
	public Optional<Panier> dernier() {
		return jdbc.sql("SELECT id FROM panier ORDER BY cree_le DESC LIMIT 1")
				.query(UUID.class)
				.optional()
				.map(this::lire);
	}

	@Transactional
	public Panier valider(UUID id) {
		int modifies = jdbc.sql("UPDATE panier SET statut = 'VALIDE', valide_le = ? WHERE id = ? AND statut = 'BROUILLON'")
				.params(Timestamp.from(horloge.instant()), id)
				.update();
		Panier panier = lire(id);
		if (modifies == 0) {
			throw new PanierDejaValide(id);
		}
		if (panier.nombreLignes() == 0) {
			throw new PanierVide(id);
		}
		evenements.publishEvent(new PanierValide(id, panier.valideLe(), panier.total(), panier.commandes().size()));
		return panier;
	}

	private Map<String, List<Offre>> offresParProduit() {
		return jdbc.sql("""
				SELECT id, cip13, fournisseur_id, prix_unitaire, delai_jours, colisage, quantite_disponible, peremption
				FROM offre""")
				.query((rs, i) -> Map.entry(rs.getString("cip13"), new Offre(
						rs.getLong("id"),
						rs.getString("fournisseur_id"),
						rs.getBigDecimal("prix_unitaire"),
						rs.getInt("delai_jours"),
						rs.getInt("colisage"),
						rs.getObject("quantite_disponible", Integer.class),
						rs.getObject("peremption", LocalDate.class))))
				.list().stream()
				.collect(Collectors.groupingBy(Map.Entry::getKey,
						Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
	}

	public static class PanierIntrouvable extends Refus {
		PanierIntrouvable(UUID id) {
			super(HttpStatus.NOT_FOUND, "Panier introuvable : " + id);
		}
	}

	public static class PanierDejaValide extends Refus {
		PanierDejaValide(UUID id) {
			super(HttpStatus.CONFLICT, "Ce panier est déjà validé.");
		}
	}

	public static class PanierVide extends Refus {
		PanierVide(UUID id) {
			super(HttpStatus.UNPROCESSABLE_CONTENT, "Ce panier est vide : rien à commander.");
		}
	}
}
