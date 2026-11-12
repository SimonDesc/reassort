import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, RecycleIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type CommandeFournisseur, type Panier } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, pluriel } from '@/format'
import { AnimatedCheck } from '@/components/service-ui/animated-check'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const TYPES: Record<CommandeFournisseur['typeFournisseur'], string> = {
  GROSSISTE: 'Grossiste-répartiteur',
  DEPOSITAIRE: 'Dépositaire',
  LABORATOIRE: 'Laboratoire en direct',
  CONFRERE: 'Déstockage d’un confrère',
}

/** Le panier proposé, une commande par fournisseur ; la validation est la seule décision de la fenêtre. */
export function FenetrePanier({ panier: propose, onFermer }: { panier: Panier; onFermer: () => void }) {
  const client = useQueryClient()
  const valider = useMutation({
    mutationFn: () => api.validerPanier(propose.id),
    onSuccess: (panier) => {
      client.invalidateQueries({ queryKey: ['previsions'] })
      toast.success(`Panier validé : ${pluriel(panier.commandes.length, 'commande')} transmise${panier.commandes.length > 1 ? 's' : ''}`)
    },
  })
  const panier = valider.data ?? propose
  const valide = panier.statut === 'VALIDE'

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent taille="grande">
        <DialogHeader>
          <DialogTitle className="texte-section">{valide ? 'Commande validée' : 'Panier proposé'}</DialogTitle>
          <DialogDescription>
            {pluriel(panier.nombreLignes, 'produit')} · {pluriel(panier.commandes.length, 'fournisseur')} · pour tenir{' '}
            {panier.horizonJours} jours
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-6">
          {valide && (
            <div className="flex items-center gap-3 text-st-ok">
              <AnimatedCheck className="size-8" />
              <p className="texte-valeur text-st-ok">
                Commandes transmises aux fournisseurs. Les produits passent en « Commandé » jusqu’à leur livraison.
              </p>
            </div>
          )}
          {panier.nombreLignes === 0 ? (
            <p className="texte-discret">Rien à commander : tout est couvert ou déjà commandé.</p>
          ) : (
            panier.commandes.map((commande) => <Commande key={commande.fournisseurId} commande={commande} />)
          )}
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <p className="texte-valeur tabular">Total {formaterEuros(panier.total)} HT</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {valider.isError && <p className="texte-donnee self-center text-destructive">{valider.error.message}</p>}
            <Button variant="outline" onClick={onFermer}>
              Fermer
            </Button>
            {!valide && panier.nombreLignes > 0 && (
              <Button onClick={() => valider.mutate()} disabled={valider.isPending}>
                Valider le panier
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Commande({ commande }: { commande: CommandeFournisseur }) {
  const destockage = commande.typeFournisseur === 'CONFRERE'
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-carte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="texte-section flex items-center gap-2">
            {destockage && <RecycleIcon className="size-4 text-marque" />}
            {commande.fournisseur}
          </h3>
          <p className="texte-meta">{TYPES[commande.typeFournisseur]}</p>
        </div>
        <div className="flex min-w-48 flex-col items-end gap-1.5">
          <p className="texte-valeur tabular">{formaterEuros(commande.sousTotal)}</p>
          {commande.franco > 0 &&
            (commande.resteAvantFranco > 0 ? (
              <>
                <Progress value={(commande.sousTotal / commande.franco) * 100} className="w-48" />
                <p className="texte-meta text-st-surveiller">
                  Plus que {formaterEuros(commande.resteAvantFranco)} pour le franco de port
                </p>
              </>
            ) : (
              <p className="texte-meta text-st-ok">Franco de port atteint ({formaterEuros(commande.franco)})</p>
            ))}
        </div>
      </div>

      {/* Mêmes largeurs de colonnes d'une commande à l'autre : les montants s'alignent dans toute la fenêtre. */}
      <Table className="min-w-[40rem] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="texte-intitule">Produit</TableHead>
            <TableHead className="texte-intitule w-40 text-right">Quantité</TableHead>
            <TableHead className="texte-intitule w-24 text-right">Prix unitaire</TableHead>
            <TableHead className="texte-intitule w-24 text-right">Montant</TableHead>
            <TableHead className="texte-intitule w-32 pl-6">Livraison</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {commande.lignes.map((ligne) => (
            <TableRow key={ligne.id}>
              <TableCell>
                <p className="texte-valeur truncate">{ligne.libelle}</p>
                {ligne.peremption && <p className="texte-meta">Péremption {formaterDate(ligne.peremption)}</p>}
              </TableCell>
              <TableCell className="text-right">
                <p className="texte-donnee tabular">{ligne.quantite}</p>
                {ligne.quantite > ligne.quantiteSuggeree && (
                  <p className="texte-meta tabular">{ligne.quantiteSuggeree} utiles, arrondi au colis</p>
                )}
              </TableCell>
              <TableCell className="texte-donnee tabular text-right">{formaterEuros(ligne.prixUnitaire)}</TableCell>
              <TableCell className="texte-valeur tabular text-right">{formaterEuros(ligne.montant)}</TableCell>
              <TableCell className="pl-6">
                <p className="texte-donnee">{formaterEcheance(ligne.livraisonPrevueLe)}</p>
                {ligne.livreApresRupture && (
                  <p className="texte-meta flex items-center gap-1 text-st-rupture">
                    <AlertTriangleIcon className="size-3" />
                    après la rupture
                  </p>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
