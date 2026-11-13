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
  offreId: number
  cip13: string
  libelle: string
  statutProduit: StatutProduit
  couvertureJours: number | null
  quantiteSuggeree: number
  quantite: number
  colisage: number
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
  recueLe: string | null
  lignes: LignePanier[]
}

export type Panier = {
  id: string
  statut: 'BROUILLON' | 'VALIDE' | 'RECU'
  horizonJours: number
  creeLe: string
  valideLe: string | null
  recuLe: string | null
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

export type TypeFournisseur = CommandeFournisseur['typeFournisseur']

export type VenteJour = { jour: string; quantite: number }

export type OffreProduit = {
  id: number
  fournisseurId: string
  fournisseur: string
  typeFournisseur: TypeFournisseur
  prixUnitaire: number
  delaiJours: number
  colisage: number
  quantiteDisponible: number | null
  peremption: string | null
  franco: number
}

export type FicheProduit = {
  prevision: Prevision
  ventes: VenteJour[]
  offres: OffreProduit[]
  enCommande: { panierId: string; fournisseur: string; quantite: number; valideLe: string; livraisonPrevueLe: string }[]
}

export type TableauDeBord = {
  produitsParStatut: Record<StatutProduit, number>
  valeurStock: number
  valeurSurstock: number
  commandesEnCours: number
  montantEnCours: number
  achats90Jours: number
  economies90Jours: number
  ventesParJour: VenteJour[]
  achatsParFournisseur: { fournisseur: string; typeFournisseur: TypeFournisseur; montant: number; commandes: number }[]
  urgences: Prevision[]
}

export type Reglages = {
  joursHistorique: number
  stockSecuriteJours: number
  surstockJours: number
  conserverJours: number
}

/** Une valeur sur la période, et sur la période précédente quand l'historique la couvre. */
export type Comparaison = { valeur: number; avant: number | null }

export type Statistiques = {
  debut: string
  fin: string
  semaines: number
  comparable: boolean
  synthese: {
    boitesVendues: Comparaison
    consommation: Comparaison
    achats: Comparaison
    commandes: Comparaison
    delaiAnnonce: number | null
    delaiReel: number | null
    livraisonsALHeure: number | null
    livraisons: number
  }
  parSemaine: { debut: string; fin: string; boitesVendues: number; consommation: number; boitesAchetees: number; achats: number }[]
  parJour: { jour: string; consommation: number; achats: number }[]
  produits: {
    cip13: string
    libelle: string
    vendues: number
    venduesAvant: number | null
    achetees: number
    stock: number
    consommation: number
    parSemaine: number[]
  }[]
  fournisseurs: {
    fournisseur: string
    typeFournisseur: TypeFournisseur
    livraisons: number
    boites: number
    montant: number
    delaiAnnonce: number | null
    delaiReel: number | null
    aLHeure: number
    recues: number
  }[]
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
  tableauDeBord: () => appeler<TableauDeBord>('/api/tableau-de-bord'),
  statistiques: (semaines: number) => appeler<Statistiques>(`/api/statistiques?semaines=${semaines}`),
  ficheProduit: (cip13: string) => appeler<FicheProduit>(`/api/produits/${cip13}`),
  offres: (cip13: string[]) =>
    appeler<Record<string, OffreProduit[]>>(`/api/produits/offres?${cip13.map((c) => `cip13=${c}`).join('&')}`),
  historique: () => appeler<Panier[]>('/api/paniers'),
  dernierPanier: async () => {
    const reponse = await fetch('/api/paniers/dernier')
    return reponse.ok ? ((await reponse.json()) as Panier) : null
  },
  modifierLigne: (panierId: string, ligneId: number, modification: { quantite?: number; offreId?: number }) =>
    appeler<Panier>(`/api/paniers/${panierId}/lignes/${ligneId}`, { method: 'PATCH', body: JSON.stringify(modification) }),
  retirerLigne: (panierId: string, ligneId: number) =>
    appeler<Panier>(`/api/paniers/${panierId}/lignes/${ligneId}`, { method: 'DELETE' }),
  recevoir: (panierId: string, fournisseurId: string) =>
    appeler<Panier>(`/api/paniers/${panierId}/receptions/${fournisseurId}`, { method: 'POST' }),
  reglages: () => appeler<Reglages>('/api/reglages'),
  modifierReglages: (reglages: Reglages) =>
    appeler<Reglages>('/api/reglages', { method: 'PUT', body: JSON.stringify(reglages) }),
  proposerPanier: (horizon: number) => appeler<Panier>(`/api/paniers?horizon=${horizon}`, { method: 'POST' }),
  validerPanier: (id: string) => appeler<Panier>(`/api/paniers/${id}/validation`, { method: 'POST' }),
  suggestionsDestockage: () => appeler<SuggestionDestockage[]>('/api/destockage/suggestions'),
  publierAnnonce: (annonce: { cip13: string; quantite: number; prixUnitaire: number; peremption: string }) =>
    appeler<Annonce>('/api/destockage/annonces', { method: 'POST', body: JSON.stringify(annonce) }),
  retirerAnnonce: (id: number) => appeler<void>(`/api/destockage/annonces/${id}`, { method: 'DELETE' }),
}
