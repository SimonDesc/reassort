import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ArrowRightIcon, PackageIcon, PiggyBankIcon, TruckIcon, WarehouseIcon } from 'lucide-react'
import { api, type StatutProduit, type TableauDeBord, type VenteJour } from '@/api'
import { EnteteEcran } from '@/components/entete'
import { formaterDate, formaterEcheance, formaterEuros, formaterJour, formaterNombre, pluriel } from '@/format'
import { allerA, useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { BadgeStatut } from '@/components/statut'
import { Tuile } from '@/components/tuile'
import { Panel } from '@/components/service-ui/panel'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

/** Ordre de lecture des statuts : du plus urgent au plus tranquille. */
const STATUTS: { statut: StatutProduit; libelle: string; couleur: string }[] = [
  { statut: 'RUPTURE_IMMINENTE', libelle: 'Rupture imminente', couleur: 'bg-st-rupture' },
  { statut: 'A_COMMANDER', libelle: 'À commander', couleur: 'bg-st-surveiller' },
  { statut: 'COMMANDE', libelle: 'Commandé', couleur: 'bg-st-commande' },
  { statut: 'OK', libelle: 'Couvert', couleur: 'bg-st-ok' },
  { statut: 'SURSTOCK', libelle: 'Surstock', couleur: 'bg-muted-foreground/45' },
]

const VENTES: ChartConfig = { quantite: { label: 'Boîtes vendues', color: 'var(--chart-1)' } }
const ACHATS: ChartConfig = { montant: { label: 'Achats HT', color: 'var(--chart-2)' } }

/** L'officine en un coup d'œil : où en est le stock, ce qui presse, ce que les achats ont coûté et économisé. */
export function TableauDeBordEcran() {
  const tableau = useQuery({ queryKey: ['tableau-de-bord'], queryFn: api.tableauDeBord })

  return (
    <div className="page-enter">
      <EnteteEcran titre="Tableau de bord" sousTitre="Stock, ventes et achats de la pharmacie, à partir des données du LGO." />
      {tableau.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          <Skeleton className="h-72 sm:col-span-2 lg:col-span-4" />
        </div>
      ) : tableau.isError ? (
        <p className="texte-donnee text-destructive">{tableau.error.message}</p>
      ) : (
        <Contenu tableau={tableau.data} />
      )}
    </div>
  )
}

