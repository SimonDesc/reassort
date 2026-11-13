import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ShoppingCartIcon } from 'lucide-react'
import { api, type Panier, type Prevision, type StatutProduit } from '@/api'
import { formaterEcheance, formaterEuros, formaterNombre } from '@/format'
import { allerA, lireParametre, useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { BarreListe, ChampRecherche, PageEcran, Segments, Tableau, type Colonne } from '@/components/liste'
import { BadgeStatut } from '@/components/statut'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { FenetrePanier } from '@/ecrans/FenetrePanier'
import { EtatVide } from '@/components/illustration'

type Filtre = 'A_TRAITER' | StatutProduit | 'TOUS'
const VUES: { valeur: Filtre; libelle: string }[] = [
  { valeur: 'A_TRAITER', libelle: 'À traiter' },
  { valeur: 'RUPTURE_IMMINENTE', libelle: 'Rupture' },
  { valeur: 'A_COMMANDER', libelle: 'À commander' },
  { valeur: 'COMMANDE', libelle: 'Commandé' },
  { valeur: 'OK', libelle: 'Couvert' },
  { valeur: 'SURSTOCK', libelle: 'Surstock' },
  { valeur: 'TOUS', libelle: 'Tous' },
]
const A_TRAITER = new Set<StatutProduit>(['RUPTURE_IMMINENTE', 'A_COMMANDER'])
const ORDRE: Record<StatutProduit, number> = { RUPTURE_IMMINENTE: 0, A_COMMANDER: 1, COMMANDE: 2, OK: 3, SURSTOCK: 4 }

const retient = (filtre: Filtre, p: Prevision) =>
  filtre === 'TOUS' || (filtre === 'A_TRAITER' ? A_TRAITER.has(p.statut) : p.statut === filtre)
const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const HORIZONS = [
  { valeur: '7', libelle: '7 j' },
  { valeur: '14', libelle: '14 j' },
  { valeur: '30', libelle: '30 j' },
] as const

const COLONNES: Colonne<Prevision>[] = [
  { id: 'produit', libelle: 'Produit', rendu: (p) => p.libelle, tri: (p) => p.libelle },
  { id: 'cip', libelle: 'CIP13', rendu: (p) => <span className="tabular text-muted-foreground">{p.cip13}</span>, largeur: 125, masqueeSous: '2xl' },
  { id: 'statut', libelle: 'Statut', rendu: (p) => <BadgeStatut statut={p.statut} />, tri: (p) => ORDRE[p.statut], largeur: 140 },
  { id: 'stock', libelle: 'Stock', rendu: (p) => p.stock, tri: (p) => p.stock, alignement: 'droite', largeur: 70 },
  {
    id: 'enCommande',
    libelle: 'En commande',
    rendu: (p) => (p.enCommande > 0 ? p.enCommande : <span className="text-muted-foreground">—</span>),
    tri: (p) => p.enCommande,
    alignement: 'droite',
    largeur: 105,
    masqueeSous: 'xl',
  },
  { id: 'ventes', libelle: 'Ventes / j', rendu: (p) => formaterNombre(p.venteMoyenneParJour), tri: (p) => p.venteMoyenneParJour, alignement: 'droite', largeur: 90, masqueeSous: 'md' },
  {
    id: 'couverture',
    libelle: 'Couverture',
    rendu: (p) => (p.couvertureJours === null ? <span className="text-muted-foreground">—</span> : `${formaterNombre(p.couvertureJours)} j`),
    tri: (p) => p.couvertureJours,
    alignement: 'droite',
    largeur: 100,
  },
  {
    id: 'rupture',
    libelle: 'Rupture prévue',
    rendu: (p) =>
      p.ruptureEstimeeLe && p.couvertureJours !== null && p.couvertureJours < 60 ? (
        <span className={cn(p.statut === 'RUPTURE_IMMINENTE' && 'font-medium text-st-rupture')}>{formaterEcheance(p.ruptureEstimeeLe)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    tri: (p) => p.ruptureEstimeeLe,
    largeur: 120,
    masqueeSous: 'sm',
  },
  {
    id: 'suggestion',
    libelle: 'À commander',
    rendu: (p) => (p.quantiteSuggeree > 0 ? <span className="font-semibold text-titre">{p.quantiteSuggeree}</span> : ''),
    tri: (p) => p.quantiteSuggeree,
    alignement: 'droite',
    largeur: 110,
  },
]

/** Le réassort : ce qui va manquer, et le panier qui l'évite. */
export function Commander() {
  const { ouvrir } = useFicheProduit()
  const [horizon, setHorizon] = useState('7')
  const [filtre, setFiltre] = useState<Filtre>(() => (lireParametre('statut') as Filtre | null) ?? 'A_TRAITER')
  const [recherche, setRecherche] = useState('')
  const [panier, setPanier] = useState<Panier | null>(null)

  const previsions = useQuery({ queryKey: ['previsions', Number(horizon)], queryFn: () => api.previsions(Number(horizon)) })
  const dernier = useQuery({ queryKey: ['dernier-panier'], queryFn: api.dernierPanier })
  const proposer = useMutation({ mutationFn: () => api.proposerPanier(Number(horizon)), onSuccess: setPanier })

  // « Préparer une commande » de la barre latérale arrive ici avec ?panier=nouveau : le panier se prépare aussitôt.
  const demande = useRef(lireParametre('panier') === 'nouveau')
  useEffect(() => {
    if (!demande.current) return
    demande.current = false
    allerA('reassort')
    proposer.mutate()
  }, [proposer])

  const liste = previsions.data ?? []
  const aCommander = liste.filter((p) => p.quantiteSuggeree > 0).length
  const cherche = normaliser(recherche.trim())
  const visibles = liste.filter((p) => retient(filtre, p) && (!cherche || normaliser(p.libelle).includes(cherche) || p.cip13.includes(cherche)))
  const brouillon = dernier.data?.statut === 'BROUILLON' && dernier.data.nombreLignes > 0 ? dernier.data : null

  return (
    <PageEcran
      titre="Réassort"
      nombre={previsions.data ? visibles.length : undefined}
      pleineLargeur
      actions={
        <>
          <Segments etiquette="Horizon de commande" valeur={horizon} onChange={setHorizon} options={[...HORIZONS]} />
          {brouillon && (
            <Button variant="outline" onClick={() => setPanier(brouillon)}>
              Panier en cours
              <span className="tabular text-muted-foreground">{formaterEuros(brouillon.total)}</span>
            </Button>
          )}
          <Button onClick={() => proposer.mutate()} disabled={aCommander === 0 || proposer.isPending}>
            {proposer.isPending ? <Spinner data-icon="inline-start" /> : <ShoppingCartIcon data-icon="inline-start" />}
            Préparer le panier
          </Button>
        </>
      }
    >
      {proposer.isError && <p className="texte-donnee text-destructive">{proposer.error.message}</p>}
      <BarreListe>
        <ChampRecherche etiquette="Produit ou CIP13" valeur={recherche} onChange={setRecherche} />
        <Segments
          etiquette="Statut"
          valeur={filtre}
          onChange={setFiltre}
          options={VUES.map((v) => ({ ...v, nombre: previsions.data ? liste.filter((p) => retient(v.valeur, p)).length : undefined }))}
        />
      </BarreListe>
      <Tableau
        libelle="Prévisions de stock"
        colonnes={COLONNES}
        lignes={visibles}
        idLigne={(p) => p.cip13}
        onOuvrir={(p) => ouvrir(p.cip13)}
        chargement={previsions.isPending}
        erreur={previsions.error?.message}
        vide={<EtatVide nom="anticiper-ruptures">Aucun produit dans cette vue.</EtatVide>}
      />
      {panier && <FenetrePanier key={panier.id} panier={panier} onFermer={() => setPanier(null)} />}
    </PageEcran>
  )
}
