import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/components/lib/utils'

/** Un chiffre clé : intitulé, valeur en gros, une ligne de contexte. Pas de graphique, le chiffre suffit. */
export function Tuile({
  intitule,
  valeur,
  contexte,
  icone: Icone,
  ton,
  onClick,
}: {
  intitule: string
  valeur: ReactNode
  contexte?: ReactNode
  icone?: LucideIcon
  ton?: 'rupture' | 'ok' | 'surveiller'
  onClick?: () => void
}) {
  const Balise = onClick ? 'button' : 'div'
  return (
    <Balise
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 text-left',
        onClick && 'transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      <span className="texte-intitule flex items-center gap-1.5">
        {Icone && <Icone className="size-3.5" />}
        {intitule}
      </span>
      <span
        className={cn(
          'font-display text-2xl leading-8 font-semibold tabular text-titre',
          ton === 'rupture' && 'text-st-rupture',
          ton === 'ok' && 'text-st-ok',
          ton === 'surveiller' && 'text-st-surveiller',
        )}
      >
        {valeur}
      </span>
      {contexte && <span className="texte-meta">{contexte}</span>}
    </Balise>
  )
}
