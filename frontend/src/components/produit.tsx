import { useState } from 'react'
import { PillIcon } from 'lucide-react'
import { cn } from '@/components/lib/utils'

/** La photo détourée du produit ; une pastille neutre si elle manque. */
export function ImageProduit({ cip13, className }: { cip13: string; className?: string }) {
  const [absente, setAbsente] = useState(false)
  const cadre = cn('flex shrink-0 items-center justify-center rounded-md', className)
  if (absente) {
    return (
      <span className={cn(cadre, 'bg-muted text-muted-foreground')} aria-hidden>
        <PillIcon className="size-1/2" />
      </span>
    )
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}images/produits/${cip13}.webp`}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setAbsente(true)}
      className={cn(cadre, 'object-contain')}
    />
  )
}

/** Cellule « produit » des listes : la vignette puis le libellé sur une ligne. */
export function NomProduit({ cip13, libelle }: { cip13: string; libelle: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <ImageProduit cip13={cip13} className="size-7" />
      <span>{libelle}</span>
    </span>
  )
}
