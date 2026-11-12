package fr.reassort.panier;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Pour un besoin (une quantité, une couverture), quelle offre de la marketplace retenir.
 *
 * <ol>
 * <li>Une offre de déstockage d'un confrère n'est retenue que si son lot suffit et si la péremption laisse au moins
 * {@value #MOIS_AVANT_PEREMPTION} mois après livraison pour écouler les boîtes.</li>
 * <li>Seules comptent les offres livrées avant la rupture estimée (délai ≤ couverture).</li>
 * <li>Parmi elles, la moins chère <b>au total</b> : la quantité est arrondie au colisage du fournisseur, si bien qu'un
 * carton de 12 moins cher à l'unité peut coûter plus qu'il ne faut pour un besoin de 3.</li>
 * <li>Si aucune n'arrive à temps, la plus rapide, signalée : la rupture ne sera pas évitée, seulement écourtée.</li>
 * </ol>
 */
public final class ChoixOffre {

	/** Un lot n'intéresse un acheteur que s'il lui reste ce temps, une fois livré, pour écouler ses boîtes. */
	public static final int MOIS_AVANT_PEREMPTION = 3;

	private ChoixOffre() {
	}

	/** quantiteDisponible et peremption : null pour une offre classique, renseignés pour un lot de déstockage. */
	public record Offre(long id, String fournisseurId, BigDecimal prixUnitaire, int delaiJours, int colisage,
			Integer quantiteDisponible, LocalDate peremption) {

		public static Offre classique(long id, String fournisseurId, String prix, int delai, int colisage) {
			return new Offre(id, fournisseurId, new BigDecimal(prix), delai, colisage, null, null);
		}
	}

	public record Choix(Offre offre, int quantite, BigDecimal montant, boolean livreApresRupture) {
	}

	/**
	 * @param besoin     quantité suggérée par la prévision (> 0)
	 * @param couverture jours de stock restants ; null pour un produit sans vente (toute offre arrive à temps)
	 */
	public static Optional<Choix> choisir(int besoin, Double couverture, List<Offre> offres, LocalDate aujourdhui) {
		if (besoin <= 0) {
			return Optional.empty();
		}
		List<Choix> possibles = offres.stream()
				.map(o -> chiffrer(o, besoin))
				.filter(c -> peutServir(c, aujourdhui))
				.toList();

		List<Choix> aTemps = possibles.stream()
				.filter(c -> couverture == null || c.offre().delaiJours() <= couverture)
				.toList();
		if (!aTemps.isEmpty()) {
			return aTemps.stream().min(Comparator
					.comparing(Choix::montant)
					.thenComparing(c -> c.offre().delaiJours()));
		}
		return possibles.stream()
				.min(Comparator.<Choix>comparingInt(c -> c.offre().delaiJours()).thenComparing(c -> c.offre().prixUnitaire()))
				.map(c -> new Choix(c.offre(), c.quantite(), c.montant(), true));
	}

	private static boolean peutServir(Choix choix, LocalDate aujourdhui) {
		Offre offre = choix.offre();
		boolean lotSuffisant = offre.quantiteDisponible() == null || choix.quantite() <= offre.quantiteDisponible();
		boolean peremptionLointaine = offre.peremption() == null || !offre.peremption()
				.isBefore(aujourdhui.plusDays(offre.delaiJours()).plusMonths(MOIS_AVANT_PEREMPTION));
		return lotSuffisant && peremptionLointaine;
	}

	private static Choix chiffrer(Offre offre, int besoin) {
		int quantite = arrondirAuColisage(besoin, offre.colisage());
		BigDecimal montant = offre.prixUnitaire().multiply(BigDecimal.valueOf(quantite)).setScale(2, RoundingMode.HALF_UP);
		return new Choix(offre, quantite, montant, false);
	}

	static int arrondirAuColisage(int besoin, int colisage) {
		return (besoin + colisage - 1) / colisage * colisage;
	}
}
