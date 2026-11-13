import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheckIcon, RecycleIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type CommandeFournisseur, type Panier } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros } from '@/format'
import { useFicheProduit } from '@/navigation'
import { BarreListe, ChampRecherche, PageEcran, Segments, Tableau, type Colonne } from '@/components/liste'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TYPES_FOURNISSEUR } from '@/ecrans/FicheProduit'
import { EtatVide } from '@/components/illustration'
import { NomProduit } from '@/components/produit'

/** Une commande fournisseur : ce qu'on attend d'un même fournisseur, et qu'on réceptionne d'un coup. */
type Ligne = { panier: Panier; commande: CommandeFournisseur; prevue: string; cle: string }
type Vue = 'attente' | 'recues' | 'toutes'

const prevueLe = (c: CommandeFournisseur) => c.lignes.reduce((max, l) => (l.livraisonPrevueLe > max ? l.livraisonPrevueLe : max), '')

export function Commandes() {
  const { ouvrir: ouvrirFiche } = useFicheProduit()
  const client = useQueryClient()
  const [vue, setVue] = useState<Vue>('attente')
  const [recherche, setRecherche] = useState('')
  const [ouverte, setOuverte] = useState<string | null>(null)
  const historique = useQuery({ queryKey: ['historique'], queryFn: api.historique })

  const recevoir = useMutation({
    mutationFn: (l: Ligne) => api.recevoir(l.panier.id, l.commande.fournisseurId),
    onSuccess: (_, l) => {
      for (const cle of ['historique', 'previsions', 'tableau-de-bord', 'fiche', 'destockage']) client.invalidateQueries({ queryKey: [cle] })
      toast.success(`${l.commande.fournisseur} : ${l.commande.lignes.reduce((a, x) => a + x.quantite, 0)} boîtes entrées en stock`)
    },
  })

  const toutes: Ligne[] = (historique.data ?? []).flatMap((panier) =>
    panier.commandes.map((commande) => ({ panier, commande, prevue: prevueLe(commande), cle: `${panier.id}/${commande.fournisseurId}` })),
  )
  const enAttente = toutes.filter((l) => !l.commande.recueLe)
  const recues = toutes.filter((l) => l.commande.recueLe)
  const cherche = recherche.trim().toLowerCase()
  const visibles = (vue === 'attente' ? enAttente : vue === 'recues' ? recues : toutes).filter(
    (l) => !cherche || l.commande.fournisseur.toLowerCase().includes(cherche) || l.commande.lignes.some((x) => x.libelle.toLowerCase().includes(cherche)),
  )
  const detail = toutes.find((l) => l.cle === ouverte)

  const colonnes: Colonne<Ligne>[] = [
    {
      id: 'fournisseur',
      libelle: 'Fournisseur',
      rendu: (l) => (
        <span className="inline-flex items-center gap-1.5">
          {l.commande.typeFournisseur === 'CONFRERE' && <RecycleIcon className="size-3.5 text-marque" />}
          {l.commande.fournisseur}
        </span>
      ),
      tri: (l) => l.commande.fournisseur,
    },
    { id: 'type', libelle: 'Type', rendu: (l) => TYPES_FOURNISSEUR[l.commande.typeFournisseur], largeur: 190, masqueeSous: 'xl' },
    { id: 'passee', libelle: 'Passée le', rendu: (l) => (l.panier.valideLe ? formaterDate(l.panier.valideLe) : ''), tri: (l) => l.panier.valideLe, largeur: 120, masqueeSous: 'md' },
    {
      id: 'livraison',
      libelle: 'Livraison',
      rendu: (l) => (l.commande.recueLe ? `reçue le ${formaterDate(l.commande.recueLe)}` : `prévue ${formaterEcheance(l.prevue)}`),
      tri: (l) => l.commande.recueLe ?? l.prevue,
      largeur: 180,
    },
    { id: 'produits', libelle: 'Produits', rendu: (l) => l.commande.lignes.length, tri: (l) => l.commande.lignes.length, alignement: 'droite', largeur: 90, masqueeSous: 'sm' },
    { id: 'montant', libelle: 'Montant HT', rendu: (l) => formaterEuros(l.commande.sousTotal), tri: (l) => l.commande.sousTotal, alignement: 'droite', largeur: 120 },
    {
      id: 'etat',
      libelle: 'État',
      rendu: (l) =>
        l.commande.recueLe ? (
          <Badge variant="ok">Reçue</Badge>
        ) : (
          <Button
            size="xs"
            variant="outline"
            disabled={recevoir.isPending}
            onClick={(e) => {
              e.stopPropagation()
              recevoir.mutate(l)
            }}
          >
            {recevoir.isPending && recevoir.variables?.cle === l.cle ? <Spinner data-icon="inline-start" /> : <PackageCheckIcon data-icon="inline-start" />}
            Réceptionner
          </Button>
        ),
      largeur: 140,
    },
  ]

  return (
    <PageEcran titre="Commandes" nombre={historique.data ? visibles.length : undefined} pleineLargeur>
      <BarreListe>
        <ChampRecherche etiquette="Fournisseur ou produit" valeur={recherche} onChange={setRecherche} />
        <Segments
          etiquette="Commandes affichées"
          valeur={vue}
          onChange={setVue}
          options={[
            { valeur: 'attente', libelle: 'En attente', nombre: enAttente.length },
            { valeur: 'recues', libelle: 'Reçues', nombre: recues.length },
            { valeur: 'toutes', libelle: 'Toutes', nombre: toutes.length },
          ]}
        />
      </BarreListe>
      {recevoir.isError && <p className="texte-donnee text-destructive">{recevoir.error.message}</p>}
      <Tableau
        libelle="Commandes fournisseurs"
        colonnes={colonnes}
        lignes={visibles}
        idLigne={(l) => l.cle}
        onOuvrir={(l) => setOuverte(l.cle)}
        chargement={historique.isPending}
        erreur={historique.error?.message}
        vide={<EtatVide nom="commande-validee">{vue === 'attente' ? 'Aucune livraison attendue.' : 'Aucune commande.'}</EtatVide>}
      />

      {detail && (
        <Dialog open onOpenChange={(o) => !o && setOuverte(null)}>
          <DialogContent taille="moyenne">
            <DialogHeader>
              <DialogTitle className="texte-section">{detail.commande.fournisseur}</DialogTitle>
              <DialogDescription>
                {TYPES_FOURNISSEUR[detail.commande.typeFournisseur]}
                {detail.panier.valideLe && ` · passée le ${formaterDate(detail.panier.valideLe)}`}
                {detail.commande.recueLe ? ` · reçue le ${formaterDate(detail.commande.recueLe)}` : ` · livraison prévue ${formaterEcheance(detail.prevue)}`}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="texte-intitule pl-4">Produit</TableHead>
                    <TableHead className="texte-intitule text-right">Quantité</TableHead>
                    <TableHead className="texte-intitule text-right">Prix unitaire</TableHead>
                    <TableHead className="texte-intitule pr-4 text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.commande.lignes.map((x) => (
                    <TableRow key={x.id} className="h-row cursor-pointer" onClick={() => ouvrirFiche(x.cip13)}>
                      <TableCell className="texte-donnee max-w-0 pl-4">
                        <NomProduit cip13={x.cip13} libelle={x.libelle} />
                      </TableCell>
                      <TableCell className="texte-donnee tabular text-right">{x.quantite}</TableCell>
                      <TableCell className="texte-donnee tabular text-right">{formaterEuros(x.prixUnitaire)}</TableCell>
                      <TableCell className="texte-valeur tabular pr-4 text-right">{formaterEuros(x.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogBody>
            <DialogFooter className="items-center sm:justify-between">
              <span className="texte-valeur tabular">Total {formaterEuros(detail.commande.sousTotal)} HT</span>
              {!detail.commande.recueLe && (
                <Button onClick={() => recevoir.mutate(detail)} disabled={recevoir.isPending}>
                  <PackageCheckIcon data-icon="inline-start" />
                  Réceptionner
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageEcran>
  )
}
