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
		record Entete(Panier.Statut statut, int horizon, Instant creeLe, Instant valideLe) {
		}
		Entete entete = jdbc.sql("SELECT statut, horizon_jours, cree_le, valide_le FROM panier WHERE id = ?")
				.param(id)
				.query((rs, i) -> new Entete(
						Panier.Statut.valueOf(rs.getString("statut")),
						rs.getInt("horizon_jours"),
						rs.getTimestamp("cree_le").toInstant(),
						rs.getTimestamp("valide_le") == null ? null : rs.getTimestamp("valide_le").toInstant()))
				.optional()
				.orElseThrow(() -> new PanierIntrouvable(id));

		// Livraison comptée depuis la validation, ou depuis aujourd'hui tant que le panier est un brouillon.
		LocalDate depart = entete.valideLe() != null
				? LocalDate.ofInstant(entete.valideLe(), ReassortApplication.FUSEAU)
				: LocalDate.now(horloge);

		record LigneLue(String fournisseurId, String fournisseur, String type, BigDecimal franco, Ligne ligne) {
		}
		List<LigneLue> lignes = jdbc.sql("""
				SELECT l.id, o.cip13, p.libelle, l.statut_produit, l.couverture_jours, l.quantite_suggeree, l.quantite,
				       l.prix_unitaire, o.delai_jours, l.livre_apres_rupture, o.peremption,
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
							rs.getBigDecimal("franco"), new Ligne(
									rs.getLong("id"),
									rs.getString("cip13"),
									rs.getString("libelle"),
									CalculPrevision.Statut.valueOf(rs.getString("statut_produit")),
									couverture == null ? null : couverture.doubleValue(),
									rs.getInt("quantite_suggeree"),
									quantite,
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
			commandes.add(new CommandeFournisseur(fournisseurId, premiere.fournisseur(), premiere.type(), sousTotal,
					premiere.franco(), reste, lignesFournisseur.stream().map(LigneLue::ligne).toList()));
		});
		BigDecimal total = commandes.stream().map(CommandeFournisseur::sousTotal).reduce(BigDecimal.ZERO, BigDecimal::add);

		return new Panier(id, entete.statut(), entete.horizon(), entete.creeLe(), entete.valideLe(), total, lignes.size(),
				commandes);
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
