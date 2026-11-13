import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboardIcon,
  PackageOpenIcon,
  PillIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TruckIcon,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/api'
import { cn } from '@/components/lib/utils'
import { formaterHeure } from '@/format'
import { FicheProduitProvider, useEcran, useFicheProduit, type Ecran } from '@/navigation'
import { Commander } from '@/ecrans/Commander'
import { Commandes } from '@/ecrans/Commandes'
import { Destocker } from '@/ecrans/Destocker'
import { FicheProduit } from '@/ecrans/FicheProduit'
import { ReglagesEcran } from '@/ecrans/Reglages'
import { TableauDeBordEcran } from '@/ecrans/TableauDeBord'

type Entree = { ecran: Ecran; libelle: string; icone: LucideIcon }

const MENU: Entree[] = [
  { ecran: 'tableau-de-bord', libelle: 'Tableau de bord', icone: LayoutDashboardIcon },
  { ecran: 'reassort', libelle: 'Réassort', icone: ShoppingCartIcon },
  { ecran: 'commandes', libelle: 'Commandes', icone: TruckIcon },
  { ecran: 'destockage', libelle: 'Déstockage', icone: PackageOpenIcon },
  { ecran: 'reglages', libelle: 'Réglages', icone: SettingsIcon },
]

export function App() {
  return (
    <FicheProduitProvider>
      <Coque />
    </FicheProduitProvider>
  )
}

/** Barre latérale sur ordinateur, barre d'onglets défilante sur téléphone ; un écran à la fois. */
function Coque() {
  const ecran = useEcran()
  const fiche = useFicheProduit()
  const tableau = useQuery({ queryKey: ['tableau-de-bord'], queryFn: api.tableauDeBord })
  const resume = useQuery({ queryKey: ['resume'], queryFn: api.resume })
  const pastilles: Partial<Record<Ecran, number>> = {
    reassort: tableau.data?.produitsParStatut.RUPTURE_IMMINENTE,
    commandes: tableau.data?.commandesEnCours,
    destockage: tableau.data?.produitsParStatut.SURSTOCK,
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-card md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PillIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="texte-titre">Réassort</p>
            <p className="texte-meta truncate">Pharmacie de démonstration</p>
          </div>
        </div>
        <nav aria-label="Navigation" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
          {MENU.map(({ ecran: cible, libelle, icone: Icone }) => {
            const actif = cible === ecran
            const pastille = pastilles[cible]
            return (
              <a
                key={cible}
                href={`#/${cible}`}
                onClick={() => fiche.fermer()}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground',
                  actif && 'bg-accent text-titre',
                )}
              >
                <Icone className={cn('size-4', actif && 'text-primary')} />
                <span className="flex-1">{libelle}</span>
                {pastille ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs font-semibold tabular',
                      cible === 'reassort' ? 'bg-st-rupture/12 text-st-rupture' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {pastille}
                  </span>
                ) : null}
              </a>
            )
          })}
        </nav>
        {resume.data?.stockReleveLe && (
          <p className="texte-meta mt-auto hidden px-5 py-4 md:block">
            Données du LGO synchronisées à {formaterHeure(resume.data.stockReleveLe)}
            <br />
            {resume.data.produits} produits · {resume.data.offres} offres marketplace
          </p>
        )}
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 p-4 sm:p-8">
        {ecran === 'tableau-de-bord' && <TableauDeBordEcran />}
        {ecran === 'reassort' && <Commander />}
        {ecran === 'commandes' && <Commandes />}
        {ecran === 'destockage' && <Destocker />}
        {ecran === 'reglages' && <ReglagesEcran />}
      </main>

      {fiche.cip13 && <FicheProduit cip13={fiche.cip13} onFermer={fiche.fermer} />}
    </div>
  )
}
