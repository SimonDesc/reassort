"""
Génère le jeu de démonstration de Réassort dans backend/src/main/resources/demo/.

Données fictives, reproductibles (graine fixe) :
- stock.csv et ventes.csv : ce qu'exporterait le logiciel de gestion d'officine (LGO) ;
- fournisseurs.csv et offres.csv : le catalogue de la marketplace, dont les lots qu'un confrère déstocke.

Les codes CIP13 commencent par 3400999 : ils sont fictifs. Les ventes finissent le 2026-11-11 ;
au chargement, l'application les recale pour qu'elles finissent la veille du jour courant.

    python tools/generer_demo.py
"""

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(9000)

SORTIE = Path(__file__).resolve().parent.parent / "backend" / "src" / "main" / "resources" / "demo"
FIN = date(2026, 11, 11)
JOURS = 90

FOURNISSEURS = [
    # id, nom, type, franco (€)
    ("repartiteur-garonne", "Répartiteur Garonne", "GROSSISTE", 0),
    ("depositaire-sud-ouest", "Dépositaire Sud-Ouest", "DEPOSITAIRE", 150),
    ("labo-direct-occitanie", "Labo Direct Occitanie", "LABORATOIRE", 300),
    ("confrere-toulouse-nord", "Confrère · Toulouse Nord (déstockage)", "CONFRERE", 0),
]

# Lots de déstockage d'un confrère : rang du produit, part du prix grossiste, quantité disponible, mois avant péremption.
# Un lot trop petit et une péremption trop proche montrent les deux cas où l'offre est écartée.
DESTOCKAGE = [
    (2, 0.62, 60, 9),     # Paracétamol 500 mg
    (7, 0.58, 50, 7),     # Carbocistéine sirop
    (11, 0.66, 30, 11),   # Spray nasal eau de mer
    (15, 0.6, 4, 8),      # Lopéramide : lot trop petit pour le besoin
    (25, 0.64, 40, 10),   # Atorvastatine
    (30, 0.55, 20, 2),    # Salbutamol : péremption trop proche
    (39, 0.6, 30, 6),     # Baume à lèvres
    (3, 0.7, 24, 12),     # Ibuprofène 400 mg (déjà bien couvert)
    (38, 0.57, 12, 5),    # Crème émolliente (déjà bien couverte)
]

# libellé, prix grossiste (€ HT), ventes moyennes par jour ouvré, saisonnier (hiver), profil de stock
# Profils : "rupture" (moins que le délai), "surveiller" (bientôt sous le seuil), "ok", "dormant" (stock sans ventes)
PRODUITS = [
    ("Paracétamol 1000 mg, 8 comprimés", 1.45, 14, False, "ok"),
    ("Paracétamol 500 mg, 16 gélules", 1.20, 9, False, "surveiller"),
    ("Ibuprofène 400 mg, 12 comprimés", 1.90, 7, False, "ok"),
    ("Ibuprofène 200 mg, 20 comprimés", 1.60, 3, False, "ok"),
    ("Phloroglucinol 80 mg, 10 lyophilisats", 2.10, 4, False, "rupture"),
    ("Dextrométhorphane sirop 125 ml", 3.40, 5, True, "rupture"),
    ("Carbocistéine sirop 5 %, 200 ml", 2.80, 6, True, "surveiller"),
    ("Pastilles gorge miel-citron, 24 pastilles", 3.90, 5, True, "ok"),
    ("Chlorhexidine bain de bouche 300 ml", 3.10, 2, False, "ok"),
    ("Sérum physiologique 30 unidoses", 2.20, 6, True, "rupture"),
    ("Spray nasal eau de mer 100 ml", 4.20, 4, True, "surveiller"),
    ("Pseudoéphédrine + paracétamol, 16 comprimés", 4.80, 4, True, "ok"),
    ("Vitamine C 500 mg, 24 comprimés à croquer", 3.30, 3, True, "ok"),
    ("Oméprazole 20 mg, 14 gélules", 2.40, 3, False, "ok"),
    ("Lopéramide 2 mg, 12 gélules", 2.70, 2, False, "surveiller"),
    ("Diosmectite 3 g, 18 sachets", 3.60, 3, False, "ok"),
    ("Macrogol 4000, 20 sachets", 4.10, 2, False, "ok"),
    ("Cétirizine 10 mg, 7 comprimés", 2.30, 2, False, "ok"),
    ("Desloratadine 5 mg, 30 comprimés", 5.20, 1, False, "dormant"),
    ("Amoxicilline 1 g, 6 comprimés", 2.90, 5, True, "rupture"),
    ("Amoxicilline + acide clavulanique 1 g, 8 sachets", 4.60, 3, True, "surveiller"),
    ("Azithromycine 250 mg, 6 comprimés", 5.10, 1, True, "ok"),
    ("Metformine 1000 mg, 60 comprimés", 3.20, 4, False, "ok"),
    ("Amlodipine 5 mg, 30 gélules", 2.60, 3, False, "ok"),
    ("Atorvastatine 20 mg, 30 comprimés", 4.30, 4, False, "surveiller"),
    ("Lévothyroxine 75 µg, 30 comprimés", 2.10, 3, False, "ok"),
    ("Ramipril 5 mg, 30 comprimés", 3.00, 2, False, "ok"),
    ("Bisoprolol 2,5 mg, 30 comprimés", 2.80, 2, False, "ok"),
    ("Esoméprazole 40 mg, 28 gélules", 4.90, 2, False, "rupture"),
    ("Salbutamol 100 µg, inhalateur 200 doses", 3.70, 2, True, "surveiller"),
    ("Insuline glargine, 5 stylos", 38.50, 1, False, "ok"),
    ("Bandes de contention classe 2", 12.40, 1, False, "dormant"),
    ("Compresses stériles 10 x 10, boîte de 50", 3.80, 2, False, "ok"),
    ("Pansements hydrocolloïdes, boîte de 10", 6.20, 1, False, "ok"),
    ("Gel hydroalcoolique 300 ml", 3.50, 3, True, "ok"),
    ("Tests antigéniques, boîte de 5", 9.90, 2, True, "rupture"),
    ("Thermomètre électronique", 6.80, 1, True, "ok"),
    ("Crème émolliente 400 ml", 8.90, 2, True, "ok"),
    ("Baume à lèvres réparateur", 2.90, 3, True, "surveiller"),
    ("Mélatonine 1 mg, 30 comprimés", 7.40, 2, False, "ok"),
]


