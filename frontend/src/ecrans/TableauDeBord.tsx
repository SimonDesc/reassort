import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { api, type Prevision, type TableauDeBord } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, pluriel } from '@/format'
import { allerA, useFicheProduit } from '@/navigation'
import { cn } from '@/components/lib/utils'
import { Chiffre, Chiffres } from '@/components/chiffres'
import { PageEcran, Tableau, type Colonne } from '@/components/liste'
import { BadgeStatut } from '@/components/statut'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { TYPES_FOURNISSEUR } from '@/ecrans/FicheProduit'
import { NomProduit } from '@/components/produit'

const JOURS = 14
const RUPTURES: ChartConfig = { produits: { label: 'Produits vides', color: 'var(--chart-1)' } }
const jourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** L'officine au matin : ce qui va manquer et quand, ce qui arrive, ce qui dort, ce que les achats ont rapporté. */
export function TableauDeBordEcran() {
  const tableau = useQuery({ queryKey: ['tableau-de-bord'], queryFn: api.tableauDeBord })
  const previsions = useQuery({ queryKey: ['previsions', JOURS], queryFn: () => api.previsions(JOURS) })

  return (
    <PageEcran titre="Tableau de bord" pleineLargeur>
      {tableau.isError ? (
        <p className="texte-donnee text-destructive">{tableau.error.message}</p>
      ) : !tableau.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Contenu tableau={tableau.data} previsions={previsions.data} />
      )}
    </PageEcran>
  )
}

function Contenu({ tableau, previsions }: { tableau: TableauDeBord; previsions?: Prevision[] }) {
  const { ouvrir } = useFicheProduit()
  const s = tableau.produitsParStatut

  return (
    <div className="flex flex-col gap-6">
      {/* Les chiffres du jour, sur une ligne : chacun mène à la liste qu'il compte. */}
      <Chiffres colonnes={5}>
        <Chiffre intitule="Ruptures imminentes" valeur={s.RUPTURE_IMMINENTE} ton={s.RUPTURE_IMMINENTE > 0 ? 'rupture' : undefined} onClick={() => allerA('reassort', { statut: 'RUPTURE_IMMINENTE' })} />
        <Chiffre intitule="À commander" valeur={s.A_COMMANDER} onClick={() => allerA('reassort', { statut: 'A_COMMANDER' })} />
        <Chiffre
          intitule="Livraisons attendues"
          valeur={tableau.commandesEnCours}
          detail={tableau.commandesEnCours ? formaterEuros(tableau.montantEnCours) : undefined}
          onClick={() => allerA('commandes')}
        />
        <Chiffre intitule="Surstock immobilisé" valeur={formaterEuros(tableau.valeurSurstock)} detail={pluriel(s.SURSTOCK, 'produit')} onClick={() => allerA('destockage')} />
        <Chiffre intitule="Économie sur 90 jours" valeur={formaterEuros(tableau.economies90Jours)} detail="face au grossiste seul" />
      </Chiffres>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="texte-section">Ruptures prévues sur {JOURS} jours</h2>
          <span className="texte-meta">sans nouvelle commande, livraisons attendues comprises</span>
        </div>
        <div className="rounded-lg border bg-card p-4">
          {previsions ? <CalendrierRuptures previsions={previsions} /> : <Skeleton className="h-56 w-full" />}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="texte-section">À traiter en priorité</h2>
            <Button variant="outline" size="sm" onClick={() => allerA('reassort', { panier: 'nouveau' })}>
              Préparer une commande
            </Button>
          </div>
          <Tableau
            libelle="Produits à traiter en priorité"
            colonnes={URGENCES}
            lignes={tableau.urgences}
            idLigne={(p) => p.cip13}
            onOuvrir={(p) => ouvrir(p.cip13)}
            vide="Tout le stock est couvert."
            largeurMin={0}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="texte-section">Achats des 90 derniers jours</h2>
          <AchatsParFournisseur tableau={tableau} />
        </section>
      </div>
    </div>
  )
}

const URGENCES: Colonne<Prevision>[] = [
  { id: 'produit', libelle: 'Produit', rendu: (p) => <NomProduit cip13={p.cip13} libelle={p.libelle} /> },
  { id: 'statut', libelle: 'Statut', rendu: (p) => <BadgeStatut statut={p.statut} />, largeur: 150, masqueeSous: 'sm' },
  { id: 'stock', libelle: 'Stock', rendu: (p) => p.stock, alignement: 'droite', largeur: 70 },
  {
    id: 'rupture',
    libelle: 'Vide',
    rendu: (p) => (p.ruptureEstimeeLe ? <span className={cn(p.statut === 'RUPTURE_IMMINENTE' && 'font-medium text-st-rupture')}>{formaterEcheance(p.ruptureEstimeeLe)}</span> : ''),
    largeur: 120,
  },
]

