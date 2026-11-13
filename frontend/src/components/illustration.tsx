import type { ReactNode } from 'react'
import { cn } from '@/components/lib/utils'
import importCsv from '@/illustrations/import-csv.svg?raw'
import anticiperRuptures from '@/illustrations/anticiper-ruptures.svg?raw'
import comparerOffres from '@/illustrations/comparer-offres.svg?raw'
import panierRecommande from '@/illustrations/panier-recommande.svg?raw'
import assistantReassort from '@/illustrations/assistant-reassort.svg?raw'
import commandeValidee from '@/illustrations/commande-validee.svg?raw'
import logo from '@/illustrations/logo-reassort.svg?raw'

const DESSINS = {
  'import-csv': importCsv,
  'anticiper-ruptures': anticiperRuptures,
  'comparer-offres': comparerOffres,
  'panier-recommande': panierRecommande,
  'assistant-reassort': assistantReassort,
  'commande-validee': commandeValidee,
}

export type NomIllustration = keyof typeof DESSINS

/** Illustration maison, décorative. Le SVG est posé tel quel pour que le CSS anime ses groupes (plante, personnage, badges…). */
export function Illustration({ nom, className }: { nom: NomIllustration; className?: string }) {
  return <div className={cn('illustration', className)} dangerouslySetInnerHTML={{ __html: DESSINS[nom] }} />
}

/** Un état vide : l'illustration et une phrase courte, centrées. */
export function EtatVide({ nom, children }: { nom: NomIllustration; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-center">
      <Illustration nom={nom} className="w-full max-w-64" />
      <div className="texte-discret">{children}</div>
    </div>
  )
}

/**
 * Le logo animé (la gélule tombe dans la boîte). Posé en SVG dans la page : remonté à chaque changement d'écran
 * (`key`), son animation CSS repart du début.
 */
export function Logo({ className }: { className?: string }) {
  return <span className={cn('block [&_svg]:size-full', className)} dangerouslySetInnerHTML={{ __html: logo }} />
}
