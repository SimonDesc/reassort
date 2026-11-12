import type { StatutProduit } from '@/api'
import { Badge } from '@/components/ui/badge'

const BADGES: Record<StatutProduit, { variant: 'rupture' | 'surveiller' | 'commande' | 'ok' | 'outline'; libelle: string }> = {
  RUPTURE_IMMINENTE: { variant: 'rupture', libelle: 'Rupture imminente' },
  A_COMMANDER: { variant: 'surveiller', libelle: 'À commander' },
  COMMANDE: { variant: 'commande', libelle: 'Commandé' },
  SURSTOCK: { variant: 'outline', libelle: 'Surstock' },
  OK: { variant: 'ok', libelle: 'Couvert' },
}

/** Le statut d'un produit, partout le même badge : fond teinté clair, texte de la teinte. */
export function BadgeStatut({ statut }: { statut: StatutProduit }) {
  const { variant, libelle } = BADGES[statut]
  return <Badge variant={variant}>{libelle}</Badge>
}
