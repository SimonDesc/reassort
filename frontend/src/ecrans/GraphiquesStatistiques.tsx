import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'
import { ClockIcon, PackageIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import type { Statistiques, TypeFournisseur } from '@/api'
import { formaterDate, formaterEuros, formaterJour, formaterNombre } from '@/format'
import { useFicheProduit } from '@/navigation'
import { useIsMobile } from '@/components/hooks/use-mobile'
import { cn } from '@/components/lib/utils'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

/*
 * Les graphiques de la page Statistiques, dans l'esprit des cartes de graphiques shadcn/ui : une carte, son titre,
 * le graphique, une ligne de conclusion en pied. Chacun répond à une question du pharmacien.
 */

const euros = (v: number) => formaterEuros(v)
const kiloEuros = (v: number) => (v >= 1000 ? `${formaterNombre(Math.round(v / 100) / 10)} k€` : `${Math.round(v)} €`)

function Carte({
  titre,
  description,
  pied,
  className,
  enTete,
  children,
}: {
  titre: string
  description?: ReactNode
  pied?: ReactNode
  className?: string
  enTete?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.3_0.08_273/0.04)]', className)}>
      <div className="flex flex-wrap items-stretch justify-between gap-y-2 border-b">
        <div className="flex min-w-0 flex-col gap-0.5 px-5 py-4">
          <h2 className="texte-section">{titre}</h2>
          {description && <p className="texte-meta">{description}</p>}
        </div>
        {enTete}
      </div>
      <div className="flex flex-1 flex-col px-5 py-4">{children}</div>
      {pied && <div className="texte-meta flex items-center gap-2 border-t bg-muted/30 px-5 py-3">{pied}</div>}
    </section>
  )
}

export function GraphiquesStatistiques({ stats }: { stats: Statistiques }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <Cumuls stats={stats} />
        <Ponctualite stats={stats} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <PlusGrosProduits stats={stats} />
        <RepartitionFournisseurs stats={stats} />
      </div>
    </div>
  )
}

/* ─── 1. Le réassort suit-il la consommation ? Les deux cumulés jour après jour : l'écart entre les courbes est ce que
 *        le stock a gagné ou perdu sur la période. ─── */

const CUMULS: ChartConfig = {
  consommation: { label: 'Consommation', color: 'var(--chart-1)' },
  achats: { label: 'Réassort', color: 'var(--chart-2)' },
}

