import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Comparaison, type Statistiques } from '@/api'
import { formaterEuros, formaterJour, formaterNombre } from '@/format'
import { useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { Chiffre, Chiffres } from '@/components/chiffres'
import { BarreListe, ChampRecherche, PageEcran, Segments, Tableau, type Colonne } from '@/components/liste'
import { Skeleton } from '@/components/ui/skeleton'
import { TYPES_FOURNISSEUR } from '@/ecrans/FicheProduit'
import { GraphiquesStatistiques } from '@/ecrans/GraphiquesStatistiques'

type ProduitStat = Statistiques['produits'][number]
type FournisseurStat = Statistiques['fournisseurs'][number]
type Vue = 'tous' | 'hausse' | 'baisse' | 'ecart'

const PERIODES = [
  { valeur: '4', libelle: '4 semaines' },
  { valeur: '6', libelle: '6 semaines' },
  { valeur: '12', libelle: '12 semaines' },
] as const

const pourcent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })

/** L'évolution face à la période précédente : +8 %, −12 %, ou rien quand l'historique ne la couvre pas. */
function evolution(valeur: number, avant: number | null) {
  if (avant === null) return null
  if (avant === 0) return valeur > 0 ? Infinity : 0
  return (valeur - avant) / avant
}

function Evolution({ valeur, avant, seuil = 0.1 }: { valeur: number; avant: number | null; seuil?: number }) {
  const e = evolution(valeur, avant)
  if (e === null) return <span className="text-muted-foreground">—</span>
  if (e === Infinity) return <span>nouveau</span>
  return <span className={cn(Math.abs(e) >= seuil && 'font-medium text-titre')}>{pourcent.format(e)}</span>
}

const detailEvolution = (c: Comparaison, periode: string) => {
  const e = evolution(c.valeur, c.avant)
  return e === null || e === Infinity ? undefined : `${pourcent.format(e)} vs ${periode} avant`
}

/** La consommation de l'officine et ses réassorts, semaine par semaine, produit par produit, fournisseur par fournisseur. */
export function StatistiquesEcran() {
  const [semaines, setSemaines] = useState('4')
  const stats = useQuery({ queryKey: ['statistiques', semaines], queryFn: () => api.statistiques(Number(semaines)) })

  return (
    <PageEcran
      titre="Statistiques"
      pleineLargeur
      actions={
        <>
          {stats.data && (
            <span className="texte-meta tabular">
              du {formaterJour(stats.data.debut)} au {formaterJour(stats.data.fin)}
            </span>
          )}
          <Segments etiquette="Période" valeur={semaines} onChange={setSemaines} options={[...PERIODES]} />
        </>
      }
    >
      {stats.isError ? (
        <p className="texte-donnee text-destructive">{stats.error.message}</p>
      ) : !stats.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Contenu stats={stats.data} />
      )}
    </PageEcran>
  )
}

function Contenu({ stats }: { stats: Statistiques }) {
  const s = stats.synthese
  const periode = `${stats.semaines} sem.`
  const ratio = s.consommation.valeur > 0 ? s.achats.valeur / s.consommation.valeur : null

  return (
    <div className="flex flex-col gap-6">
      <Chiffres colonnes={5}>
        <Chiffre intitule="Boîtes vendues" valeur={formaterNombre(s.boitesVendues.valeur)} detail={detailEvolution(s.boitesVendues, periode)} />
        <Chiffre intitule="Consommation" valeur={formaterEuros(s.consommation.valeur)} detail="valorisée au prix d’achat" />
        <Chiffre
          intitule="Réassort"
          valeur={formaterEuros(s.achats.valeur)}
          detail={`${formaterNombre(s.commandes.valeur)} commandes${detailEvolution(s.achats, periode) ? ` · ${detailEvolution(s.achats, periode)!.split(' ')[0]}` : ''}`}
        />
        <Chiffre
          intitule="Réassort / consommation"
          valeur={ratio === null ? '—' : `${Math.round(ratio * 100)} %`}
          ton={ratio !== null && (ratio > 1.15 || ratio < 0.85) ? 'surveiller' : undefined}
          detail={ratio === null ? undefined : ratio > 1.05 ? 'le stock grossit' : ratio < 0.95 ? 'le stock diminue' : 'stock stable'}
        />
        <Chiffre
          intitule="Livraisons à l’heure"
          valeur={s.livraisonsALHeure === null ? '—' : `${s.livraisonsALHeure} %`}
          detail={s.delaiReel !== null && s.delaiAnnonce !== null ? `${formaterNombre(s.delaiReel)} j constatés pour ${formaterNombre(s.delaiAnnonce)} j annoncés` : undefined}
        />
      </Chiffres>

      <GraphiquesStatistiques stats={stats} />

      <ConsommationParProduit stats={stats} />

      <section className="flex flex-col gap-3">
        <h2 className="texte-section">Fournisseurs</h2>
        <Tableau
          libelle="Réassort par fournisseur"
          colonnes={FOURNISSEURS}
          lignes={stats.fournisseurs}
          idLigne={(f) => f.fournisseur}
          vide="Aucune commande sur la période."
        />
      </section>
    </div>
  )
}

