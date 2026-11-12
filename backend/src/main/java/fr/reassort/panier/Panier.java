package fr.reassort.panier;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import fr.reassort.prevision.CalculPrevision;

/** Un panier tel que le pharmacien le lit : une commande par fournisseur, chacune avec son franco. */
public record Panier(
		UUID id,
		Statut statut,
		int horizonJours,
		Instant creeLe,
		Instant valideLe,
		BigDecimal total,
		int nombreLignes,
		List<CommandeFournisseur> commandes) {

	public enum Statut {
		BROUILLON, VALIDE
	}

	public record CommandeFournisseur(
			String fournisseurId,
			String fournisseur,
			String typeFournisseur,
			BigDecimal sousTotal,
			BigDecimal franco,
			/** Ce qui manque pour atteindre le franco de port ; zéro s'il est atteint. */
			BigDecimal resteAvantFranco,
			List<Ligne> lignes) {
	}

	public record Ligne(
			long id,
			String cip13,
			String libelle,
			CalculPrevision.Statut statutProduit,
			Double couvertureJours,
			int quantiteSuggeree,
			int quantite,
			BigDecimal prixUnitaire,
			BigDecimal montant,
			int delaiJours,
			LocalDate livraisonPrevueLe,
			boolean livreApresRupture,
			LocalDate peremption) {
	}
}
