import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckIcon, MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react'
import { api, type CommandeFournisseur, type LignePanier, type OffreProduit, type Panier, type Prevision, type StatutProduit } from '@/api'
import { formaterEcheance, formaterEuros, formaterNombre, pluriel } from '@/format'
import { allerA, lireParametre, useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { BarreListe, ChampRecherche, PageEcran, Segments, Tableau, type Colonne } from '@/components/liste'
import { EtatVide, Illustration } from '@/components/illustration'
import { NomProduit } from '@/components/produit'
import { BadgeStatut } from '@/components/statut'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

type Filtre = 'A_TRAITER' | 'PANIER' | StatutProduit | 'TOUS'
const VUES: { valeur: Filtre; libelle: string }[] = [
  { valeur: 'A_TRAITER', libelle: 'À traiter' },
  { valeur: 'PANIER', libelle: 'Dans le panier' },
  { valeur: 'RUPTURE_IMMINENTE', libelle: 'Rupture' },
  { valeur: 'COMMANDE', libelle: 'Commandé' },
  { valeur: 'OK', libelle: 'Couvert' },
  { valeur: 'SURSTOCK', libelle: 'Surstock' },
  { valeur: 'TOUS', libelle: 'Tous' },
]
const A_TRAITER = new Set<StatutProduit>(['RUPTURE_IMMINENTE', 'A_COMMANDER'])
const ORDRE: Record<StatutProduit, number> = { RUPTURE_IMMINENTE: 0, A_COMMANDER: 1, COMMANDE: 2, OK: 3, SURSTOCK: 4 }

const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const HORIZONS = [
  { valeur: '7', libelle: '7 j' },
  { valeur: '14', libelle: '14 j' },
  { valeur: '30', libelle: '30 j' },
] as const

type Modification = { ligne: LignePanier; quantite?: number; offreId?: number; retirer?: boolean }

/** Ce qui ne doit pas ouvrir la fiche quand on clique dedans : boutons et listes de la ligne. */
const Interactif = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={className} onClick={(e) => e.stopPropagation()}>
    {children}
  </div>
)

/**
 * Le réassort sur un seul écran : chaque produit avec sa prévision et, à côté, ce qu'on en commande. Le panier est un
 * brouillon tenu par le serveur ; chaque changement le recalcule (totaux, francos). Il se valide en bas d'écran.
 */
