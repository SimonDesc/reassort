import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { SearchIcon, ShoppingCartIcon } from 'lucide-react'
import { api, type Panier, type Prevision, type StatutProduit } from '@/api'
import { formaterEcheance, formaterEuros, formaterNombre, pluriel } from '@/format'
import { lireParametre, useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { EnteteEcran } from '@/components/entete'
import { BadgeStatut } from '@/components/statut'
import { Panel } from '@/components/service-ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FenetrePanier } from '@/ecrans/FenetrePanier'

const HORIZONS = [7, 14, 30] as const

type Filtre = 'A_TRAITER' | StatutProduit | 'TOUS'
const FILTRES: { filtre: Filtre; libelle: string }[] = [
  { filtre: 'A_TRAITER', libelle: 'À traiter' },
  { filtre: 'RUPTURE_IMMINENTE', libelle: 'Rupture imminente' },
  { filtre: 'A_COMMANDER', libelle: 'À commander' },
  { filtre: 'COMMANDE', libelle: 'Commandé' },
  { filtre: 'OK', libelle: 'Couvert' },
  { filtre: 'SURSTOCK', libelle: 'Surstock' },
  { filtre: 'TOUS', libelle: 'Tous' },
]
const A_TRAITER = new Set<StatutProduit>(['RUPTURE_IMMINENTE', 'A_COMMANDER', 'COMMANDE'])

const retient = (filtre: Filtre, p: Prevision) =>
  filtre === 'TOUS' || (filtre === 'A_TRAITER' ? A_TRAITER.has(p.statut) : p.statut === filtre)

const normaliser = (texte: string) => texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Ce qui va manquer, et le panier qui l'évite : l'action principale de l'application. */
export function Commander() {
  const [horizon, setHorizon] = useState<number>(7)
  const [filtre, setFiltre] = useState<Filtre>(() => (lireParametre('statut') as Filtre | null) ?? 'A_TRAITER')
  const [recherche, setRecherche] = useState('')
  const [panier, setPanier] = useState<Panier | null>(null)

  const previsions = useQuery({ queryKey: ['previsions', horizon], queryFn: () => api.previsions(horizon) })
  const dernier = useQuery({ queryKey: ['dernier-panier'], queryFn: api.dernierPanier })
  const proposer = useMutation({ mutationFn: () => api.proposerPanier(horizon), onSuccess: setPanier })

  const liste = previsions.data ?? []
  const ruptures = liste.filter((p) => p.statut === 'RUPTURE_IMMINENTE').length
  const aCommander = liste.filter((p) => p.quantiteSuggeree > 0).length
  const cherche = normaliser(recherche.trim())
  const visibles = liste.filter((p) => retient(filtre, p) && (!cherche || normaliser(p.libelle).includes(cherche) || p.cip13.includes(cherche)))
  const brouillon = dernier.data?.statut === 'BROUILLON' && dernier.data.nombreLignes > 0 ? dernier.data : null

  return (
    <div className="page-enter">
      <EnteteEcran
        titre="Réassort"
        sousTitre={
          previsions.data && (
            <>
              {ruptures > 0 && <span className="text-st-rupture">{pluriel(ruptures, 'rupture imminente', 'ruptures imminentes')} · </span>}
              {aCommander > 0 ? `${pluriel(aCommander, 'produit')} à commander pour tenir ${horizon} jours` : 'Rien à commander'}
            </>
          )
        }
        actions={
          <>
            <Tabs value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
              <TabsList aria-label="Horizon de commande">
                {HORIZONS.map((h) => (
                  <TabsTrigger key={h} value={String(h)} className="px-3">
                    {h} jours
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button onClick={() => proposer.mutate()} disabled={aCommander === 0 || proposer.isPending}>
              {proposer.isPending ? <Spinner data-icon="inline-start" /> : <ShoppingCartIcon data-icon="inline-start" />}
              Préparer le panier
            </Button>
          </>
        }
      />

      {brouillon && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent/50 px-4 py-3">
          <p className="texte-donnee">
            Un panier attend votre validation : {pluriel(brouillon.nombreLignes, 'produit')}, {formaterEuros(brouillon.total)} HT.
          </p>
          <Button variant="outline" size="sm" onClick={() => setPanier(brouillon)}>
            Reprendre le panier
          </Button>
        </div>
      )}
      {proposer.isError && <p className="texte-donnee mb-4 text-destructive">{proposer.error.message}</p>}

      <Panel className="gap-4 p-carte">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut">
            {FILTRES.map(({ filtre: f, libelle }) => {
              const nombre = liste.filter((p) => retient(f, p)).length
              const actif = f === filtre
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setFiltre(f)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    actif ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {libelle}
                  <span className={cn('tabular', actif ? 'opacity-80' : 'text-foreground')}>{nombre}</span>
                </button>
              )
            })}
          </div>
          <div className="relative lg:w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Produit ou CIP13"
              aria-label="Rechercher un produit"
              className="pl-8"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        </div>

        {previsions.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : previsions.isError ? (
          <p className="texte-donnee text-destructive">{previsions.error.message}</p>
        ) : visibles.length === 0 ? (
          <p className="texte-discret py-8 text-center">Aucun produit ne correspond.</p>
        ) : (
          <TablePrevisions previsions={visibles} />
        )}
      </Panel>

      {panier && <FenetrePanier key={panier.id} panier={panier} onFermer={() => setPanier(null)} />}
    </div>
  )
}

function TablePrevisions({ previsions }: { previsions: Prevision[] }) {
  const { ouvrir } = useFicheProduit()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="texte-intitule">Produit</TableHead>
          <TableHead className="texte-intitule hidden sm:table-cell">Statut</TableHead>
          <TableHead className="texte-intitule text-right">Stock</TableHead>
          <TableHead className="texte-intitule hidden text-right md:table-cell">Ventes / jour</TableHead>
          <TableHead className="texte-intitule">Couverture</TableHead>
          <TableHead className="texte-intitule text-right">Suggestion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {previsions.map((p) => (
          <TableRow key={p.cip13} className="cursor-pointer" onClick={() => ouvrir(p.cip13)}>
            <TableCell className="max-w-48 sm:max-w-80">
              <button type="button" className="texte-valeur block max-w-full truncate text-left hover:underline">
                {p.libelle}
              </button>
              <p className="texte-meta tabular">{p.cip13}</p>
              {/* Sur téléphone, le statut passe sous le nom : la colonne est masquée. */}
              <div className="mt-1 sm:hidden">
                <BadgeStatut statut={p.statut} />
              </div>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <BadgeStatut statut={p.statut} />
            </TableCell>
            <TableCell className="text-right">
              <p className="texte-donnee tabular">{p.stock}</p>
              {p.enCommande > 0 && <p className="texte-meta tabular">+{p.enCommande} en commande</p>}
            </TableCell>
            <TableCell className="texte-donnee hidden tabular text-right md:table-cell">{formaterNombre(p.venteMoyenneParJour)}</TableCell>
            <TableCell>
              {p.couvertureJours === null ? (
                <p className="texte-discret">Aucune vente</p>
              ) : (
                <>
                  <p className="texte-donnee tabular">{formaterNombre(p.couvertureJours)} j</p>
                  {p.ruptureEstimeeLe && p.couvertureJours < 30 && (
                    <p className={p.statut === 'RUPTURE_IMMINENTE' ? 'texte-meta text-st-rupture' : 'texte-meta'}>
                      vide {formaterEcheance(p.ruptureEstimeeLe)}
                    </p>
                  )}
                </>
              )}
            </TableCell>
            <TableCell className="text-right">
              {p.quantiteSuggeree > 0 ? (
                <p className="texte-valeur tabular">+{p.quantiteSuggeree}</p>
              ) : p.quantiteADestocker > 0 ? (
                <p className="texte-meta tabular">{p.quantiteADestocker} à déstocker</p>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
