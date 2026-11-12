package fr.reassort.officine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import fr.reassort.officine.SourceOfficine.DonneesOfficine;
import fr.reassort.officine.SourceOfficine.ProduitEnStock;
import fr.reassort.officine.SourceOfficine.VenteDuJour;

class SourceOfficineCsvTest {

	@Test
	void litLeStockEtLesVentes() {
		DonneesOfficine donnees = new SourceOfficineCsv(
				fichier("stock.csv", "﻿cip13;libelle;stock\n3400999000017;Paracétamol 1000 mg, 8 comprimés;12\n\n"),
				fichier("ventes.csv", "date;cip13;quantite\n2026-11-10;3400999000017;4\n")).lire();

		assertThat(donnees.stock()).containsExactly(new ProduitEnStock("3400999000017", "Paracétamol 1000 mg, 8 comprimés", 12));
		assertThat(donnees.ventes()).containsExactly(new VenteDuJour(LocalDate.of(2026, 11, 10), "3400999000017", 4));
	}

	@Test
	void refuseUnEnteteInattendu() {
		var source = new SourceOfficineCsv(fichier("stock.csv", "code;nom;qte\n"), fichier("ventes.csv", "date;cip13;quantite\n"));

		assertThatThrownBy(source::lire).hasMessage("stock.csv, ligne 1 : en-tête attendu : cip13;libelle;stock");
	}

	@Test
	void indiqueLaLigneFautive() {
		var source = new SourceOfficineCsv(
				fichier("stock.csv", "cip13;libelle;stock\n3400999000017;Paracétamol;12\n34009;Ibuprofène;3\n"),
				fichier("ventes.csv", "date;cip13;quantite\n"));

		assertThatThrownBy(source::lire).hasMessage("stock.csv, ligne 3 : CIP13 invalide « 34009 »");
	}

	@Test
	void refuseUneQuantiteNegative() {
		var source = new SourceOfficineCsv(
				fichier("stock.csv", "cip13;libelle;stock\n"),
				fichier("ventes.csv", "date;cip13;quantite\n2026-11-10;3400999000017;-2\n"));

		assertThatThrownBy(source::lire).hasMessage("ventes.csv, ligne 2 : quantité négative -2");
	}

	private static Resource fichier(String nom, String contenu) {
		return new ByteArrayResource(contenu.getBytes(StandardCharsets.UTF_8)) {
			@Override
			public String getFilename() {
				return nom;
			}
		};
	}
}
