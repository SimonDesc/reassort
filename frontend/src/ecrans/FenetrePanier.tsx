import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, MinusIcon, PlusIcon, RecycleIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type CommandeFournisseur, type LignePanier, type OffreProduit, type Panier } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, pluriel } from '@/format'
import { useFicheProduit } from '@/navigation'
import { TYPES_FOURNISSEUR } from '@/ecrans/FicheProduit'
import { EtatVide, Illustration } from '@/components/illustration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Modification = { ligne: LignePanier; quantite?: number; offreId?: number; retirer?: boolean }

/**
 * Le panier proposé, une commande par fournisseur. Tant qu'il n'est pas validé, chaque ligne se modifie :
 * quantité au colis près, autre fournisseur, ou retrait. Le serveur recalcule totaux et francos à chaque changement.
 */
export function FenetrePanier({ panier: propose, onFermer }: { panier: Panier; onFermer: () => void }) {
  const client = useQueryClient()
  const [panier, setPanier] = useState(propose)
  const brouillon = panier.statut === 'BROUILLON'

  const offres = useQuery({
    queryKey: ['offres', propose.id],
    queryFn: () => api.offres(propose.commandes.flatMap((c) => c.lignes.map((l) => l.cip13))),
    enabled: brouillon && propose.nombreLignes > 0,
  })

  const rafraichir = () => {
    client.invalidateQueries({ queryKey: ['dernier-panier'] })
  }

  const modifier = useMutation({
    mutationFn: ({ ligne, quantite, offreId, retirer }: Modification) =>
      retirer ? api.retirerLigne(panier.id, ligne.id) : api.modifierLigne(panier.id, ligne.id, { quantite, offreId }),
    onSuccess: (nouveau) => {
      setPanier(nouveau)
      rafraichir()
    },
  })

  const valider = useMutation({
    mutationFn: () => api.validerPanier(panier.id),
    onSuccess: (nouveau) => {
      setPanier(nouveau)
      for (const cle of ['previsions', 'tableau-de-bord', 'historique', 'dernier-panier', 'fiche']) {
        client.invalidateQueries({ queryKey: [cle] })
      }
      toast.success(`Panier validé : ${pluriel(nouveau.commandes.length, 'commande')} transmise${nouveau.commandes.length > 1 ? 's' : ''}`)
    },
  })

  const erreur = modifier.error ?? valider.error

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent taille="grande">
        <DialogHeader>
          <DialogTitle className="texte-section">{brouillon ? 'Panier proposé' : 'Commande validée'}</DialogTitle>
          <DialogDescription>
            {pluriel(panier.nombreLignes, 'produit')} · {pluriel(panier.commandes.length, 'fournisseur')} · couverture {panier.horizonJours} jours
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-6">
          {!brouillon && (
            <div className="flex flex-col items-center gap-1 text-center">
              <Illustration nom="commande-validee" className="w-full max-w-72" />
              <p className="texte-valeur text-st-ok">Commandes transmises aux fournisseurs</p>
            </div>
          )}
          {panier.nombreLignes === 0 ? (
            <EtatVide nom="panier-recommande">Rien à commander : tout est couvert ou déjà commandé.</EtatVide>
          ) : (
            panier.commandes.map((commande) => (
              <Commande
                key={commande.fournisseurId}
                commande={commande}
                modifiable={brouillon}
                offres={offres.data}
                enCours={modifier.isPending ? modifier.variables.ligne.id : null}
                onModifier={(m) => modifier.mutate(m)}
              />
            ))
          )}
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="texte-valeur tabular">Total {formaterEuros(panier.total)} HT</p>
            {erreur && <p className="texte-meta text-destructive">{erreur.message}</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onFermer}>
              {brouillon ? 'Garder pour plus tard' : 'Fermer'}
            </Button>
            {brouillon && panier.nombreLignes > 0 && (
              <Button onClick={() => valider.mutate()} disabled={valider.isPending || modifier.isPending}>
                {valider.isPending && <Spinner data-icon="inline-start" />}
                Valider et commander
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Commande({
  commande,
  modifiable,
  offres,
  enCours,
  onModifier,
}: {
  commande: CommandeFournisseur
  modifiable: boolean
  offres?: Record<string, OffreProduit[]>
  enCours: number | null
  onModifier: (m: Modification) => void
}) {
  const { ouvrir } = useFicheProduit()
  const destockage = commande.typeFournisseur === 'CONFRERE'
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-carte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="texte-section flex items-center gap-2">
            {destockage && <RecycleIcon className="size-4 text-marque" />}
            {commande.fournisseur}
          </h3>
          <p className="texte-meta">{TYPES_FOURNISSEUR[commande.typeFournisseur]}</p>
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
      <Table className="min-w-[44rem] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="texte-intitule">Produit</TableHead>
            <TableHead className="texte-intitule w-36 text-right">Quantité</TableHead>
            <TableHead className="texte-intitule w-24 text-right">Prix unitaire</TableHead>
            <TableHead className="texte-intitule w-24 text-right">Montant</TableHead>
            <TableHead className="texte-intitule w-28 pl-6">Livraison</TableHead>
            {modifiable && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {commande.lignes.map((ligne) => (
            <Ligne
              key={ligne.id}
              ligne={ligne}
              modifiable={modifiable}
              offres={offres?.[ligne.cip13]}
              occupee={enCours === ligne.id}
              onOuvrir={() => ouvrir(ligne.cip13)}
              onModifier={onModifier}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function Ligne({
  ligne,
  modifiable,
  offres,
  occupee,
  onOuvrir,
  onModifier,
}: {
  ligne: LignePanier
  modifiable: boolean
  offres?: OffreProduit[]
  occupee: boolean
  onOuvrir: () => void
  onModifier: (m: Modification) => void
}) {
  const offre = offres?.find((o) => o.id === ligne.offreId)
  const maximum = offre?.quantiteDisponible ?? Infinity

  return (
    <TableRow className={occupee ? 'opacity-60' : undefined}>
      <TableCell>
        <Button variant="lien-objet" size="texte" className="max-w-full truncate" onClick={onOuvrir}>
          {ligne.libelle}
        </Button>
        {modifiable && offres && offres.length > 1 ? (
          <Select value={String(ligne.offreId)} onValueChange={(id) => onModifier({ ligne, offreId: Number(id) })}>
            <SelectTrigger size="sm" className="mt-1 h-6 max-w-full border-dashed text-xs" aria-label="Fournisseur">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offres.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.fournisseur} · {formaterEuros(o.prixUnitaire)} · {o.delaiJours} j
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          ligne.peremption && <p className="texte-meta">Péremption {formaterDate(ligne.peremption)}</p>
        )}
      </TableCell>
      <TableCell className="text-right">
        {modifiable ? (
          <div className="inline-flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Un colis de moins"
              disabled={occupee || ligne.quantite <= ligne.colisage}
              onClick={() => onModifier({ ligne, quantite: ligne.quantite - ligne.colisage })}
            >
              <MinusIcon />
            </Button>
            <span className="texte-valeur w-10 text-center tabular">{ligne.quantite}</span>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Un colis de plus"
              disabled={occupee || ligne.quantite + ligne.colisage > maximum}
              onClick={() => onModifier({ ligne, quantite: ligne.quantite + ligne.colisage })}
            >
              <PlusIcon />
            </Button>
          </div>
        ) : (
          <p className="texte-donnee tabular">{ligne.quantite}</p>
        )}
        <p className="texte-meta tabular">
          {ligne.colisage > 1 ? `par ${ligne.colisage} · ` : ''}
          {ligne.quantiteSuggeree} utiles
        </p>
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
      {modifiable && (
        <TableCell>
          <Button
            variant="discret"
            size="icon-sm"
            aria-label={`Retirer ${ligne.libelle}`}
            disabled={occupee}
            onClick={() => onModifier({ ligne, retirer: true })}
          >
            <Trash2Icon />
          </Button>
        </TableCell>
      )}
    </TableRow>
  )
}
