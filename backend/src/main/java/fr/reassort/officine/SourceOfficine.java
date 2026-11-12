package fr.reassort.officine;

import java.time.LocalDate;
import java.util.List;

/**
 * D'où viennent les ventes et le stock de la pharmacie.
 *
 * <p>Dans la démo, des fichiers CSV ({@link SourceOfficineCsv}). En production, un connecteur au logiciel de gestion
 * d'officine (LGO) qui synchronise ces données sans action du pharmacien : il suffit d'une autre implémentation.
 */
public interface SourceOfficine {

	DonneesOfficine lire();

	record DonneesOfficine(List<ProduitEnStock> stock, List<VenteDuJour> ventes) {
	}

	record ProduitEnStock(String cip13, String libelle, int quantite) {
	}

	record VenteDuJour(LocalDate jour, String cip13, int quantite) {
	}
}
