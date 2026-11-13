# Réassort

**Anticiper les ruptures, préparer la commande au meilleur fournisseur, et revendre aux confrères ce qui dort en réserve.**

Démo en ligne : **https://reassort.92.113.26.165.sslip.io** (données fictives, réinitialisables depuis « Réglages »)

---

## Le besoin

Dans une officine, la commande se fait souvent de mémoire ou en relisant les ventes de la veille. Deux pertes en découlent :

- **la rupture** : le patient repart sans son traitement, et la vente part chez le confrère d'en face ;
- **le surstock** : des boîtes qui ne tournent plus immobilisent de la trésorerie, puis se périment.

Pour chaque produit, le pharmacien a pourtant tout ce qu'il faut dans son logiciel de gestion d'officine (LGO) : le stock, l'historique des ventes, et plusieurs fournisseurs aux prix, délais et minimums de commande différents (grossiste-répartiteur, dépositaire, laboratoire en direct, lots de déstockage d'un confrère).

Réassort fait le calcul à sa place, **du catalogue produits à la réception des cartons** :

1. **Prévoir** : à partir des ventes récentes, il estime le jour où chaque produit sera vide et le classe : rupture imminente, à commander, commandé, couvert, surstock.
2. **Commander** : il propose un panier qui couvre l'horizon choisi (7, 14 ou 30 jours), chaque ligne au fournisseur le moins cher *parmi ceux qui livrent avant la rupture*, arrondi au colis, regroupé en une commande par fournisseur avec le reste à atteindre pour le franco de port. Le pharmacien modifie les quantités, change de fournisseur, retire une ligne, puis valide.
3. **Réceptionner** : à l'arrivée des cartons, une réception par fournisseur remonte le stock.
4. **Déstocker** : ce qui dépasse le seuil de surstock est proposé à la revente sur la marketplace, avec un prix conseillé ; l'annonce se publie, se modifie ou se retire.

Ce sont les deux faces d'une même marketplace : le lot qu'une pharmacie publie en déstockage devient une offre dans le panier d'une autre.

## Visite de la démo

| Écran | Ce qu'on y fait |
|---|---|
| **Tableau de bord** | Valeur du stock, surstock immobilisé, commandes en cours, économies sur 90 jours face au grossiste seul ; état du stock par statut ; ventes par semaine ; achats par fournisseur ; produits à traiter en priorité. |
| **Réassort** | Prévisions et panier sur le même écran : pour chaque produit, la quantité à commander (au colis près), le fournisseur et le montant ; en bas, le franco par fournisseur, le total et la validation. Un produit couvert s'ajoute d'un clic. |
| **Fiche produit** | S'ouvre depuis n'importe quel écran : ventes jour par jour sur 90 jours, stock prévu sur 30 jours (livraisons attendues comprises), offres comparées, commandes en cours. |
| **Commandes** | Historique et réception par fournisseur. |
| **Déstockage** | Produits en surstock, quantité à céder, publication des annonces. |
| **Réglages** | Historique de ventes, stock de sécurité, seuil de surstock, stock à conserver ; réinitialisation de la démo. |

Un parcours de deux minutes : *Réassort* → ajuster une quantité, passer une ligne chez un autre fournisseur → *Valider et commander* → *Commandes* → *Réceptionner* → retour au *Tableau de bord*, où la rupture a disparu.

## Les règles de calcul

Volontairement simples, explicables au comptoir, et couvertes par les tests (`CalculPrevisionTest`, `ChoixOffreTest`).

- **Vente moyenne** = ventes des N derniers jours ÷ N (28 jours par défaut, jours sans vente compris).
- **Couverture** = stock ÷ vente moyenne, en jours.
- **Rupture imminente** si la couverture est inférieure au délai de livraison le plus court + le stock de sécurité ; **à commander** si elle ne tient pas en plus l'horizon de commande ; **commandé** si ce qui est déjà en commande suffit.
- **Surstock** au-delà de 90 jours de couverture, ou si le produit ne se vend plus ; on propose de céder ce qui dépasse 60 jours de ventes.
- **Choix de l'offre** : la moins chère au total (après arrondi au colis) parmi celles qui livrent avant la rupture. Un lot de déstockage n'est retenu que s'il couvre le besoin et se périme au moins 3 mois après la livraison. Si aucune offre n'arrive à temps, la plus rapide est retenue et la ligne signalée « livrée après la rupture ».

## Un serveur MCP pour les assistants

Réassort expose ses actions à un assistant (Claude Desktop, Claude Code…) via le protocole MCP, sur `/mcp` :

| Outil | Rôle |
|---|---|
| `ruptures_a_venir` | Les produits à commander et la date de rupture estimée |
| `proposer_panier` | Prépare le panier, une commande par fournisseur |
| `valider_panier` | Transmet les commandes, **uniquement sur accord explicite du pharmacien** |
| `produits_a_destocker` | Le surstock, avec quantité et prix conseillés |
| `publier_annonce_destockage` | Publie un lot sur la marketplace, **sur accord explicite** |