/** Dans combien de jours le produit sera vide, ce qui est déjà commandé compris ; null s'il ne se vend pas. */
function videLe(p: Prevision) {
  if (p.venteMoyenneParJour <= 0) return null
  return Math.floor((p.stock + p.enCommande) / p.venteMoyenneParJour)
}

/**
 * Combien de produits seront vides chaque jour des deux prochaines semaines : on voit d'un coup d'œil si la commande
 * peut attendre demain. Le survol nomme les produits.
 */
function CalendrierRuptures({ previsions }: { previsions: Prevision[] }) {
  const { ouvrir } = useFicheProduit()
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const jours = Array.from({ length: JOURS }, (_, i) => {
    const d = new Date(aujourdhui)
    d.setDate(d.getDate() + i)
    const cle = iso(d)
    const produits = previsions.filter((p) => {
      const vide = videLe(p)
      return vide !== null && (i === 0 ? vide <= i : vide === i)
    })
    return { cle, libelle: i === 0 ? 'auj.' : jourCourt.format(d), produits: produits.length, liste: produits }
  })
  const total = jours.reduce((a, j) => a + j.produits, 0)
  if (total === 0) return <p className="texte-discret">Aucune rupture prévue sur la période.</p>

  return (
    <ChartContainer config={RUPTURES} className="aspect-auto h-56 w-full">
      <BarChart data={jours} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="libelle" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={6} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={24} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={({ active, payload }) => {
            const jour = payload?.[0]?.payload as (typeof jours)[number] | undefined
            if (!active || !jour) return null
            return (
              <div className="grid max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <span className="font-medium">
                  {formaterDate(jour.cle)} · {pluriel(jour.produits, 'produit vide', 'produits vides')}
                </span>
                {jour.liste.slice(0, 8).map((p) => (
                  <span key={p.cip13} className="truncate text-muted-foreground">
                    {p.libelle}
                  </span>
                ))}
                {jour.liste.length > 8 && <span className="text-muted-foreground">et {jour.liste.length - 8} autres</span>}
              </div>
            )
          }}
        />
        <Bar
          dataKey="produits"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          label={{ position: 'top', fontSize: 11, fill: 'var(--muted-foreground)', formatter: (v: unknown) => (v ? String(v) : '') }}
          onClick={(d) => {
            const jour = (d as { payload?: (typeof jours)[number] }).payload
            if (jour?.liste.length === 1) ouvrir(jour.liste[0].cip13)
          }}
        >
          {jours.map((j, i) => (
            // Aujourd'hui et demain : trop tard pour la plupart des fournisseurs, la barre prend la couleur de la rupture.
            <Cell key={j.cle} fill={i < 2 ? 'var(--st-rupture)' : 'var(--color-produits)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Montant acheté par fournisseur et sa part du total : un tableau, la barre ne fait que montrer la part. */
function AchatsParFournisseur({ tableau }: { tableau: TableauDeBord }) {
  const total = tableau.achatsParFournisseur.reduce((a, f) => a + f.montant, 0)
  type Achat = TableauDeBord['achatsParFournisseur'][number]
  const colonnes: Colonne<Achat>[] = [
    {
      id: 'fournisseur',
      libelle: 'Fournisseur',
      rendu: (f) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{f.fournisseur}</span>
          <span className="texte-meta truncate">{TYPES_FOURNISSEUR[f.typeFournisseur]}</span>
        </span>
      ),
    },
    { id: 'commandes', libelle: 'Commandes', rendu: (f) => f.commandes, alignement: 'droite', largeur: 100, masqueeSous: 'lg' },
    { id: 'montant', libelle: 'Montant HT', rendu: (f) => formaterEuros(f.montant), alignement: 'droite', largeur: 120 },
    {
      id: 'part',
      libelle: 'Part',
      rendu: (f) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-chart-2" style={{ width: `${(f.montant / total) * 100}%` }} />
          </span>
          <span className="w-9 text-right tabular">{Math.round((f.montant / total) * 100)} %</span>
        </span>
      ),
      largeur: 150,
    },
  ]
  return (
    <Tableau
      libelle="Achats par fournisseur"
      colonnes={colonnes}
      lignes={tableau.achatsParFournisseur}
      idLigne={(f) => f.fournisseur}
      vide="Aucune commande sur la période."
      largeurMin={0}
      pied={
        total > 0 && (
          <div className="flex justify-between border-t bg-muted/40 px-2.5 py-2 texte-valeur tabular">
            <span>Total</span>
            <span>{formaterEuros(total)}</span>
          </div>
        )
      }
    />
  )
}