function Contenu({ tableau }: { tableau: TableauDeBord }) {
  const { ouvrir } = useFicheProduit()
  const total = Object.values(tableau.produitsParStatut).reduce((a, b) => a + b, 0)
  const ventesTotales = tableau.ventesParJour.reduce((a, v) => a + v.quantite, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile
          intitule="Valeur du stock"
          icone={WarehouseIcon}
          valeur={formaterEuros(tableau.valeurStock)}
          contexte={`${pluriel(total, 'référence')} au prix d’achat le plus bas`}
        />
        <Tuile
          intitule="Surstock immobilisé"
          icone={PackageIcon}
          valeur={formaterEuros(tableau.valeurSurstock)}
          ton={tableau.valeurSurstock > 0 ? 'surveiller' : undefined}
          contexte="Au-delà de 60 jours de ventes · à déstocker"
          onClick={() => allerA('destockage')}
        />
        <Tuile
          intitule="Commandes en cours"
          icone={TruckIcon}
          valeur={formaterEuros(tableau.montantEnCours)}
          contexte={tableau.commandesEnCours ? `${pluriel(tableau.commandesEnCours, 'livraison')} attendue${tableau.commandesEnCours > 1 ? 's' : ''}` : 'Aucune livraison attendue'}
          onClick={() => allerA('commandes')}
        />
        <Tuile
          intitule="Économisé sur 90 jours"
          icone={PiggyBankIcon}
          valeur={formaterEuros(tableau.economies90Jours)}
          ton="ok"
          contexte={`sur ${formaterEuros(tableau.achats90Jours)} d’achats, face au grossiste seul`}
        />
      </div>

      <Panel className="gap-4 p-carte">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="texte-section">État du stock</h2>
          <p className="texte-meta">Cliquez sur un statut pour voir les produits</p>
        </div>
        {/* Une barre segmentée : la part de chaque statut, 2 px de fond entre les segments. */}
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Répartition des produits par statut">
          {STATUTS.map(({ statut, couleur }) =>
            tableau.produitsParStatut[statut] ? (
              <div key={statut} className={couleur} style={{ flexGrow: tableau.produitsParStatut[statut] }} />
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {STATUTS.map(({ statut, libelle, couleur }) => (
            <button
              key={statut}
              type="button"
              onClick={() => allerA('reassort', { statut })}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className={cn('size-2.5 shrink-0 rounded-[3px]', couleur)} />
              <span className="texte-donnee flex-1">{libelle}</span>
              <span className="texte-valeur tabular">{tableau.produitsParStatut[statut]}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="gap-4 p-carte lg:col-span-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="texte-section">Ventes par semaine</h2>
            <p className="texte-meta tabular">
              {formaterNombre(ventesTotales)} boîtes sur 90 jours · {formaterNombre(ventesTotales / tableau.ventesParJour.length)} par jour en moyenne
            </p>
          </div>
          <ChartContainer config={VENTES} className="aspect-auto h-60 w-full">
            <BarChart data={parSemaine(tableau.ventesParJour)} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="debut" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tickFormatter={formaterJour} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <ChartTooltip
                cursor={{ fillOpacity: 0.5 }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, charge) => {
                      const semaine = charge[0]?.payload as { debut: string; fin: string } | undefined
                      return semaine ? `Du ${formaterJour(semaine.debut)} au ${formaterDate(semaine.fin)}` : null
                    }}
                  />
                }
              />
              <Bar dataKey="quantite" fill="var(--color-quantite)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ChartContainer>
        </Panel>

        <Panel className="gap-4 p-carte lg:col-span-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="texte-section">Achats par fournisseur</h2>
            <p className="texte-meta">Commandes reçues ou en cours, 90 derniers jours</p>
          </div>
          {tableau.achatsParFournisseur.length === 0 ? (
            <p className="texte-discret">Aucune commande sur la période.</p>
          ) : (
            <ChartContainer
              config={ACHATS}
              className="aspect-auto w-full"
              style={{ height: Math.max(160, tableau.achatsParFournisseur.length * 52) }}
            >
              <BarChart data={tableau.achatsParFournisseur} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v)} €`} />
                <YAxis
                  type="category"
                  dataKey="fournisseur"
                  tickLine={false}
                  axisLine={false}
                  width={150}
                  tickFormatter={(nom: string) => (nom.length > 20 ? `${nom.slice(0, 19)}…` : nom)}
                />
                <ChartTooltip
                  cursor={{ fillOpacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      formatter={(valeur, _nom, element) => (
                        <div className="flex flex-col gap-0.5">
                          <span className="texte-valeur tabular">{formaterEuros(Number(valeur))}</span>
                          <span className="texte-meta">{pluriel(element.payload.commandes, 'commande')}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="montant" fill="var(--color-montant)" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
      </div>

      <Panel className="gap-4 p-carte">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="texte-section">À traiter en priorité</h2>
            <p className="texte-meta">Les produits qui seront vides le plus tôt</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => allerA('reassort')}>
            Préparer le réassort
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
        {tableau.urgences.length === 0 ? (
          <p className="texte-discret">Rien d’urgent : tout le stock est couvert.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {tableau.urgences.map((p) => (
              <li key={p.cip13}>
                <button
                  type="button"
                  onClick={() => ouvrir(p.cip13)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-2.5 text-left hover:bg-muted"
                >
                  <span className="texte-valeur min-w-0 flex-1 truncate">{p.libelle}</span>
                  <BadgeStatut statut={p.statut} />
                  <span className="texte-donnee w-28 tabular text-right">
                    {p.stock} en stock
                  </span>
                  <span className={cn('texte-meta w-24 text-right', p.statut === 'RUPTURE_IMMINENTE' && 'text-st-rupture')}>
                    {p.ruptureEstimeeLe ? `vide ${formaterEcheance(p.ruptureEstimeeLe)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
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
