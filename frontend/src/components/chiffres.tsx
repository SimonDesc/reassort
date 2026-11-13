import type { ReactNode } from 'react'
import { cn } from '@/components/lib/utils'

/** Une rangée de chiffres clés dans un même cadre, séparés par des filets : un relevé, pas des cartes. */
export function Chiffres({ colonnes, children }: { colonnes: 4 | 5; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-lg border bg-card [&>*]:border-border/70 [&>*:not(:last-child)]:border-b md:[&>*:not(:last-child)]:border-r md:[&>*:not(:last-child)]:border-b-0',
        colonnes === 5 ? 'md:grid-cols-5' : 'md:grid-cols-4',
      )}
    >
      {children}
    </div>
  )
}

export function Chiffre({
  intitule,
  valeur,
  detail,
  ton,
  onClick,
}: {
  intitule: string
  valeur: ReactNode
  detail?: ReactNode
  ton?: 'rupture' | 'surveiller'
  onClick?: () => void
}) {
  const Balise = onClick ? 'button' : 'div'
  return (
    <Balise
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex min-w-0 flex-col gap-0.5 px-4 py-3 text-left', onClick && 'transition-colors hover:bg-muted/60')}
    >
      <span className="texte-intitule truncate">{intitule}</span>
      <span
        className={cn(
          'font-display text-xl leading-7 font-semibold tabular text-titre',
          ton === 'rupture' && 'text-st-rupture',
          ton === 'surveiller' && 'text-st-surveiller',
        )}
      >
        {valeur}
      </span>
      <span className="texte-meta truncate">{detail ?? ' '}</span>
    </Balise>
  )
}
