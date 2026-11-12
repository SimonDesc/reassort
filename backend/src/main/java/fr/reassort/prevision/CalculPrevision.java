package fr.reassort.prevision;

import java.time.LocalDate;

/**
 * Le cœur métier : pour un produit, combien de jours tient le stock et faut-il commander.
 *
 * <p>Calcul volontairement simple et explicable au pharmacien :
 * <ul>
 * <li><b>vente moyenne</b> = ventes des N derniers jours ÷ N (jours calendaires, dimanches compris, comme la couverture) ;</li>
 * <li><b>couverture</b> = stock ÷ vente moyenne, en jours ;</li>
 * <li><b>rupture imminente</b> si la couverture est inférieure au délai de livraison le plus court + le stock de
 * sécurité : même en commandant aujourd'hui, la marge est entamée ;</li>
 * <li><b>à commander</b> si la couverture est inférieure à l'horizon de commande + ce même délai : sans commande
 * cette semaine, le produit passera sous le seuil avant la prochaine ;</li>
 * <li><b>quantité suggérée</b> = de quoi couvrir horizon + délai + sécurité, moins le stock ;</li>
 * <li><b>surstock</b> si la couverture dépasse {@code surstockJours} (90 j), ou si le produit ne se vend plus : le
 * surplus au-delà de {@code conserverJours} (60 j) de ventes peut être déstocké auprès des confrères.</li>
 * </ul>
 * Le colisage des fournisseurs s'applique ensuite, au moment de choisir l'offre.
 *
 * <p>Pas de dépendance à Spring ni à la base : la règle se teste seule.
 */
public final class CalculPrevision {

	private CalculPrevision() {
	}

	/** Du plus urgent au moins urgent : l'ordre sert au tri. */
	public enum Statut {
		RUPTURE_IMMINENTE, A_COMMANDER, COMMANDE, SURSTOCK, OK
	}

	public record Parametres(int joursHistorique, int stockSecuriteJours, int horizonJours, int surstockJours,
			int conserverJours) {
		public Parametres {
			if (joursHistorique <= 0 || stockSecuriteJours < 0 || horizonJours <= 0 || conserverJours <= 0
					|| surstockJours < conserverJours) {
				throw new IllegalArgumentException("paramètres de prévision invalides");
			}
		}

		/** Surstock au-delà de 90 jours de couverture, en gardant 60 jours de ventes. */
		public Parametres(int joursHistorique, int stockSecuriteJours, int horizonJours) {
			this(joursHistorique, stockSecuriteJours, horizonJours, 90, 60);
		}
	}

	/**
	 * Ce que l'on sait d'un produit : son stock, ses ventes récentes, ce qui est déjà commandé et pas encore livré, le
	 * délai de sa meilleure offre (null : aucune).
	 */
	public record Entree(String cip13, String libelle, int stock, int ventesSurHistorique, int enCommande,
			Integer delaiLePlusCourt) {
	}

	public record Prevision(
			String cip13,
			String libelle,
			int stock,
			int enCommande,
			double venteMoyenneParJour,
			Double couvertureJours,
			LocalDate ruptureEstimeeLe,
			Integer delaiLePlusCourt,
			Statut statut,
			int quantiteSuggeree,
			int quantiteADestocker) {
	}

	public static Prevision calculer(Entree produit, Parametres parametres, LocalDate aujourdhui) {
		double moyenne = (double) produit.ventesSurHistorique() / parametres.joursHistorique();
		if (moyenne == 0) {
			// Produit sans vente sur la période : rien à commander ; s'il en reste, tout le stock dort.
			Statut statut = produit.stock() > 0 ? Statut.SURSTOCK : Statut.OK;
			return new Prevision(produit.cip13(), produit.libelle(), produit.stock(), produit.enCommande(), 0, null, null,
					produit.delaiLePlusCourt(), statut, 0, produit.stock());
		}

		double couverture = produit.stock() / moyenne;
		// Sans offre sur la marketplace, on raisonne comme si la livraison prenait une semaine.
		int delai = produit.delaiLePlusCourt() != null ? produit.delaiLePlusCourt() : 7;
		int seuilUrgence = delai + parametres.stockSecuriteJours();
		int seuilCommande = seuilUrgence + parametres.horizonJours();

		Statut statut = couverture < seuilUrgence ? Statut.RUPTURE_IMMINENTE
				: couverture < seuilCommande ? Statut.A_COMMANDER
				: couverture > parametres.surstockJours() ? Statut.SURSTOCK
				: Statut.OK;

		int besoin = (int) Math.ceil(moyenne * seuilCommande);
		int quantite = 0;
		if (statut == Statut.RUPTURE_IMMINENTE || statut == Statut.A_COMMANDER) {
			// Ce qui est déjà commandé compte : on ne repropose pas ce que le pharmacien vient de valider.
			quantite = Math.max(0, besoin - produit.stock() - produit.enCommande());
			if (quantite == 0) {
				statut = Statut.COMMANDE;
			}
		}

		int aDestocker = statut == Statut.SURSTOCK
				? produit.stock() - (int) Math.ceil(moyenne * parametres.conserverJours())
				: 0;

		return new Prevision(produit.cip13(), produit.libelle(), produit.stock(), produit.enCommande(), arrondi(moyenne),
				arrondi(couverture), aujourdhui.plusDays((long) Math.floor(couverture)), produit.delaiLePlusCourt(),
				statut, quantite, aDestocker);
	}

	private static double arrondi(double valeur) {
		return Math.round(valeur * 10) / 10.0;
	}
}
