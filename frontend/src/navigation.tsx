import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'

/** Les écrans de l'application ; l'écran ouvert vit dans l'adresse (#/commandes), le retour arrière fonctionne. */
export const ECRANS = ['tableau-de-bord', 'reassort', 'commandes', 'statistiques', 'destockage', 'reglages'] as const
export type Ecran = (typeof ECRANS)[number]

const lireEcran = (): Ecran => {
  const demande = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Ecran
  return ECRANS.includes(demande) ? demande : 'tableau-de-bord'
}

/** Un paramètre de l'adresse (#/reassort?statut=SURSTOCK) : le tableau de bord ouvre une liste déjà filtrée. */
export function lireParametre(nom: string): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(nom)
}

const sAbonner = (rappel: () => void) => {
  window.addEventListener('hashchange', rappel)
  return () => window.removeEventListener('hashchange', rappel)
}

export function useEcran(): Ecran {
  return useSyncExternalStore(sAbonner, lireEcran)
}

export function allerA(ecran: Ecran, parametres?: Record<string, string>) {
  window.location.hash = `/${ecran}${parametres ? `?${new URLSearchParams(parametres)}` : ''}`
}

/** La fiche produit s'ouvre en fenêtre par-dessus n'importe quel écran (liste, panier, tableau de bord). */
const ContexteFiche = createContext<{ cip13: string | null; ouvrir: (cip13: string) => void; fermer: () => void } | null>(null)

export function FicheProduitProvider({ children }: { children: ReactNode }) {
  const [cip13, setCip13] = useState<string | null>(null)
  return (
    <ContexteFiche.Provider value={{ cip13, ouvrir: setCip13, fermer: () => setCip13(null) }}>{children}</ContexteFiche.Provider>
  )
}

export function useFicheProduit() {
  const contexte = useContext(ContexteFiche)
  if (!contexte) throw new Error('FicheProduitProvider manquant')
  return contexte
}
