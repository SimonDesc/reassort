package fr.reassort.mcp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpTool.McpAnnotations;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import fr.reassort.destockage.DestockageService;
import fr.reassort.destockage.DestockageService.Annonce;
import fr.reassort.destockage.DestockageService.Publication;
import fr.reassort.destockage.DestockageService.Suggestion;
import fr.reassort.panier.Panier;
import fr.reassort.panier.PanierService;
import fr.reassort.prevision.CalculPrevision.Prevision;
import fr.reassort.prevision.CalculPrevision.Statut;
import fr.reassort.prevision.PrevisionService;

/**
 * Les outils MCP de Réassort : le pharmacien demande à Claude « qu'est-ce que je dois commander cette semaine ? »,
 * relit le panier proposé et le valide, ou publie son surstock.
 *
 * <p>Les outils appellent les mêmes services que l'API REST : aucune règle métier n'est dupliquée. Ceux qui engagent
 * la pharmacie (valider, publier) sont marqués destructifs, pour que le client MCP demande confirmation.
 */
@Component
class OutilsReassort {

	private final PrevisionService previsions;
	private final PanierService paniers;
	private final DestockageService destockage;

	OutilsReassort(PrevisionService previsions, PanierService paniers, DestockageService destockage) {
		this.previsions = previsions;
		this.paniers = paniers;
		this.destockage = destockage;
	}

	@McpTool(name = "ruptures_a_venir", title = "Ruptures à venir",
			description = """
					Liste les produits de la pharmacie qui vont manquer : ruptures imminentes (le stock ne tient pas jusqu'à \
					la prochaine livraison), produits à commander pour tenir l'horizon, et produits déjà commandés. \
					Triés du plus urgent au moins urgent. Les produits bien couverts ne sont pas listés.""",
			annotations = @McpAnnotations(readOnlyHint = true, destructiveHint = false, openWorldHint = false))
	List<Prevision> rupturesAVenir(
			@McpToolParam(required = false, description = "Nombre de jours que la commande doit couvrir (1 à 60, 7 par défaut)") Integer horizonJours) {
		return previsions.prevoir(horizon(horizonJours)).stream()
				.filter(p -> p.statut() == Statut.RUPTURE_IMMINENTE || p.statut() == Statut.A_COMMANDER
						|| p.statut() == Statut.COMMANDE)
				.toList();
	}

	@McpTool(name = "proposer_panier", title = "Proposer un panier de commande",
			description = """
					Prépare un panier de commande sur la marketplace pour tenir l'horizon : pour chaque produit à commander, \
					l'offre la moins chère livrée avant la rupture (grossiste, dépositaire, laboratoire ou lot de déstockage \
					d'un confrère), quantité arrondie au colisage. Le panier est groupé par fournisseur avec le reste à \
					atteindre pour le franco de port. Ne commande rien : le panier reste un brouillon tant qu'il n'est pas \
					validé. Remplace le brouillon précédent.""",
			annotations = @McpAnnotations(readOnlyHint = false, destructiveHint = false, idempotentHint = true, openWorldHint = false))
	Panier proposerPanier(
			@McpToolParam(required = false, description = "Nombre de jours que la commande doit couvrir (1 à 60, 7 par défaut)") Integer horizonJours) {
		return paniers.proposer(horizon(horizonJours));
	}

	@McpTool(name = "valider_panier", title = "Valider le panier",
			description = """
					Valide un panier brouillon : les commandes partent chez les fournisseurs, c'est irréversible. \
					N'appelle cet outil qu'après avoir présenté le panier au pharmacien (fournisseurs, montants, alertes) \
					et obtenu son accord explicite.""",
			annotations = @McpAnnotations(readOnlyHint = false, destructiveHint = true, idempotentHint = false, openWorldHint = true))
	Panier validerPanier(@McpToolParam(description = "Identifiant du panier, renvoyé par proposer_panier") String panierId) {
		return paniers.valider(UUID.fromString(panierId));
	}

	@McpTool(name = "produits_a_destocker", title = "Produits à déstocker",
			description = """
					Liste le surstock de la pharmacie (plus de 90 jours de stock, ou produits qui ne se vendent plus) : \
					quantité à céder aux confrères, prix conseillé (30 % sous la meilleure offre neuve) et annonce déjà \
					publiée s'il y en a une.""",
			annotations = @McpAnnotations(readOnlyHint = true, destructiveHint = false, openWorldHint = false))
	List<Suggestion> produitsADestocker() {
		return destockage.suggestions();
	}

	@McpTool(name = "publier_annonce_destockage", title = "Publier une annonce de déstockage",
			description = """
					Publie (ou met à jour) l'annonce d'un lot sur la marketplace, visible des confrères. Demande au \
					pharmacien la date de péremption du lot : ne l'invente jamais. Refusé si la quantité dépasse le stock \
					ou si la péremption est à moins de 3 mois.""",
			annotations = @McpAnnotations(readOnlyHint = false, destructiveHint = true, idempotentHint = true, openWorldHint = true))
	Annonce publierAnnonce(
			@McpToolParam(description = "Code CIP13 du produit") String cip13,
			@McpToolParam(description = "Nombre de boîtes à céder") int quantite,
			@McpToolParam(description = "Prix unitaire HT en euros") BigDecimal prixUnitaire,
			@McpToolParam(description = "Date de péremption du lot, au format AAAA-MM-JJ, donnée par le pharmacien") String peremption) {
		return destockage.publier(new Publication(cip13, quantite, prixUnitaire, LocalDate.parse(peremption)));
	}

	private static int horizon(Integer horizonJours) {
		int horizon = horizonJours == null ? 7 : horizonJours;
		if (horizon < 1 || horizon > 60) {
			throw new IllegalArgumentException("L'horizon doit être compris entre 1 et 60 jours.");
		}
		return horizon;
	}
}
