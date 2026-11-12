-- Données de l'officine, telles que les fournit le logiciel de gestion d'officine (LGO)
CREATE TABLE produit (
    cip13    CHAR(13)     PRIMARY KEY,
    libelle  VARCHAR(200) NOT NULL
);

CREATE TABLE stock (
    cip13      CHAR(13)    PRIMARY KEY REFERENCES produit,
    quantite   INTEGER     NOT NULL CHECK (quantite >= 0),
    releve_le  TIMESTAMPTZ NOT NULL
);

-- Ventes agrégées par jour : la prévision n'a pas besoin du détail des tickets
CREATE TABLE vente (
    cip13     CHAR(13) NOT NULL REFERENCES produit,
    jour      DATE     NOT NULL,
    quantite  INTEGER  NOT NULL CHECK (quantite >= 0),
    PRIMARY KEY (cip13, jour)
);

-- Catalogue de la marketplace : fournisseurs classiques et pharmacies qui déstockent
CREATE TABLE fournisseur (
    id      VARCHAR(40)   PRIMARY KEY,
    nom     VARCHAR(120)  NOT NULL,
    type    VARCHAR(20)   NOT NULL CHECK (type IN ('GROSSISTE', 'DEPOSITAIRE', 'LABORATOIRE', 'CONFRERE')),
    franco  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (franco >= 0)
);

CREATE TABLE offre (
    id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cip13           CHAR(13)      NOT NULL REFERENCES produit,
    fournisseur_id  VARCHAR(40)   NOT NULL REFERENCES fournisseur,
    prix_unitaire   NUMERIC(10,2) NOT NULL CHECK (prix_unitaire > 0),
    delai_jours     INTEGER       NOT NULL CHECK (delai_jours >= 0),
    colisage        INTEGER       NOT NULL DEFAULT 1 CHECK (colisage > 0),
    -- Offres de déstockage d'un confrère : un lot limité, avec sa date de péremption
    quantite_disponible  INTEGER  CHECK (quantite_disponible > 0),
    peremption           DATE,
    UNIQUE (cip13, fournisseur_id)
);

-- Paniers de commande : proposés, modifiés et validés par le pharmacien, puis reçus fournisseur par fournisseur
CREATE TABLE panier (
    id             UUID        PRIMARY KEY,
    statut         VARCHAR(20) NOT NULL CHECK (statut IN ('BROUILLON', 'VALIDE', 'RECU')),
    horizon_jours  INTEGER     NOT NULL CHECK (horizon_jours > 0),
    cree_le        TIMESTAMPTZ NOT NULL,
    valide_le      TIMESTAMPTZ,
    recu_le        TIMESTAMPTZ
);

CREATE TABLE ligne_panier (
    id             BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    panier_id      UUID          NOT NULL REFERENCES panier ON DELETE CASCADE,
    offre_id       BIGINT        NOT NULL REFERENCES offre,
    quantite       INTEGER       NOT NULL CHECK (quantite > 0),
    prix_unitaire  NUMERIC(10,2) NOT NULL,
    -- Pourquoi cette ligne : ce que disait la prévision au moment de la proposition
    statut_produit       VARCHAR(20) NOT NULL,
    quantite_suggeree    INTEGER     NOT NULL,
    couverture_jours     NUMERIC(6,1),
    livre_apres_rupture  BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Réception des cartons à l'officine : le stock augmente à cette date
    recue_le             TIMESTAMPTZ
);

CREATE INDEX ON offre (cip13);
CREATE INDEX ON ligne_panier (panier_id);

-- Annonces de déstockage publiées par la pharmacie : son surstock, proposé aux confrères sur la marketplace
CREATE TABLE annonce_destockage (
    id             BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cip13          CHAR(13)      NOT NULL REFERENCES produit,
    quantite       INTEGER       NOT NULL CHECK (quantite > 0),
    prix_unitaire  NUMERIC(10,2) NOT NULL CHECK (prix_unitaire > 0),
    peremption     DATE          NOT NULL,
    publiee_le     TIMESTAMPTZ   NOT NULL
);

CREATE UNIQUE INDEX ON annonce_destockage (cip13);

-- Réglages de la prévision, modifiables par le pharmacien (une seule ligne)
CREATE TABLE reglages (
    id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    jours_historique      INTEGER NOT NULL CHECK (jours_historique BETWEEN 7 AND 90),
    stock_securite_jours  INTEGER NOT NULL CHECK (stock_securite_jours BETWEEN 0 AND 30),
    surstock_jours        INTEGER NOT NULL CHECK (surstock_jours BETWEEN 30 AND 365),
    conserver_jours       INTEGER NOT NULL CHECK (conserver_jours BETWEEN 7 AND 365),
    CHECK (conserver_jours <= surstock_jours)
);

INSERT INTO reglages (jours_historique, stock_securite_jours, surstock_jours, conserver_jours) VALUES (28, 3, 90, 60);