On peut alors demander « *Qu'est-ce que je dois commander pour la semaine ?* » et obtenir le panier commenté. En ligne, l'accès exige un jeton (`Authorization: Bearer …`, variable `REASSORT_MCP_JETON`) : l'écran « Réglages » de la démo le donne, avec la configuration prête à copier pour Claude Code, Claude Desktop et l'inspecteur MCP ; en local, `.mcp.json` branche directement Claude Code sur http://localhost:8080/mcp.

## Choix techniques

| | |
|---|---|
| **Back** | Java 21, Spring Boot 4, Spring JDBC (`JdbcClient`, du SQL lisible plutôt qu'un ORM), Flyway, PostgreSQL 17, erreurs au format Problem Details |
| **MCP** | Spring AI 2 (`@McpTool`), transport HTTP « streamable » |
| **Front** | React 19, TypeScript, Vite, Tailwind 4, composants shadcn/ui, TanStack Query, Recharts |
| **Tests** | 75 tests JUnit sur un vrai PostgreSQL embarqué (aucune base à installer), dont un client MCP de bout en bout |
| **Livraison** | Une image Docker (le front est servi par Spring Boot), `docker-compose.yml` avec la base, déployée par Coolify sur un VPS ; CI GitHub Actions |

Le code est organisé par domaine métier (`prevision`, `panier`, `destockage`, `produit`, `reglages`, `mcp`), pas par couche technique. Le calcul de prévision et le choix de l'offre sont des fonctions pures, testées sans base.

Les données de démonstration (40 produits, 4 fournisseurs, 90 jours de ventes) sont générées de façon déterministe par `tools/generer_demo.py`, puis recalées au démarrage pour que la dernière vente tombe toujours la veille.

## Et en production ?

Ce que la démo simplifie, et comment je le traiterais :

- **Les données du LGO.** Ici, des CSV derrière une interface `SourceOfficine`. En vrai, un connecteur par LGO (Winpharma, LGPI, Smart Rx…) qui pousse stock et ventes au fil de l'eau.
- **Les événements.** La validation d'un panier publie déjà un événement `PanierValide`, écouté après la transaction. C'est le point d'accroche naturel pour Kafka : transmission des commandes aux fournisseurs, mise à jour de la marketplace, notifications, sans coupler ces traitements au panier.
- **La prévision.** Une moyenne glissante ignore la saisonnalité (épidémies hivernales, allergies au printemps) et les tendances. Étape suivante : une saisonnalité hebdomadaire et annuelle, et des alertes quand les ventes décrochent de la prévision.
- **Les vraies offres.** Prix, remises par palier et disponibilités viendraient des fournisseurs et de la marketplace en temps réel, avec réservation du lot de déstockage au moment de la validation.
- **Plusieurs pharmacies.** Authentification, données cloisonnées par officine, et un jeton MCP par utilisateur plutôt qu'un jeton partagé.

## Lancer en local

Prérequis : Java 21+ et Node 24. Aucune base à installer : PostgreSQL est embarqué en local et dans les tests.

```bash
cd backend && ./mvnw spring-boot:test-run
```

```bash
cd frontend && npm install && npm run dev
```

Le front est sur http://localhost:5173, l'API sur http://localhost:8080. Les tests : `cd backend && ./mvnw verify`.

## Auteur

**Simon Descombes**, lead développeur full stack à Toulouse.

Plus de 10 ans dans le logiciel métier : dix ans à déployer et former sur une GMAO chez des centaines de clients (Carrefour, Système U, Eiffage…), puis développeur après la formation Holberton School (titre RNCP niveau 6, 2023-2024). Aujourd'hui, je pilote la modernisation des produits de Technic-Soft : application mobile réécrite en PWA React / Capacitor pour plus de 2 000 techniciens, migration d'un client lourd C++ de plus de 7 000 utilisateurs vers React / Symfony, RAG sur l'historique des réparations, GitLab et CI/CD montés de zéro, serveurs MCP internes. J'encadre une équipe de 2 à 4 développeurs et je code au quotidien avec des agents IA.

J'ai construit Réassort pour la candidature au poste de développeur fullstack du **Comptoir des Pharmacies**, sur le périmètre de l'offre : « du catalogue produits à la réception des cartons à l'officine, en passant par la publication d'offres et le process d'achat ». Même façon de travailler que celle décrite : comprendre le besoin métier avant d'écrire du code, back en Java / Spring Boot, front React / TypeScript, tests automatisés, conteneurisation et déploiement, agents IA dirigés et relus, serveur MCP.

- Email : [pro.descombes@gmail.com](mailto:pro.descombes@gmail.com)
- GitHub : [github.com/SimonDesc](https://github.com/SimonDesc)
