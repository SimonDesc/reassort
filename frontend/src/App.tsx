import { useState, type ElementType } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChartColumnIcon,
  GaugeIcon,
  MoonIcon,
  PackageOpenIcon,
  PillIcon,
  PlusIcon,
  SettingsIcon,
  ShoppingCartIcon,
  SunIcon,
  TruckIcon,
} from 'lucide-react'
import { api } from '@/api'
import { Assistant } from '@/components/assistant'
import { formaterHeure } from '@/format'
import { allerA, FicheProduitProvider, useEcran, useFicheProduit, type Ecran } from '@/navigation'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Commander } from '@/ecrans/Commander'
import { Commandes } from '@/ecrans/Commandes'
import { Destocker } from '@/ecrans/Destocker'
import { FicheProduit } from '@/ecrans/FicheProduit'
import { ReglagesEcran } from '@/ecrans/Reglages'
import { StatistiquesEcran } from '@/ecrans/Statistiques'
import { TableauDeBordEcran } from '@/ecrans/TableauDeBord'

type Entree = { ecran: Ecran; titre: string; icone: ElementType; groupe: string }

const ENTREES: Entree[] = [
  { ecran: 'tableau-de-bord', titre: 'Tableau de bord', icone: GaugeIcon, groupe: 'Officine' },
  { ecran: 'reassort', titre: 'Réassort', icone: ShoppingCartIcon, groupe: 'Officine' },
  { ecran: 'commandes', titre: 'Commandes', icone: TruckIcon, groupe: 'Officine' },
  { ecran: 'statistiques', titre: 'Statistiques', icone: ChartColumnIcon, groupe: 'Officine' },
  { ecran: 'destockage', titre: 'Déstockage', icone: PackageOpenIcon, groupe: 'Marketplace' },
  { ecran: 'reglages', titre: 'Réglages', icone: SettingsIcon, groupe: 'Paramètres' },
]

// Repris de Service-9000 : l'entrée active est une carte blanche, son texte et son icône dans la couleur d'action.
const ACTIVE =
  'data-active:bg-card data-active:font-semibold data-active:text-primary data-active:shadow-[0_1px_3px_oklch(0.3_0.06_262/0.12)]'

export function App() {
  return (
    <FicheProduitProvider>
      <SidebarProvider>
        <BarreLaterale />
        {/* La zone de contenu est une carte posée à côté de la barre latérale (structure Service-9000). */}
        <SidebarInset className="min-w-0 bg-card [--background:var(--card)] md:peer-data-[variant=inset]:rounded-[14px] md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-none">
          <EnTete />
          <Contenu />
        </SidebarInset>
      </SidebarProvider>
    </FicheProduitProvider>
  )
}

function Contenu() {
  const ecran = useEcran()
  const fiche = useFicheProduit()
  return (
    <>
      <div key={ecran} className="@container/doc page-enter flex min-h-0 flex-1 flex-col">
        {ecran === 'tableau-de-bord' && <TableauDeBordEcran />}
        {ecran === 'reassort' && <Commander />}
        {ecran === 'commandes' && <Commandes />}
        {ecran === 'statistiques' && <StatistiquesEcran />}
        {ecran === 'destockage' && <Destocker />}
        {ecran === 'reglages' && <ReglagesEcran />}
      </div>
      {fiche.cip13 && <FicheProduit cip13={fiche.cip13} onFermer={fiche.fermer} />}
    </>
  )
}

function BarreLaterale() {
  const ecran = useEcran()
  const { setOpenMobile } = useSidebar()
  const tableau = useQuery({ queryKey: ['tableau-de-bord'], queryFn: api.tableauDeBord })
  const resume = useQuery({ queryKey: ['resume'], queryFn: api.resume })
  const compteurs: Partial<Record<Ecran, number>> = {
    reassort: tableau.data && tableau.data.produitsParStatut.RUPTURE_IMMINENTE + tableau.data.produitsParStatut.A_COMMANDER,
    commandes: tableau.data?.commandesEnCours,
    destockage: tableau.data?.produitsParStatut.SURSTOCK,
  }
  const groupes = [...new Set(ENTREES.filter((e) => e.groupe !== 'Paramètres').map((e) => e.groupe))]

  const entree = (e: Entree) => (
    <SidebarMenuItem key={e.ecran}>
      <SidebarMenuButton asChild isActive={e.ecran === ecran} tooltip={e.titre} className={ACTIVE}>
        <a href={`#/${e.ecran}`} onClick={() => setOpenMobile(false)}>
          <e.icone />
          <span>{e.titre}</span>
        </a>
      </SidebarMenuButton>
      {compteurs[e.ecran] ? <SidebarMenuBadge className="tabular">{compteurs[e.ecran]}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-2 overflow-hidden rounded-md p-2 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <PillIcon className="size-4" />
              </div>
              <div className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                <span className="font-display text-[15px] font-bold text-titre">Réassort</span>
                <span className="texte-meta truncate">Pharmacie de démonstration</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Préparer une commande"
              className="h-9 bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary/80 active:text-sidebar-primary-foreground"
              onClick={() => {
                setOpenMobile(false)
                allerA('reassort', { panier: 'nouveau' })
              }}
            >
              <PlusIcon strokeWidth={2.5} />
              <span>Préparer une commande</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groupes.map((groupe) => (
          <SidebarGroup key={groupe}>
            <SidebarGroupLabel className="texte-intitule text-muted-foreground">{groupe}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{ENTREES.filter((e) => e.groupe === groupe).map(entree)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <Assistant />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {ENTREES.filter((e) => e.groupe === 'Paramètres').map(entree)}
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md p-2 group-data-[collapsible=icon]:hidden">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                LGO
              </div>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium text-sidebar-accent-foreground">Données synchronisées</span>
                <span className="texte-meta truncate">
                  {resume.data?.stockReleveLe ? `à ${formaterHeure(resume.data.stockReleveLe)} · ${resume.data.produits} produits` : '…'}
                </span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function EnTete() {
  const ecran = useEcran()
  const entree = ENTREES.find((e) => e.ecran === ecran)!
  const [sombre, setSombre] = useState(() => document.documentElement.classList.contains('dark'))
  const basculer = () => {
    document.documentElement.classList.toggle('dark', !sombre)
    setSombre(!sombre)
  }
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 md:rounded-t-[14px]">
      <SidebarTrigger className="text-muted-foreground" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">{entree.groupe}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">{entree.titre}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={basculer}>
              {sombre ? <SunIcon /> : <MoonIcon />}
              <span className="sr-only">Changer de thème</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sombre ? 'Thème clair' : 'Thème sombre'}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