def cip13(rang: int) -> str:
    """CIP13 fictif (préfixe 3400999) avec une clé de contrôle EAN-13 valide."""
    debut = f"3400999{rang:05d}"
    somme = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(debut))
    return debut + str((10 - somme % 10) % 10)


def ventes_du_jour(base: float, saisonnier: bool, jour: date) -> int:
    if jour.weekday() == 6:  # fermé le dimanche
        return 0
    facteur = 0.6 if jour.weekday() == 5 else 1.0
    if saisonnier:
        # Montée de l'hiver : x0,7 début août → x1,5 mi-novembre
        avancement = 1 - (FIN - jour).days / JOURS
        facteur *= 0.7 + 0.8 * avancement
    moyenne = base * facteur
    # Loi de Poisson approchée, pour des ventes entières et variables
    seuil, k, p = math.exp(-moyenne), 0, 1.0
    while True:
        p *= random.random()
        if p <= seuil:
            return k
        k += 1


def stock_selon_profil(moyenne_recente: float, profil: str) -> int:
    couverture = {
        "rupture": random.uniform(0.3, 1.8),
        "surveiller": random.uniform(4, 8),
        "ok": random.uniform(14, 35),
        "dormant": random.uniform(60, 120),
    }[profil]
    return max(0, round(moyenne_recente * couverture))


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    jours = [FIN - timedelta(days=n) for n in range(JOURS - 1, -1, -1)]

    with open(SORTIE / "fournisseurs.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["id", "nom", "type", "franco"])
        for fournisseur in FOURNISSEURS:
            w.writerow(fournisseur)

    stock, ventes, offres = [], [], []
    for rang, (libelle, prix, base, saisonnier, profil) in enumerate(PRODUITS, start=1):
        code = cip13(rang)
        base_effective = base * 0.15 if profil == "dormant" else base
        serie = [ventes_du_jour(base_effective, saisonnier, j) for j in jours]
        ventes += [(j.isoformat(), code, q) for j, q in zip(jours, serie) if q > 0]
        moyenne_recente = sum(serie[-28:]) / 28
        stock.append((code, libelle, stock_selon_profil(moyenne_recente, profil)))

        # Le grossiste livre tout, à l'unité, en 24 h, au prix de référence.
        offres.append((code, "repartiteur-garonne", f"{prix:.2f}", 1, 1))
        # Le dépositaire couvre deux produits sur trois : un peu moins cher, en 2 à 3 jours.
        if rang % 3:
            offres.append((code, "depositaire-sud-ouest", f"{prix * random.uniform(0.9, 0.95):.2f}", random.choice([2, 3]), random.choice([1, 3, 6])))
        # Le laboratoire en direct couvre la moitié des produits : nettement moins cher, en 5 à 7 jours, par carton.
        if rang % 2:
            offres.append((code, "labo-direct-occitanie", f"{prix * random.uniform(0.78, 0.86):.2f}", random.choice([5, 6, 7]), random.choice([6, 10, 12])))

    with open(SORTIE / "stock.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["cip13", "libelle", "stock"])
        w.writerows(stock)

    with open(SORTIE / "ventes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["date", "cip13", "quantite"])
        w.writerows(ventes)

    with open(SORTIE / "offres.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(["cip13", "fournisseur", "prix_unitaire", "delai_jours", "colisage", "quantite_disponible", "peremption"])
        w.writerows(o + ("", "") for o in offres)
        for rang, part, quantite, mois in DESTOCKAGE:
            prix = PRODUITS[rang - 1][1]
            peremption = FIN + timedelta(days=30 * mois)
            w.writerow((cip13(rang), "confrere-toulouse-nord", f"{prix * part:.2f}", 2, 1, quantite, peremption.isoformat()))

    print(f"{len(stock)} produits, {len(ventes)} lignes de ventes, {len(offres) + len(DESTOCKAGE)} offres -> {SORTIE}")


if __name__ == "__main__":
    main()
