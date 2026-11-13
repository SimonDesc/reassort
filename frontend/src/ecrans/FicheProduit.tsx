import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { RecycleIcon, TrophyIcon } from 'lucide-react'
import { api, type FicheProduit as Fiche, type OffreProduit, type TypeFournisseur } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, formaterJour, formaterNombre } from '@/format'
import { BadgeStatut } from '@/components/statut'
import { Tuile } from '@/components/tuile'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const TYPES_FOURNISSEUR: Record<TypeFournisseur, string> = {
  GROSSISTE: 'Grossiste-répartiteur',
  DEPOSITAIRE: 'Dépositaire',
  LABORATOIRE: 'Laboratoire en direct',
  CONFRERE: 'Déstockage d’un confrère',
}

const VENTES: ChartConfig = { quantite: { label: 'Boîtes vendues', color: 'var(--chart-1)' } }
const PROJECTION: ChartConfig = { stock: { label: 'Stock prévu', color: 'var(--chart-2)' } }
const JOURS_PROJETES = 30

/** Tout ce qu'il faut pour décider d'un produit, ouvert depuis n'importe quel écran. */
export function FicheProduit({ cip13, onFermer }: { cip13: string; onFermer: () => void }) {
  const fiche = useQuery({ queryKey: ['fiche', cip13], queryFn: () => api.ficheProduit(cip13) })
  const p = fiche.data?.prevision

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent taille="grande">
        <DialogHeader>
          <DialogTitle className="texte-section pr-8">{p?.libelle ?? 'Fiche produit'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="tabular">CIP {cip13}</span>
            {p && <BadgeStatut statut={p.statut} />}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-6">
          {fiche.isPending ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-56" />
            </div>
          ) : fiche.isError ? (
            <p className="texte-donnee text-destructive">{fiche.error.message}</p>
          ) : (
            <Contenu fiche={fiche.data} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Contenu({ fiche }: { fiche: Fiche }) {
  const p = fiche.prevision
  const projection = projeter(fiche)
  const moinsChere = fiche.offres.reduce<OffreProduit | null>((min, o) => (!min || o.prixUnitaire < min.prixUnitaire ? o : min), null)
  const ventes30 = fiche.ventes.slice(-30).reduce((a, v) => a + v.quantite, 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile
          intitule="En stock"
          valeur={p.stock}
          contexte={p.enCommande > 0 ? `+ ${p.enCommande} en commande` : 'Rien en commande'}
        />
        <Tuile intitule="Ventes par jour" valeur={formaterNombre(p.venteMoyenneParJour)} contexte={`${ventes30} boîtes sur 30 jours`} />
        <Tuile
          intitule="Couverture"
          valeur={p.couvertureJours === null ? '—' : `${formaterNombre(p.couvertureJours)} j`}
          ton={p.statut === 'RUPTURE_IMMINENTE' ? 'rupture' : p.statut === 'A_COMMANDER' ? 'surveiller' : undefined}
          contexte={p.ruptureEstimeeLe ? `vide ${formaterEcheance(p.ruptureEstimeeLe)}` : 'Aucune vente récente'}
        />
        <Tuile
          intitule={p.quantiteADestocker > 0 ? 'À déstocker' : 'À commander'}
          valeur={p.quantiteADestocker > 0 ? p.quantiteADestocker : p.quantiteSuggeree || '—'}
          contexte={p.delaiLePlusCourt !== null ? `Livraison la plus rapide : ${p.delaiLePlusCourt} j` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="texte-section">Ventes sur 90 jours</h3>
            <p className="texte-meta">Une barre par jour, jours sans vente compris</p>
          </div>
          <ChartContainer config={VENTES} className="aspect-auto h-48 w-full">
            <BarChart data={fiche.ventes} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} tickFormatter={formaterJour} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ChartTooltip
                cursor={{ fillOpacity: 0.5 }}
                content={<ChartTooltipContent hideIndicator labelFormatter={(_, c) => etiquetteJour(c[0]?.payload?.jour)} />}
              />
              <Bar dataKey="quantite" fill="var(--color-quantite)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="texte-section">Stock prévu sur {JOURS_PROJETES} jours</h3>
            <p className="texte-meta">Au rythme des ventes, livraisons attendues comprises</p>
          </div>
          <ChartContainer config={PROJECTION} className="aspect-auto h-48 w-full">
            <LineChart data={projection} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} tickFormatter={formaterJour} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ReferenceLine y={0} stroke="var(--st-rupture)" strokeDasharray="4 4" />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, c) => etiquetteJour(c[0]?.payload?.jour)} />} />
              <Line dataKey="stock" type="stepAfter" stroke="var(--color-stock)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="texte-section">Offres comparées</h3>
        {fiche.offres.length === 0 ? (
          <p className="texte-discret">Aucune offre pour ce produit.</p>
        ) : (
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="texte-intitule">Fournisseur</TableHead>
                <TableHead className="texte-intitule text-right">Prix unitaire</TableHead>
                <TableHead className="texte-intitule text-right">Délai</TableHead>
                <TableHead className="texte-intitule text-right">Colisage</TableHead>
                <TableHead className="texte-intitule">Disponible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiche.offres.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <p className="texte-valeur flex items-center gap-1.5">
                      {o.typeFournisseur === 'CONFRERE' && <RecycleIcon className="size-3.5 text-marque" />}
                      {o.fournisseur}
                    </p>
                    <p className="texte-meta">{TYPES_FOURNISSEUR[o.typeFournisseur]}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="texte-valeur tabular">{formaterEuros(o.prixUnitaire)}</p>
                    {o.id === moinsChere?.id && fiche.offres.length > 1 && (
                      <p className="texte-meta inline-flex items-center gap-1 text-st-ok">
                        <TrophyIcon className="size-3" />
                        le moins cher
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="texte-donnee tabular text-right">{o.delaiJours} j</TableCell>
                  <TableCell className="texte-donnee tabular text-right">par {o.colisage}</TableCell>
                  <TableCell>
                    <p className="texte-donnee tabular">{o.quantiteDisponible === null ? 'Sans limite' : `${o.quantiteDisponible} boîtes`}</p>
                    {o.peremption && <p className="texte-meta">Péremption {formaterDate(o.peremption)}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {fiche.enCommande.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="texte-section">En commande</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {fiche.enCommande.map((c) => (
              <li key={`${c.panierId}-${c.fournisseur}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <span className="texte-valeur flex-1">{c.fournisseur}</span>
                <span className="texte-donnee tabular">{c.quantite} boîtes</span>
                <span className="texte-meta">
                  commandé le {formaterDate(c.valideLe)} · livraison {formaterEcheance(c.livraisonPrevueLe)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

const etiquetteJour = (jour: unknown) => (typeof jour === 'string' ? formaterDate(jour) : null)

/** Le stock jour par jour : on retire la vente moyenne, on ajoute chaque livraison attendue le jour prévu. */
function projeter(fiche: Fiche) {
  const { stock, venteMoyenneParJour } = fiche.prevision
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let restant = stock
  return Array.from({ length: JOURS_PROJETES + 1 }, (_, i) => {
    const jour = new Date(aujourdhui)
    jour.setDate(jour.getDate() + i)
    const cle = iso(jour)
    if (i > 0) restant = Math.max(0, restant - venteMoyenneParJour)
    restant += fiche.enCommande.filter((c) => c.livraisonPrevueLe === cle).reduce((a, c) => a + c.quantite, 0)
    return { jour: cle, stock: Math.round(restant) }
  })
}