/** Ventes semaine par semaine, en petit : la tendance d'un produit se lit dans sa ligne. */
function Tendance({ valeurs }: { valeurs: number[] }) {
  const max = Math.max(1, ...valeurs)
  const largeur = 72
  const hauteur = 20
  const pas = valeurs.length > 1 ? largeur / (valeurs.length - 1) : 0
  const points = valeurs.map((v, i) => `${(i * pas).toFixed(1)},${(hauteur - 2 - (v / max) * (hauteur - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={largeur} height={hauteur} className="overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ConsommationParProduit({ stats }: { stats: Statistiques }) {
  const { ouvrir } = useFicheProduit()
  const [vue, setVue] = useState<Vue>('tous')
  const [recherche, setRecherche] = useState('')
  const e = (p: ProduitStat) => evolution(p.vendues, p.venduesAvant)
  const ecart = (p: ProduitStat) => p.achetees - p.vendues
  // Un écart de réassort se juge à l'échelle du produit : plus d'une semaine de ventes acheté en trop ou en moins.
  const ecartNotable = (p: ProduitStat) => Math.abs(ecart(p)) > Math.max(5, p.vendues / stats.semaines)
  const filtres: Record<Vue, (p: ProduitStat) => boolean> = {
    tous: () => true,
    hausse: (p) => (e(p) ?? 0) >= 0.1 && p.vendues >= 5,
    baisse: (p) => (e(p) ?? 0) <= -0.1 && (p.venduesAvant ?? 0) >= 5,
    ecart: ecartNotable,
  }
  const cherche = recherche.trim().toLowerCase()
  const visibles = stats.produits.filter((p) => filtres[vue](p) && (!cherche || p.libelle.toLowerCase().includes(cherche) || p.cip13.includes(cherche)))

  const colonnes: Colonne<ProduitStat>[] = [
    { id: 'produit', libelle: 'Produit', rendu: (p) => p.libelle, tri: (p) => p.libelle },
    { id: 'tendance', libelle: 'Par semaine', rendu: (p) => <Tendance valeurs={p.parSemaine} />, largeur: 104, masqueeSous: 'sm' },
    { id: 'vendues', libelle: 'Vendues', rendu: (p) => formaterNombre(p.vendues), tri: (p) => p.vendues, alignement: 'droite', largeur: 90 },
    {
      id: 'evolution',
      libelle: 'Évolution',
      rendu: (p) => <Evolution valeur={p.vendues} avant={p.venduesAvant} />,
      tri: (p) => (e(p) === Infinity ? 99 : e(p)),
      alignement: 'droite',
      largeur: 100,
      masqueeSous: 'md',
    },
    { id: 'semaine', libelle: 'Par sem.', rendu: (p) => formaterNombre(p.vendues / stats.semaines), tri: (p) => p.vendues, alignement: 'droite', largeur: 90, masqueeSous: 'xl' },
    { id: 'achetees', libelle: 'Réassorties', rendu: (p) => formaterNombre(p.achetees), tri: (p) => p.achetees, alignement: 'droite', largeur: 110 },
    {
      id: 'ecart',
      libelle: 'Écart',
      rendu: (p) => (
        <span className={cn(ecartNotable(p) ? 'font-medium text-st-surveiller' : 'text-muted-foreground')}>
          {ecart(p) > 0 ? '+' : ''}
          {formaterNombre(ecart(p))}
        </span>
      ),
      tri: ecart,
      alignement: 'droite',
      largeur: 80,
      masqueeSous: 'md',
    },
    { id: 'stock', libelle: 'Stock', rendu: (p) => p.stock, tri: (p) => p.stock, alignement: 'droite', largeur: 70, masqueeSous: 'lg' },
    { id: 'consommation', libelle: 'Consommation', rendu: (p) => formaterEuros(p.consommation), tri: (p) => p.consommation, alignement: 'droite', largeur: 120 },
  ]

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="texte-section">Consommation par produit</h2>
        <span className="texte-discret tabular">{visibles.length}</span>
      </div>
      <BarreListe>
        <ChampRecherche etiquette="Produit ou CIP13" valeur={recherche} onChange={setRecherche} />
        <Segments
          etiquette="Produits affichés"
          valeur={vue}
          onChange={setVue}
          options={[
            { valeur: 'tous', libelle: 'Tous', nombre: stats.produits.length },
            ...(stats.comparable
              ? [
                  { valeur: 'hausse' as const, libelle: 'En hausse', nombre: stats.produits.filter(filtres.hausse).length },
                  { valeur: 'baisse' as const, libelle: 'En baisse', nombre: stats.produits.filter(filtres.baisse).length },
                ]
              : []),
            { valeur: 'ecart', libelle: 'Réassort à revoir', nombre: stats.produits.filter(filtres.ecart).length },
          ]}
        />
      </BarreListe>
      <Tableau
        libelle="Consommation par produit"
        colonnes={colonnes}
        lignes={visibles}
        idLigne={(p) => p.cip13}
        onOuvrir={(p) => ouvrir(p.cip13)}
        vide="Aucun produit."
      />
    </section>
  )
}

const FOURNISSEURS: Colonne<FournisseurStat>[] = [
  {
    id: 'fournisseur',
    libelle: 'Fournisseur',
    rendu: (f) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{f.fournisseur}</span>
        <span className="texte-meta truncate">{TYPES_FOURNISSEUR[f.typeFournisseur]}</span>
      </span>
    ),
    tri: (f) => f.fournisseur,
  },
  { id: 'livraisons', libelle: 'Livraisons', rendu: (f) => f.livraisons, tri: (f) => f.livraisons, alignement: 'droite', largeur: 100 },
  { id: 'boites', libelle: 'Boîtes', rendu: (f) => formaterNombre(f.boites), tri: (f) => f.boites, alignement: 'droite', largeur: 90, masqueeSous: 'md' },
  { id: 'montant', libelle: 'Montant HT', rendu: (f) => formaterEuros(f.montant), tri: (f) => f.montant, alignement: 'droite', largeur: 120 },
  { id: 'annonce', libelle: 'Délai annoncé', rendu: (f) => (f.delaiAnnonce === null ? '—' : `${formaterNombre(f.delaiAnnonce)} j`), tri: (f) => f.delaiAnnonce, alignement: 'droite', largeur: 120, masqueeSous: 'sm' },
  {
    id: 'reel',
    libelle: 'Délai constaté',
    rendu: (f) =>
      f.delaiReel === null ? (
        '—'
      ) : (
        <span className={cn(f.delaiAnnonce !== null && f.delaiReel > f.delaiAnnonce && 'font-medium text-st-surveiller')}>{formaterNombre(f.delaiReel)} j</span>
      ),
    tri: (f) => f.delaiReel,
    alignement: 'droite',
    largeur: 120,
  },
  {
    id: 'heure',
    libelle: 'À l’heure',
    rendu: (f) => (f.recues ? `${f.aLHeure} / ${f.recues}` : '—'),
    tri: (f) => (f.recues ? f.aLHeure / f.recues : null),
    alignement: 'droite',
    largeur: 100,
  },
]
