/** Client de l'API Réassort : types des réponses et appels, un seul endroit pour les adresses. */

export type StatutProduit = 'RUPTURE_IMMINENTE' | 'A_COMMANDER' | 'COMMANDE' | 'SURSTOCK' | 'OK'

export type Prevision = {
  cip13: string
  libelle: string
  stock: number
  enCommande: number
  venteMoyenneParJour: number
  couvertureJours: number | null
  ruptureEstimeeLe: string | null
  delaiLePlusCourt: number | null
  statut: StatutProduit
  quantiteSuggeree: number
  quantiteADestocker: number
}

export type LignePanier = {
  id: number
  cip13: string
  libelle: string
  statutProduit: StatutProduit
  couvertureJours: number | null
  quantiteSuggeree: number
  quantite: number
  prixUnitaire: number
  montant: number
  delaiJours: number
  livraisonPrevueLe: string
  livreApresRupture: boolean
  peremption: string | null
}

export type CommandeFournisseur = {
  fournisseurId: string
  fournisseur: string
  typeFournisseur: 'GROSSISTE' | 'DEPOSITAIRE' | 'LABORATOIRE' | 'CONFRERE'
  sousTotal: number
  franco: number
  resteAvantFranco: number
  lignes: LignePanier[]
}

export type Panier = {
  id: string
  statut: 'BROUILLON' | 'VALIDE'
  horizonJours: number
  creeLe: string
  valideLe: string | null
  total: number
  nombreLignes: number
  commandes: CommandeFournisseur[]
}

export type Annonce = {
  id: number
  cip13: string
  libelle: string
  quantite: number
  prixUnitaire: number
  montant: number
  peremption: string
  publieeLe: string
}

export type SuggestionDestockage = {
  cip13: string
  libelle: string
  stock: number
  venteMoyenneParJour: number
  couvertureJours: number | null
  quantiteADestocker: number
  prixConseille: number | null
  annonce: Annonce | null
}

export type Resume = {
  produits: number
  fournisseurs: number
  offres: number
  premiereVente: string | null
  derniereVente: string | null
  stockReleveLe: string | null
}

/** Une erreur de l'API : le message est le `detail` du Problem Details renvoyé par le serveur. */
export class ErreurApi extends Error {}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(url, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new ErreurApi('Le serveur ne répond pas.')
  }
  if (!reponse.ok) {
    const probleme = (await reponse.json().catch(() => null)) as { detail?: string } | null
    throw new ErreurApi(probleme?.detail ?? `Erreur ${reponse.status}`)
  }
  return reponse.status === 204 ? (undefined as T) : ((await reponse.json()) as T)
}

export const api = {
  resume: () => appeler<Resume>('/api/demo/resume'),
  reinitialiser: () => appeler<Resume>('/api/demo/reinitialiser', { method: 'POST' }),
  previsions: (horizon: number) => appeler<Prevision[]>(`/api/previsions?horizon=${horizon}`),
  proposerPanier: (horizon: number) => appeler<Panier>(`/api/paniers?horizon=${horizon}`, { method: 'POST' }),
  validerPanier: (id: string) => appeler<Panier>(`/api/paniers/${id}/validation`, { method: 'POST' }),
  suggestionsDestockage: () => appeler<SuggestionDestockage[]>('/api/destockage/suggestions'),
  publierAnnonce: (annonce: { cip13: string; quantite: number; prixUnitaire: number; peremption: string }) =>
    appeler<Annonce>('/api/destockage/annonces', { method: 'POST', body: JSON.stringify(annonce) }),
  retirerAnnonce: (id: number) => appeler<void>(`/api/destockage/annonces/${id}`, { method: 'DELETE' }),
}
