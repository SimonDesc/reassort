import { useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/components/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/*
 * Briques d'écran reprises de Service-9000 (PageEcran, barre de liste, tableau), réduites à ce que Réassort utilise :
 * même coque, mêmes marges, même tableau encadré à lignes fines, même segment de vues avec leur nombre.
 */

/**
 * Coque d'une page : titre, nombre d'éléments pour une liste, actions à droite. 32 px autour du contenu (16 px sur une
 * zone étroite) ; une liste en tableau prend toute la largeur.
 */
export function PageEcran({
  titre,
  nombre,
  actions,
  pleineLargeur,
  children,
}: {
  titre: ReactNode
  nombre?: number
  actions?: ReactNode
  pleineLargeur?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('mx-auto w-full flex-1 space-y-4 p-4 @3xl/doc:p-8', !pleineLargeur && 'max-w-[1080px]')}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', !pleineLargeur && 'pb-4')}>
        <h1 className="texte-titre min-w-0">{titre}</h1>
        {nombre !== undefined && <span className="texte-discret tabular">{nombre}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/** Les vues prédéfinies d'une liste, en segments, chacune avec son nombre. */
export type Vue<V extends string> = { valeur: V; libelle: string; nombre?: number }

const SEGMENTS = 'max-w-full flex-wrap rounded-lg bg-muted p-0.5'
const SEGMENT =
  'rounded-md text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm data-[state=on]:bg-card data-[state=on]:text-foreground'

export function Segments<V extends string>({
  etiquette,
  valeur,
  onChange,
  options,
}: {
  etiquette: string
  valeur: V
  onChange: (valeur: V) => void
  options: Vue<V>[]
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={1}
      value={valeur}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={etiquette}
      className={SEGMENTS}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.valeur} value={o.valeur} className={cn(SEGMENT, 'min-w-max flex-[1_0_auto] gap-1.5 px-3 text-[13px]')}>
          {o.libelle}
          {o.nombre !== undefined && <span className="tabular opacity-70">{o.nombre}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Recherche qui filtre le tableau d'à côté : loupe, saisie, bord marqué au focus. */
export function ChampRecherche({ etiquette, valeur, onChange }: { etiquette: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-9 w-64 max-w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-sm transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        aria-label={etiquette}
        placeholder={etiquette}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/** La barre au-dessus d'un tableau : recherche, vues, puis ce qui va à droite. */
export function BarreListe({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {droite && <div className="ml-auto flex flex-wrap items-center gap-2">{droite}</div>}
    </div>
  )
}

export type Colonne<T> = {
  id: string
  libelle: string
  rendu: (ligne: T) => ReactNode
  /** La valeur de tri ; sans elle, la colonne ne se trie pas. */
  tri?: (ligne: T) => number | string | null
  alignement?: 'droite'
  largeur?: number
  /** Masquée sous cette largeur d'écran. */
  masqueeSous?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const MASQUE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' }

/**
 * Le tableau des listes : encadré, en-tête à filets, lignes à hauteur fixe. `onOuvrir` rend la ligne cliquable et sa
 * première cellule atteignable au clavier ; un clic sur un intitulé trie la colonne.
 */
export function Tableau<T>({
  libelle,
  colonnes,
  lignes,
  idLigne,
  onOuvrir,
  chargement,
  erreur,
  vide,
  pied,
  largeurMin = 576,
}: {
  libelle: string
  colonnes: Colonne<T>[]
  lignes: T[]
  idLigne: (l: T) => string
  onOuvrir?: (l: T) => void
  chargement?: boolean
  erreur?: string
  vide: ReactNode
  pied?: ReactNode
  /** En deçà (pixels), le tableau défile horizontalement dans son cadre. */
  largeurMin?: number
}) {
  const [tri, setTri] = useState<{ id: string; decroissant: boolean } | null>(null)
  if (erreur) return <p className="texte-donnee text-destructive">{erreur}</p>
  if (chargement) return <Skeleton className="h-72 w-full" />
  if (lignes.length === 0) return <div className="texte-discret py-2">{vide}</div>

  const colonneTriee = tri && colonnes.find((c) => c.id === tri.id)
  const triees = colonneTriee?.tri
    ? [...lignes].sort((a, b) => {
        const [x, y] = [colonneTriee.tri!(a), colonneTriee.tri!(b)]
        if (x === y) return 0
        if (x === null) return 1
        if (y === null) return -1
        const ordre = x < y ? -1 : 1
        return tri!.decroissant ? -ordre : ordre
      })
    : lignes

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table aria-label={libelle} className="table-fixed border-separate border-spacing-0" style={{ minWidth: largeurMin }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {colonnes.map((c) => {
              const actif = tri?.id === c.id
              return (
                <TableHead
                  key={c.id}
                  scope="col"
                  style={c.largeur ? { width: c.largeur } : undefined}
                  className={cn('h-9 border-r border-b border-r-border/70 px-1.5 last:border-r-0', c.alignement === 'droite' && 'text-right', c.masqueeSous && MASQUE[c.masqueeSous])}
                  aria-sort={actif ? (tri!.decroissant ? 'descending' : 'ascending') : undefined}
                >
                  {c.tri ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="texte-intitule h-auto min-w-0 gap-1 px-1 py-0.5 hover:text-foreground"
                      onClick={() => setTri(actif && tri!.decroissant ? null : { id: c.id, decroissant: actif })}
                    >
                      <span className="truncate">{c.libelle}</span>
                      {actif && (tri!.decroissant ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                    </Button>
                  ) : (
                    <span className="texte-intitule truncate px-1">{c.libelle}</span>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {triees.map((ligne) => (
            <TableRow key={idLigne(ligne)} className={cn('h-row', onOuvrir && 'cursor-pointer')} onClick={onOuvrir && (() => onOuvrir(ligne))}>
              {colonnes.map((c, i) => (
                <TableCell
                  key={c.id}
                  className={cn('truncate border-b border-border/70 px-2.5 py-1 texte-donnee', c.alignement === 'droite' && 'text-right tabular', c.masqueeSous && MASQUE[c.masqueeSous])}
                >
                  {i === 0 && onOuvrir ? (
                    <Button
                      variant="link"
                      className="h-auto max-w-full justify-start truncate p-0 font-[inherit] text-[length:inherit] text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOuvrir(ligne)
                      }}
                    >
                      {c.rendu(ligne)}
                    </Button>
                  ) : (
                    c.rendu(ligne)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pied}
    </div>
  )
}
