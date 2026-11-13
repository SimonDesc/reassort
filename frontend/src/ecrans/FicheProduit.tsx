import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { RecycleIcon, TrophyIcon } from 'lucide-react'
import { api, type FicheProduit as Fiche, type OffreProduit, type TypeFournisseur, type VenteJour } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, formaterJour, formaterNombre } from '@/format'
import { BadgeStatut } from '@/components/statut'
import { Chiffre, Chiffres } from '@/components/chiffres'
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
const PROJECTION: ChartConfig = {
  sans: { label: 'Sans commande', color: 'var(--chart-2)' },
  avec: { label: 'Avec la commande', color: 'var(--chart-1)' },
}
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
  const reglages = useQuery({ queryKey: ['reglages'], queryFn: api.reglages })
  const securite = p.venteMoyenneParJour * (reglages.data?.stockSecuriteJours ?? 0)
  const commande = p.quantiteSuggeree > 0 && p.delaiLePlusCourt !== null ? { quantite: p.quantiteSuggeree, delai: p.delaiLePlusCourt } : null
  const projection = projeter(fiche, commande)
  const semaines = parSemaine(fiche.ventes)
  const moyenneSemaine = semaines.reduce((a, x) => a + x.quantite, 0) / Math.max(1, semaines.length)
  const moinsChere = fiche.offres.reduce<OffreProduit | null>((min, o) => (!min || o.prixUnitaire < min.prixUnitaire ? o : min), null)

  return (
    <>
      <Chiffres colonnes={4}>
        <Chiffre intitule="En stock" valeur={p.stock} detail={p.enCommande > 0 ? `+ ${p.enCommande} en commande` : undefined} />
        <Chiffre intitule="Ventes par jour" valeur={formaterNombre(p.venteMoyenneParJour)} detail={`soit ${Math.round(moyenneSemaine)} par semaine`} />
        <Chiffre
          intitule="Couverture"
          valeur={p.couvertureJours === null ? '—' : `${formaterNombre(p.couvertureJours)} j`}
          ton={p.statut === 'RUPTURE_IMMINENTE' ? 'rupture' : p.statut === 'A_COMMANDER' ? 'surveiller' : undefined}
          detail={p.ruptureEstimeeLe ? `vide ${formaterEcheance(p.ruptureEstimeeLe)}` : undefined}
        />
        <Chiffre
          intitule={p.quantiteADestocker > 0 ? 'À déstocker' : 'À commander'}
          valeur={p.quantiteADestocker > 0 ? p.quantiteADestocker : p.quantiteSuggeree || '—'}
          detail={p.delaiLePlusCourt !== null ? `livrable sous ${p.delaiLePlusCourt} j` : undefined}
        />
      </Chiffres>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="flex min-w-0 flex-col gap-3 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="texte-section">Stock prévu sur {JOURS_PROJETES} jours</h3>
            {/* Deux courbes : la légende les nomme, la couleur n'est jamais seule. */}
            <div className="texte-meta flex flex-wrap gap-x-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-chart-2" />
                Sans commande
              </span>
              {commande && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-chart-1" />
                  Avec {commande.quantite} boîtes livrées à J+{commande.delai}
                </span>
              )}
            </div>
          </div>
          <ChartContainer config={PROJECTION} className="aspect-auto h-56 w-full">
            <LineChart data={projection} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} tickFormatter={formaterJour} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              {securite > 0 && (
                <ReferenceArea
                  y1={0}
                  y2={securite}
                  fill="var(--st-rupture)"
                  fillOpacity={0.07}
                  ifOverflow="extendDomain"
                  label={{ value: 'stock de sécurité', position: 'insideBottomRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
                />
              )}
              {commande && (
                <ReferenceLine
                  x={projection[commande.delai]?.jour}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="3 3"
                  label={{ value: 'livraison', position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }}
                />
              )}
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, c) => etiquetteJour(c[0]?.payload?.jour)} />} />
              <Line dataKey="sans" type="linear" stroke="var(--color-sans)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
              {commande && <Line dataKey="avec" type="linear" stroke="var(--color-avec)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
            </LineChart>
          </ChartContainer>
        </section>

        <section className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <h3 className="texte-section">Ventes par semaine</h3>
          <ChartContainer config={VENTES} className="aspect-auto h-56 w-full">
            <BarChart data={semaines} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="debut" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} tickFormatter={formaterJour} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ReferenceLine
                y={moyenneSemaine}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                label={{ value: 'moyenne', position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.5 }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, c) => {
                      const x = c[0]?.payload as { debut: string; fin: string } | undefined
                      return x ? `Semaine du ${formaterJour(x.debut)} au ${formaterJour(x.fin)}` : null
                    }}
                  />
                }
              />
              <Bar dataKey="quantite" fill="var(--color-quantite)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
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

/**
 * Le stock jour par jour, deux fois : sans rien commander, et avec la commande suggérée livrée par l'offre la plus
 * rapide. Chaque jour retire la vente moyenne et ajoute les livraisons attendues.
 */
function projeter(fiche: Fiche, commande: { quantite: number; delai: number } | null) {
  const { stock, venteMoyenneParJour } = fiche.prevision
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let sans = stock
  let avec = stock
  return Array.from({ length: JOURS_PROJETES + 1 }, (_, i) => {
    const jour = new Date(aujourdhui)
    jour.setDate(jour.getDate() + i)
    const cle = iso(jour)
    if (i > 0) {
      sans = Math.max(0, sans - venteMoyenneParJour)
      avec = Math.max(0, avec - venteMoyenneParJour)
    }
    const livre = fiche.enCommande.filter((c) => c.livraisonPrevueLe === cle).reduce((a, c) => a + c.quantite, 0)
    sans += livre
    avec += livre + (commande && i === commande.delai ? commande.quantite : 0)
    return { jour: cle, sans: Math.round(sans), avec: Math.round(avec) }
  })
}

/** Les 90 jours regroupés par 7, en partant du plus récent : la dernière barre est la semaine écoulée. */
function parSemaine(ventes: VenteJour[]) {
  const semaines: { debut: string; fin: string; quantite: number }[] = []
  for (let fin = ventes.length; fin >= 7; fin -= 7) {
    const tranche = ventes.slice(fin - 7, fin)
    semaines.unshift({ debut: tranche[0].jour, fin: tranche[6].jour, quantite: tranche.reduce((a, v) => a + v.quantite, 0) })
  }
  return semaines
}