function Cumuls({ stats }: { stats: Statistiques }) {
  let consommation = 0
  let achats = 0
  const donnees = stats.parJour.map((j) => {
    consommation += j.consommation
    achats += j.achats
    return { jour: j.jour, consommation: Math.round(consommation), achats: Math.round(achats) }
  })
  const ecart = achats - consommation
  const Tendance = ecart >= 0 ? TrendingUpIcon : TrendingDownIcon

  return (
    <Carte
      titre="Consommation et réassort cumulés"
      description={`Du ${formaterJour(stats.debut)} au ${formaterDate(stats.fin)}, au prix d’achat`}
      className="xl:col-span-2"
      enTete={
        <div className="flex border-t sm:border-t-0">
          {(['consommation', 'achats'] as const).map((cle) => (
            <div key={cle} className="flex flex-1 flex-col justify-center gap-1 border-l px-5 py-3 first:border-l-0 sm:first:border-l sm:px-6">
              <span className="texte-meta inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: `var(--chart-${cle === 'consommation' ? 1 : 2})` }} />
                {CUMULS[cle].label}
              </span>
              <span className="font-display text-xl leading-none font-semibold tabular text-titre">
                {formaterEuros(cle === 'consommation' ? consommation : achats)}
              </span>
            </div>
          ))}
        </div>
      }
      pied={
        <>
          <Tendance className="size-4 text-foreground" />
          <span>
            <span className="font-medium text-foreground">
              {ecart >= 0 ? '+' : '−'}
              {formaterEuros(Math.abs(ecart))}
            </span>{' '}
            de stock sur la période : {ecart >= 0 ? 'le réassort dépasse la consommation' : 'la consommation dépasse le réassort'}
          </span>
        </>
      }
    >
      <ChartContainer config={CUMULS} className="aspect-auto h-64 w-full">
        <AreaChart data={donnees} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {(['consommation', 'achats'] as const).map((cle) => (
              <linearGradient key={cle} id={`degrade-${cle}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${cle})`} stopOpacity={0.35} />
                <stop offset="95%" stopColor={`var(--color-${cle})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={formaterJour} />
          <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={kiloEuros} />
          <ChartTooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, c) => {
                  const jour = c[0]?.payload?.jour as string | undefined
                  return jour ? `Cumul au ${formaterDate(jour)}` : null
                }}
                formatter={(valeur, nom, element) => (
                  <div className="flex w-full items-center gap-2">
                    <span className="h-3 w-1 rounded-[2px]" style={{ background: element.color }} />
                    <span className="flex-1 text-muted-foreground">{CUMULS[String(nom)]?.label}</span>
                    <span className="font-medium tabular text-foreground">{euros(Number(valeur))}</span>
                  </div>
                )}
              />
            }
          />
          {/* Le réassort avance par paliers, un par commande ; la consommation monte en continu. */}
          <Area dataKey="achats" type="stepAfter" stroke="var(--color-achats)" strokeWidth={2} fill="url(#degrade-achats)" activeDot={{ r: 4 }} />
          <Area dataKey="consommation" type="monotone" stroke="var(--color-consommation)" strokeWidth={2} fill="url(#degrade-consommation)" activeDot={{ r: 4 }} />
        </AreaChart>
      </ChartContainer>
    </Carte>
  )
}

/* ─── 2. Les fournisseurs tiennent-ils leurs délais ? ─── */

const PONCTUALITE: ChartConfig = { heure: { label: 'À l’heure', color: 'var(--chart-1)' } }

function Ponctualite({ stats }: { stats: Statistiques }) {
  const s = stats.synthese
  const taux = s.livraisonsALHeure ?? 0
  const recues = stats.fournisseurs.reduce((a, f) => a + f.recues, 0)
  const aLHeure = stats.fournisseurs.reduce((a, f) => a + f.aLHeure, 0)

  return (
    <Carte
      titre="Livraisons à l’heure"
      description={`${aLHeure} sur ${recues} livraisons reçues`}
      pied={
        s.delaiReel !== null && s.delaiAnnonce !== null ? (
          <>
            <ClockIcon className="size-4 text-foreground" />
            <span>
              <span className="font-medium text-foreground">{formaterNombre(s.delaiReel)} j</span> en moyenne pour{' '}
              {formaterNombre(s.delaiAnnonce)} j annoncés
            </span>
          </>
        ) : undefined
      }
    >
      {recues === 0 ? (
        <p className="texte-discret">Aucune livraison reçue sur la période.</p>
      ) : (
        <ChartContainer config={PONCTUALITE} className="mx-auto aspect-square h-60">
          <RadialBarChart
            data={[{ cle: 'heure', valeur: taux, fill: 'var(--color-heure)' }]}
            startAngle={90}
            endAngle={90 - (360 * taux) / 100}
            innerRadius={78}
            outerRadius={108}
          >
            <PolarGrid gridType="circle" radialLines={false} stroke="none" className="first:fill-muted last:fill-card" polarRadius={[84, 72]} />
            <RadialBar dataKey="valeur" background={{ fill: 'var(--muted)' }} cornerRadius={10} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) =>
                  viewBox && 'cx' in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-[var(--titre)] font-display text-4xl font-bold">
                        {taux} %
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 26} className="fill-muted-foreground text-xs">
                        à l’heure
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      )}
    </Carte>
  )
}

/* ─── 3. Où part la consommation ? Les dix produits qui pèsent le plus, et leur part du total. ─── */

const PRODUITS: ChartConfig = { consommation: { label: 'Consommation', color: 'var(--chart-1)' } }

function PlusGrosProduits({ stats }: { stats: Statistiques }) {
  const { ouvrir } = useFicheProduit()
  // Sur téléphone, la colonne des noms laisse la place aux barres.
  const coupe = useIsMobile() ? 15 : 28
  const total = stats.produits.reduce((a, p) => a + p.consommation, 0)
  const dix = stats.produits.slice(0, 10)
  const partDix = total > 0 ? dix.reduce((a, p) => a + p.consommation, 0) / total : 0

  return (
    <Carte
      titre="Les 10 produits qui pèsent le plus"
      description="Consommation au prix d’achat, un clic ouvre la fiche"
      className="xl:col-span-2"
      pied={
        <>
          <PackageIcon className="size-4 text-foreground" />
          <span>
            Ces 10 produits sur {stats.produits.length} font <span className="font-medium text-foreground">{Math.round(partDix * 100)} %</span> de la
            consommation
          </span>
        </>
      }
    >
      <ChartContainer config={PRODUITS} className="aspect-auto w-full" style={{ height: dix.length * 32 + 8 }}>
        <BarChart data={dix} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="libelle"
            tickLine={false}
            axisLine={false}
            width={coupe * 7 + 8}
            interval={0}
            // Une seule ligne par produit : le nom est coupé plutôt que renvoyé à la ligne.
            tick={({ x, y, payload }) => {
              const nom = String(payload.value)
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
                  {nom.length > coupe ? `${nom.slice(0, coupe - 1).trimEnd()}…` : nom}
                </text>
              )
            }}
            fontSize={12}
          />
          <ChartTooltip
            cursor={{ fillOpacity: 0.5 }}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, c) => c[0]?.payload?.libelle}
                formatter={(valeur, _n, element) => (
                  <div className="grid gap-0.5">
                    <span className="font-medium tabular text-foreground">{euros(Number(valeur))}</span>
                    <span className="text-muted-foreground">
                      {formaterNombre(element.payload.vendues)} boîtes vendues · {Math.round((Number(valeur) / total) * 100)} % du total
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="consommation"
            fill="var(--color-consommation)"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            className="cursor-pointer"
            onClick={(d) => {
              const cip13 = (d as { payload?: { cip13?: string } }).payload?.cip13
              if (cip13) ouvrir(cip13)
            }}
          >
            <LabelList dataKey="consommation" position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: unknown) => euros(Number(v))} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </Carte>
  )
}

/* ─── 4. Chez qui part l'argent du réassort ? Une couleur par fournisseur, toujours la même. ─── */

const COULEUR_TYPE: Record<TypeFournisseur, string> = {
  GROSSISTE: 'var(--chart-2)',
  LABORATOIRE: 'var(--chart-1)',
  DEPOSITAIRE: 'var(--chart-3)',
  CONFRERE: 'var(--muted-foreground)',
}

function RepartitionFournisseurs({ stats }: { stats: Statistiques }) {
  const total = stats.fournisseurs.reduce((a, f) => a + f.montant, 0)
  const donnees = stats.fournisseurs.map((f, i) => ({ cle: `f${i}`, fournisseur: f.fournisseur, montant: f.montant, fill: COULEUR_TYPE[f.typeFournisseur] }))
  const config: ChartConfig = Object.fromEntries(donnees.map((d) => [d.cle, { label: d.fournisseur, color: d.fill }]))

  return (
    <Carte titre="Réassort par fournisseur" description={`${stats.synthese.commandes.valeur} commandes sur la période`}>
      {total === 0 ? (
        <p className="texte-discret">Aucune commande sur la période.</p>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4">
          <ChartContainer config={config} className="aspect-square h-56">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="cle" formatter={(v, _n, e) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: e.payload.fill }} />
                  <span className="flex-1 text-muted-foreground">{e.payload.fournisseur}</span>
                  <span className="font-medium tabular text-foreground">{euros(Number(v))}</span>
                </div>
              )} />} />
              <Pie data={donnees} dataKey="montant" nameKey="cle" innerRadius={62} outerRadius={96} paddingAngle={2} cornerRadius={4} stroke="var(--card)" strokeWidth={2}>
                {donnees.map((d) => (
                  <Cell key={d.cle} fill={d.fill} />
                ))}
                <Label
                  content={({ viewBox }) =>
                    viewBox && 'cx' in viewBox ? (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-[var(--titre)] font-display text-xl font-bold">
                          {kiloEuros(total)}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-xs">
                          commandés
                        </tspan>
                      </text>
                    ) : null
                  }
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          {/* La légende nomme chaque part et donne sa valeur : la couleur n'est jamais seule. */}
          <ul className="flex w-full flex-col gap-2">
            {donnees.map((d) => (
              <li key={d.cle} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.fill }} />
                <span className="texte-donnee min-w-0 flex-1 truncate">{d.fournisseur}</span>
                <span className="texte-meta tabular">{Math.round((d.montant / total) * 100)} %</span>
                <span className="texte-valeur w-24 text-right tabular">{formaterEuros(d.montant)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Carte>
  )
}
