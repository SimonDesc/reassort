package fr.reassort.reglages;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Les réglages de la prévision, propres à chaque pharmacie. */
public record Reglages(
		/** Période sur laquelle on calcule la vente moyenne. */
		@Min(7) @Max(90) int joursHistorique,
		/** Marge ajoutée au délai de livraison avant de déclarer une rupture imminente. */
		@Min(0) @Max(30) int stockSecuriteJours,
		/** Couverture au-delà de laquelle un produit est en surstock. */
		@Min(30) @Max(365) int surstockJours,
		/** Ventes que l'on garde en stock quand on déstocke. */
		@Min(7) @Max(365) int conserverJours) {

	public static final Reglages PAR_DEFAUT = new Reglages(28, 3, 90, 60);
}
