# Guide UI

Le front reprend la structure du système de design de Service-9000, un autre de mes projets (rôles de texte, composants `components/ui`). Sa palette et sa typographie s'inspirent de l'univers du Comptoir des Pharmacies : titres marine en Fira Sans, texte en DM Sans, vert pour l'action, fonds gris-bleu, filets lavande. Ce guide en garde les règles utiles à Réassort.

## Principes

1. **Une seule action principale par écran**, en bouton plein : « Valider le panier ». Le reste est en contour ou discret. Jamais deux boutons pleins à l'écran.
2. **Le statut d'un produit se lit d'un coup d'œil** : badge teinté clair, texte de la teinte, jamais de fond plein.
   | Statut | Badge | Sens |
   |---|---|---|
   | Couverture suffisante | `ok` | rien à faire |
   | À surveiller | `surveiller` | la couverture passe sous le délai + sécurité dans l'horizon |
   | Rupture | `rupture` | la couverture est inférieure au délai de livraison : seul usage du rouge |
   | Commandé | `commande` | une ligne d'un panier validé couvre le besoin |
3. **Un vide est une action** : pas de « — » ; un état vide propose quoi faire (« Importer un CSV »).
4. **Dense, pas tassé** : les tableaux sont denses (un filet entre les lignes) ; l'espace sépare les sections, pas les lignes.
5. **Pas de phrase d'aide** : si une phrase semble nécessaire, l'écran n'est pas assez clair.

## Texte

Un texte prend un rôle (`index.css`), jamais une taille, une graisse ou un gris écrits à la main : `texte-titre`, `texte-section`, `texte-intitule`, `texte-valeur`, `texte-donnee`, `texte-discret`, `texte-meta`. La couleur ne sert qu'au sens (statut, alerte, action).

## Chiffres

Montants et quantités alignés à droite, en chiffres tabulaires (`tabular`) ; les totaux s'alignent sous leur colonne. Les montants s'écrivent en euros à la française (`12,40 €`).

## Espacement

4, 8, 12, 16, 24, 32 px. 12 px entre deux cartes voisines, 24 px de marge intérieure d'une carte (`p-carte`), 32 px entre les zones d'un écran. Pas de carte dans une carte.

## Fenêtres

Toute fenêtre passe par `Dialog` : un nom visible (`DialogHeader`, `DialogTitle`), un contenu qui défile seul (`DialogBody`), des boutons dans le pied (`DialogFooter`) et une largeur parmi `petite`, `moyenne`, `grande`. Une décision (valider un panier) se prend dans une fenêtre ; un toast ne fait que confirmer.
