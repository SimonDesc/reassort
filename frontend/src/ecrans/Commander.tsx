import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDownIcon, ShoppingCartIcon } from 'lucide-react'
import { api, type Panier, type Prevision } from '@/api'
import { formaterEcheance, formaterNombre, pluriel } from '@/format'
import { BadgeStatut } from '@/components/statut'
import { Panel } from '@/components/service-ui/panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FenetrePanier } from '@/ecrans/FenetrePanier'

const HORIZONS = [7, 14] as const
const A_TRAITER = new Set(['RUPTURE_IMMINENTE', 'A_COMMANDER', 'COMMANDE'])

/** Ce qui va manquer, et le panier qui l'évite : l'action principale de l'application. */
export function Commander() {
  const [horizon, setHorizon] = useState<number>(7)
  const [voirCouverts, setVoirCouverts] = useState(false)
  const [panier, setPanier] = useState<Panier | null>(null)

  const previsions = useQuery({ queryKey: ['previsions', horizon], queryFn: () => api.previsions(horizon) })
  const proposer = useMutation({ mutationFn: () => api.proposerPanier(horizon), onSuccess: setPanier })

  const liste = previsions.data ?? []
  const aTraiter = liste.filter((p) => A_TRAITER.has(p.statut))
  const couverts = liste.filter((p) => !A_TRAITER.has(p.statut))
  const ruptures = liste.filter((p) => p.statut === 'RUPTURE_IMMINENTE').length
  const aCommander = liste.filter((p) => p.quantiteSuggeree > 0).length

  return (
    <Panel className="page-enter gap-6 p-carte">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="texte-section">Ce qui va manquer</h2>
          {previsions.data && (
            <p className="texte-discret">
              {ruptures > 0 && <span className="text-st-rupture">{pluriel(ruptures, 'rupture imminente', 'ruptures imminentes')} · </span>}
              {aCommander > 0 ? `${pluriel(aCommander, 'produit')} à commander pour tenir ${horizon} jours` : 'Rien à commander'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </div>
      {proposer.isError && <p className="texte-donnee text-destructive">{proposer.error.message}</p>}

      {previsions.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : previsions.isError ? (
        <p className="texte-donnee text-destructive">{previsions.error.message}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <TablePrevisions previsions={voirCouverts ? [...aTraiter, ...couverts] : aTraiter} />
          {couverts.length > 0 && (
            <Button variant="discret" size="sm" className="self-start" onClick={() => setVoirCouverts(!voirCouverts)}>
              <ChevronDownIcon data-icon="inline-start" className={voirCouverts ? 'rotate-180' : undefined} />
              {voirCouverts ? 'Masquer les produits couverts' : `Afficher les ${pluriel(couverts.length, 'produit couvert', 'produits couverts')}`}
            </Button>
          )}
        </div>
      )}

      {panier && <FenetrePanier panier={panier} onFermer={() => setPanier(null)} />}
    </Panel>
  )
}

function TablePrevisions({ previsions }: { previsions: Prevision[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="texte-intitule">Produit</TableHead>
          <TableHead className="texte-intitule hidden sm:table-cell">Statut</TableHead>
          <TableHead className="texte-intitule text-right">Stock</TableHead>
          <TableHead className="texte-intitule hidden text-right md:table-cell">Ventes / jour</TableHead>
          <TableHead className="texte-intitule">Couverture</TableHead>
          <TableHead className="texte-intitule text-right">À commander</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {previsions.map((p) => (
          <TableRow key={p.cip13}>
            <TableCell className="max-w-48 sm:max-w-80">
              <p className="texte-valeur truncate">{p.libelle}</p>
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
            <TableCell className="texte-valeur tabular text-right">{p.quantiteSuggeree > 0 ? p.quantiteSuggeree : ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