export function Commander() {
  const client = useQueryClient()
  const { ouvrir } = useFicheProduit()
  const [horizon, setHorizon] = useState('7')
  const [filtre, setFiltre] = useState<Filtre>(() => (lireParametre('statut') as Filtre | null) ?? 'A_TRAITER')
  const [recherche, setRecherche] = useState('')
  const [panier, setPanier] = useState<Panier | null>(null)
  const [valide, setValide] = useState<Panier | null>(null)

  const previsions = useQuery({ queryKey: ['previsions', Number(horizon)], queryFn: () => api.previsions(Number(horizon)) })
  const dernier = useQuery({ queryKey: ['dernier-panier'], queryFn: api.dernierPanier })
  const tous = (previsions.data ?? []).map((p) => p.cip13)
  const offres = useQuery({ queryKey: ['offres', 'toutes'], queryFn: () => api.offres(tous), enabled: tous.length > 0, staleTime: 60_000 })

  const recu = (nouveau: Panier) => {
    setPanier(nouveau)
    client.setQueryData(['dernier-panier'], nouveau)
  }
  const proposer = useMutation({ mutationFn: (h: number) => api.proposerPanier(h), onSuccess: recu })
  const modifier = useMutation({
    mutationFn: ({ ligne, quantite, offreId, retirer }: Modification) =>
      retirer ? api.retirerLigne(panier!.id, ligne.id) : api.modifierLigne(panier!.id, ligne.id, { quantite, offreId }),
    onSuccess: recu,
  })
  const ajouter = useMutation({ mutationFn: (cip13: string) => api.ajouterProduit(panier!.id, cip13), onSuccess: recu })
  const valider = useMutation({
    mutationFn: () => api.validerPanier(panier!.id),
    onSuccess: (nouveau) => {
      setValide(nouveau)
      setPanier(null)
      for (const cle of ['previsions', 'tableau-de-bord', 'historique', 'dernier-panier', 'fiche']) client.invalidateQueries({ queryKey: [cle] })
    },
  })

  // À l'arrivée, on reprend le brouillon en cours ; sans brouillon (ou avec ?panier=nouveau), le serveur en propose un.
  const nouveau = useRef(lireParametre('panier') === 'nouveau')
  useEffect(() => {
    if (panier || valide || proposer.isPending || dernier.isPending) return
    if (nouveau.current) {
      nouveau.current = false
      allerA('reassort')
    } else if (dernier.data?.statut === 'BROUILLON') {
      setPanier(dernier.data)
      setHorizon(String(dernier.data.horizonJours))
      return
    }
    proposer.mutate(Number(horizon))
  }, [panier, valide, dernier.isPending, dernier.data, proposer, horizon])

  const changerHorizon = (h: string) => {
    setHorizon(h)
    setValide(null)
    proposer.mutate(Number(h))
  }

  const lignes = new Map((panier?.commandes ?? []).flatMap((c) => c.lignes.map((l) => [l.cip13, l] as const)))
  const occupee = (l: LignePanier) => (modifier.isPending && modifier.variables.ligne.id === l.id) || proposer.isPending
  const retient = (f: Filtre, p: Prevision) =>
    f === 'TOUS' || (f === 'A_TRAITER' ? A_TRAITER.has(p.statut) : f === 'PANIER' ? lignes.has(p.cip13) : p.statut === f)

  const liste = previsions.data ?? []
  const cherche = normaliser(recherche.trim())
  const visibles = liste.filter((p) => retient(filtre, p) && (!cherche || normaliser(p.libelle).includes(cherche) || p.cip13.includes(cherche)))

  const colonnes: Colonne<Prevision>[] = [
    { id: 'produit', libelle: 'Produit', rendu: (p) => <NomProduit cip13={p.cip13} libelle={p.libelle} />, tri: (p) => p.libelle },
    { id: 'statut', libelle: 'Statut', rendu: (p) => <BadgeStatut statut={p.statut} />, tri: (p) => ORDRE[p.statut], largeur: 140, masqueeSous: 'md' },
    { id: 'stock', libelle: 'Stock', rendu: (p) => p.stock, tri: (p) => p.stock, alignement: 'droite', largeur: 66, masqueeSous: 'sm' },
    { id: 'ventes', libelle: 'Ventes / j', rendu: (p) => formaterNombre(p.venteMoyenneParJour), tri: (p) => p.venteMoyenneParJour, alignement: 'droite', largeur: 88, masqueeSous: 'xl' },
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
      largeur: 118,
      masqueeSous: 'lg',
    },
    {
      id: 'commande',
      libelle: 'Commande',
      rendu: (p) => {
        const ligne = lignes.get(p.cip13)
        if (!panier) return null
        if (!ligne) {
          return (
            <Interactif className="flex justify-end">
              <Button
                variant="outline"
                size="xs"
                disabled={ajouter.isPending || proposer.isPending}
                onClick={() => ajouter.mutate(p.cip13)}
              >
                {ajouter.isPending && ajouter.variables === p.cip13 ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                Ajouter
              </Button>
            </Interactif>
          )
        }
        return <Quantite ligne={ligne} offre={offres.data?.[p.cip13]?.find((o) => o.id === ligne.offreId)} occupee={occupee(ligne)} onModifier={(m) => modifier.mutate(m)} />
      },
      tri: (p) => lignes.get(p.cip13)?.quantite ?? -1,
      alignement: 'droite',
      largeur: 136,
    },
    {
      id: 'fournisseur',
      libelle: 'Fournisseur',
      rendu: (p) => {
        const ligne = lignes.get(p.cip13)
        return ligne ? (
          <Fournisseur ligne={ligne} offres={offres.data?.[p.cip13]} occupee={occupee(ligne)} onModifier={(m) => modifier.mutate(m)} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
      largeur: 250,
      masqueeSous: 'sm',
    },
    {
      id: 'montant',
      libelle: 'Montant',
      rendu: (p) => {
        const ligne = lignes.get(p.cip13)
        return ligne ? <span className="font-semibold text-titre">{formaterEuros(ligne.montant)}</span> : ''
      },
      tri: (p) => lignes.get(p.cip13)?.montant ?? -1,
      alignement: 'droite',
      largeur: 100,
      masqueeSous: 'sm',
    },
  ]

  const erreur = proposer.error ?? modifier.error ?? ajouter.error ?? valider.error

  return (
    <PageEcran
      titre="Réassort"
      nombre={previsions.data ? visibles.length : undefined}
      pleineLargeur
      actions={
        <>
          <Segments etiquette="Horizon de commande" valeur={horizon} onChange={changerHorizon} options={[...HORIZONS]} />
          <Button variant="outline" onClick={() => changerHorizon(horizon)} disabled={proposer.isPending}>
            {proposer.isPending ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
            Recalculer le panier
          </Button>
        </>
      }
    >
      <BarreListe>
        <ChampRecherche etiquette="Produit ou CIP13" valeur={recherche} onChange={setRecherche} />
        <Segments
          etiquette="Vue"
          valeur={filtre}
          onChange={setFiltre}
          options={VUES.map((v) => ({ ...v, nombre: previsions.data ? liste.filter((p) => retient(v.valeur, p)).length : undefined }))}
        />
      </BarreListe>
      <Tableau
        libelle="Prévisions et panier"
        colonnes={colonnes}
        lignes={visibles}
        idLigne={(p) => p.cip13}
        onOuvrir={(p) => ouvrir(p.cip13)}
        chargement={previsions.isPending}
        erreur={previsions.error?.message}
        vide={<EtatVide nom="anticiper-ruptures">Aucun produit dans cette vue.</EtatVide>}
        largeurMin={0}
      />
      {valide && <PanierValide panier={valide} onFermer={() => setValide(null)} onNouveau={() => changerHorizon(horizon)} />}
      {panier && (
        <BarrePanier panier={panier} erreur={erreur?.message} validation={valider.isPending} occupe={modifier.isPending || ajouter.isPending || proposer.isPending} onValider={() => valider.mutate()} />
      )}
    </PageEcran>
  )
}

/** − quantité + : par colis du fournisseur ; au minimum, « − » retire le produit du panier. */
function Quantite({ ligne, offre, occupee, onModifier }: { ligne: LignePanier; offre?: OffreProduit; occupee: boolean; onModifier: (m: Modification) => void }) {
  const maximum = offre?.quantiteDisponible ?? Infinity
  const dernier = ligne.quantite <= ligne.colisage
  return (
    <Interactif className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={dernier ? `Retirer ${ligne.libelle}` : 'Un colis de moins'}
        disabled={occupee}
        onClick={() => onModifier(dernier ? { ligne, retirer: true } : { ligne, quantite: ligne.quantite - ligne.colisage })}
      >
        <MinusIcon />
      </Button>
      <span className="w-9 text-center font-semibold tabular text-titre" title={`${ligne.quantiteSuggeree} utiles${ligne.colisage > 1 ? `, par ${ligne.colisage}` : ''}`}>
        {occupee ? <Spinner className="mx-auto size-3.5" /> : ligne.quantite}
      </span>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="Un colis de plus"
        disabled={occupee || ligne.quantite + ligne.colisage > maximum}
        onClick={() => onModifier({ ligne, quantite: ligne.quantite + ligne.colisage })}
      >
        <PlusIcon />
      </Button>
    </Interactif>
  )
}

/** L'offre retenue ; s'il y en a d'autres, on change de fournisseur sur place (prix, délai). */
function Fournisseur({ ligne, offres, occupee, onModifier }: { ligne: LignePanier; offres?: OffreProduit[]; occupee: boolean; onModifier: (m: Modification) => void }) {
  const retenue = offres?.find((o) => o.id === ligne.offreId)
  const alerte = ligne.livreApresRupture && (
    <AlertTriangleIcon className="size-3.5 shrink-0 text-st-rupture" aria-label="Livré après la rupture" />
  )
  if (!offres || offres.length < 2) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        {alerte}
        <span className="truncate">{retenue?.fournisseur ?? '…'}</span>
        <span className="shrink-0 text-muted-foreground">· {formaterEcheance(ligne.livraisonPrevueLe)}</span>
      </span>
    )
  }
  return (
    <Interactif className="flex min-w-0 items-center gap-1.5">
      {alerte}
      <Select value={String(ligne.offreId)} disabled={occupee} onValueChange={(id) => onModifier({ ligne, offreId: Number(id) })}>
        <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-xs" aria-label={`Fournisseur de ${ligne.libelle}`}>
          <SelectValue>
            <span className="truncate">
              {retenue?.fournisseur} · {formaterEcheance(ligne.livraisonPrevueLe)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {offres.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.fournisseur} · {formaterEuros(o.prixUnitaire)} · {o.delaiJours} j{o.colisage > 1 ? ` · par ${o.colisage}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Interactif>
  )
}

/** Le panier en bas d'écran : une commande par fournisseur avec son franco, le total, la validation. */
function BarrePanier({
  panier,
  erreur,
  validation,
  occupe,
  onValider,
}: {
  panier: Panier
  erreur?: string
  validation: boolean
  occupe: boolean
  onValider: () => void
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur @3xl/doc:-mx-8 @3xl/doc:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="hidden min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2 sm:flex">
          {panier.commandes.length === 0 && <span className="texte-discret">Panier vide : ajoutez un produit ou recalculez le panier.</span>}
          {panier.commandes.map((c) => (
            <Franco key={c.fournisseurId} commande={c} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="texte-meta">
              {pluriel(panier.nombreLignes, 'produit')} · {pluriel(panier.commandes.length, 'fournisseur')}
            </span>
            <span className="texte-valeur tabular">{formaterEuros(panier.total)} HT</span>
          </div>
          <Button onClick={onValider} disabled={panier.nombreLignes === 0 || validation || occupe}>
            {validation && <Spinner data-icon="inline-start" />}
            Valider et commander
          </Button>
        </div>
      </div>
      {erreur && <p className="texte-meta mt-2 text-destructive">{erreur}</p>}
    </div>
  )
}

function Franco({ commande: c }: { commande: CommandeFournisseur }) {
  const atteint = c.franco === 0 || c.resteAvantFranco === 0
  return (
    <div className="flex min-w-44 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium">{c.fournisseur}</span>
        <span className="tabular">{formaterEuros(c.sousTotal)}</span>
      </div>
      {c.franco > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', atteint ? 'bg-st-ok' : 'bg-st-surveiller')} style={{ width: `${Math.min(100, (c.sousTotal / c.franco) * 100)}%` }} />
        </div>
      )}
      <span className={cn('texte-meta flex items-center gap-1', atteint ? 'text-st-ok' : 'text-st-surveiller')}>
        {atteint ? (
          <>
            <CheckIcon className="size-3" />
            {c.franco > 0 ? 'Franco atteint' : 'Sans minimum'}
          </>
        ) : (
          `Plus que ${formaterEuros(c.resteAvantFranco)} pour le franco`
        )}
      </span>
    </div>
  )
}

/** Après validation : une fenêtre de confirmation, le détail par fournisseur, puis la suite logique. */
function PanierValide({ panier, onFermer, onNouveau }: { panier: Panier; onFermer: () => void; onNouveau: () => void }) {
  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="texte-section">Commande validée</DialogTitle>
          <DialogDescription>
            {pluriel(panier.commandes.length, 'commande')} · {pluriel(panier.nombreLignes, 'produit')} · {formaterEuros(panier.total)} HT
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="items-center gap-4">
          <Illustration nom="commande-validee" className="w-full max-w-72" />
          <p className="texte-valeur text-st-ok">Commandes transmises aux fournisseurs</p>
          <ul className="flex w-full flex-col divide-y rounded-lg border">
            {panier.commandes.map((c) => (
              <li key={c.fournisseurId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{c.fournisseur}</span>
                  <span className="texte-meta">
                    {pluriel(c.lignes.length, 'produit')} · livraison {formaterEcheance(c.lignes.reduce((a, l) => (l.livraisonPrevueLe > a ? l.livraisonPrevueLe : a), c.lignes[0].livraisonPrevueLe))}
                  </span>
                </span>
                <span className="tabular">{formaterEuros(c.sousTotal)}</span>
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onNouveau}>
            Nouveau panier
          </Button>
          <Button onClick={() => allerA('commandes')}>Suivre les livraisons</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
