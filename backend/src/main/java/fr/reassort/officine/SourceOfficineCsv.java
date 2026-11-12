package fr.reassort.officine;

import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.core.io.Resource;

/** Ventes et stock lus dans deux exports CSV du LGO : stock.csv (cip13;libelle;stock) et ventes.csv (date;cip13;quantite). */
public class SourceOfficineCsv implements SourceOfficine {

	private static final Pattern CIP13 = Pattern.compile("\\d{13}");

	private final Resource stock;
	private final Resource ventes;

	public SourceOfficineCsv(Resource stock, Resource ventes) {
		this.stock = stock;
		this.ventes = ventes;
	}

	@Override
	public DonneesOfficine lire() {
		List<ProduitEnStock> produits = LecteurCsv.lire(stock, List.of("cip13", "libelle", "stock"),
				v -> new ProduitEnStock(cip13(v[0]), libelle(v[1]), quantite(v[2])));
		List<VenteDuJour> lignes = LecteurCsv.lire(ventes, List.of("date", "cip13", "quantite"),
				v -> new VenteDuJour(LocalDate.parse(v[0]), cip13(v[1]), quantite(v[2])));
		return new DonneesOfficine(produits, lignes);
	}

	private static String cip13(String valeur) {
		if (!CIP13.matcher(valeur).matches()) {
			throw new IllegalArgumentException("CIP13 invalide « " + valeur + " »");
		}
		return valeur;
	}

	private static String libelle(String valeur) {
		if (valeur.isEmpty()) {
			throw new IllegalArgumentException("libellé vide");
		}
		return valeur;
	}

	private static int quantite(String valeur) {
		int quantite = Integer.parseInt(valeur);
		if (quantite < 0) {
			throw new IllegalArgumentException("quantité négative " + quantite);
		}
		return quantite;
	}
}
