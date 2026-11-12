package fr.reassort.officine;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;

import org.springframework.core.io.Resource;

/**
 * Lecture d'un CSV à séparateur « ; » (celui d'Excel en français), en UTF-8, avec une ligne d'en-tête vérifiée.
 * Une ligne invalide arrête la lecture avec son numéro : mieux vaut refuser un fichier que prévoir sur des données fausses.
 */
public final class LecteurCsv {

	private LecteurCsv() {
	}

	public static <T> List<T> lire(Resource fichier, List<String> entete, Function<String[], T> convertir) {
		try (BufferedReader lecteur = new BufferedReader(new InputStreamReader(fichier.getInputStream(), StandardCharsets.UTF_8))) {
			String premiere = lecteur.readLine();
			if (premiere == null || !Arrays.asList(cellules(premiere)).equals(entete)) {
				throw new FichierInvalide(fichier, 1, "en-tête attendu : " + String.join(";", entete));
			}
			List<T> lignes = new ArrayList<>();
			String ligne;
			int numero = 1;
			while ((ligne = lecteur.readLine()) != null) {
				numero++;
				if (ligne.isBlank()) {
					continue;
				}
				String[] valeurs = cellules(ligne);
				if (valeurs.length != entete.size()) {
					throw new FichierInvalide(fichier, numero, entete.size() + " colonnes attendues, " + valeurs.length + " trouvées");
				}
				try {
					lignes.add(convertir.apply(valeurs));
				} catch (RuntimeException e) {
					throw new FichierInvalide(fichier, numero, e.getMessage());
				}
			}
			return lignes;
		} catch (IOException e) {
			throw new UncheckedIOException("Lecture impossible : " + fichier.getDescription(), e);
		}
	}

	private static String[] cellules(String ligne) {
		String[] valeurs = ligne.replace("﻿", "").split(";", -1);
		for (int i = 0; i < valeurs.length; i++) {
			valeurs[i] = valeurs[i].strip();
		}
		return valeurs;
	}

	public static class FichierInvalide extends RuntimeException {
		FichierInvalide(Resource fichier, int ligne, String raison) {
			super(fichier.getFilename() + ", ligne " + ligne + " : " + raison);
		}
	}
}
