import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2Icon, PackageCheckIcon, RecycleIcon, TruckIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type CommandeFournisseur, type Panier } from '@/api'
import { formaterDate, formaterEcheance, formaterEuros, formaterHeure, pluriel } from '@/format'
import { useFicheProduit } from '@/navigation'
import { EnteteEcran } from '@/components/entete'
import { Panel } from '@/components/service-ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TYPES_FOURNISSEUR } from '@/ecrans/FicheProduit'

type Vue = 'en-cours' | 'recues' | 'toutes'

/** L'historique des commandes validées, et la réception des cartons qui remonte le stock. */
export function Commandes() {
  const [vue, setVue] = useState<Vue>('en-cours')
  const historique = useQuery({ queryKey: ['historique'], queryFn: api.historique })
  const liste = historique.data ?? []
  const enCours = liste.filter((p) => p.statut === 'VALIDE')
  const visibles = vue === 'toutes' ? liste : vue === 'en-cours' ? enCours : liste.filter((p) => p.statut === 'RECU')
  const montantEnCours = enCours.reduce((a, p) => a + p.total, 0)

  return (
    <div className="page-enter">
      <EnteteEcran
        titre="Commandes"
        sousTitre={
          historique.data &&
          (enCours.length
            ? `${pluriel(enCours.length, 'commande')} en attente de livraison · ${formaterEuros(montantEnCours)} HT`
            : 'Aucune livraison attendue')
        }
        actions={
          <Tabs value={vue} onValueChange={(v) => setVue(v as Vue)}>
            <TabsList aria-label="Commandes affichées">
              <TabsTrigger value="en-cours" className="px-3">En cours · {enCours.length}</TabsTrigger>
              <TabsTrigger value="recues" className="px-3">Reçues</TabsTrigger>
              <TabsTrigger value="toutes" className="px-3">Toutes</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {historique.isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : historique.isError ? (
        <p className="texte-donnee text-destructive">{historique.error.message}</p>
      ) : visibles.length === 0 ? (
        <Panel className="items-center gap-2 p-carte py-12 text-center">
          <TruckIcon className="size-6 text-muted-foreground" />
          <p className="texte-discret">
            {vue === 'en-cours' ? 'Aucune commande en cours. Préparez un panier depuis « Réassort ».' : 'Aucune commande.'}
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {visibles.map((panier) => (
            <CartePanier key={panier.id} panier={panier} />
          ))}
        </div>
      )}
    </div>
  )
}

function CartePanier({ panier }: { panier: Panier }) {
  const client = useQueryClient()
  const recevoir = useMutation({
    mutationFn: (commande: CommandeFournisseur) => api.recevoir(panier.id, commande.fournisseurId),
    onSuccess: (_, commande) => {
      for (const cle of ['historique', 'previsions', 'tableau-de-bord', 'fiche', 'destockage']) {
        client.invalidateQueries({ queryKey: [cle] })
      }
      const boites = commande.lignes.reduce((a, l) => a + l.quantite, 0)
      toast.success(`${commande.fournisseur} réceptionné : ${boites} boîtes ajoutées au stock`)
    },
  })
  const recues = panier.commandes.filter((c) => c.recueLe).length

  return (
    <Panel className="gap-4 p-carte">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="texte-section flex items-center gap-2">
            Commande du {panier.valideLe ? formaterDate(panier.valideLe) : formaterDate(panier.creeLe)}
            {panier.statut === 'RECU' ? (
              <Badge variant="ok">Reçue</Badge>
            ) : (
              <Badge variant="commande">
                {recues ? `${recues}/${panier.commandes.length} livraisons reçues` : 'En attente de livraison'}
              </Badge>
            )}
          </h2>
          <p className="texte-meta">
            {pluriel(panier.nombreLignes, 'produit')} · {pluriel(panier.commandes.length, 'fournisseur')} · réassort {panier.horizonJours} jours
            {panier.valideLe && ` · validée à ${formaterHeure(panier.valideLe)}`}
          </p>
        </div>
        <p className="texte-valeur tabular">{formaterEuros(panier.total)} HT</p>
      </div>

      <ul className="flex flex-col divide-y rounded-lg border">
        {panier.commandes.map((commande) => (
          <Livraison
            key={commande.fournisseurId}
            commande={commande}
            enCours={recevoir.isPending && recevoir.variables.fournisseurId === commande.fournisseurId}
            onRecevoir={panier.statut === 'VALIDE' ? () => recevoir.mutate(commande) : undefined}
          />
        ))}
      </ul>
      {recevoir.isError && <p className="texte-donnee text-destructive">{recevoir.error.message}</p>}
    </Panel>
  )
}

function Livraison({ commande, enCours, onRecevoir }: { commande: CommandeFournisseur; enCours: boolean; onRecevoir?: () => void }) {
  const { ouvrir } = useFicheProduit()
  const [ouverte, setOuverte] = useState(false)
  const prevue = commande.lignes.reduce<string | null>((max, l) => (!max || l.livraisonPrevueLe > max ? l.livraisonPrevueLe : max), null)

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="texte-valeur flex items-center gap-1.5">
            {commande.typeFournisseur === 'CONFRERE' && <RecycleIcon className="size-3.5 text-marque" />}
            {commande.fournisseur}
          </span>
          <span className="texte-meta">
            {TYPES_FOURNISSEUR[commande.typeFournisseur]} ·{' '}
            <Button variant="lien-discret" size="texte" className="text-xs" onClick={() => setOuverte(!ouverte)}>
              {pluriel(commande.lignes.length, 'produit')}
            </Button>
          </span>
        </div>
        <span className="texte-donnee tabular">{formaterEuros(commande.sousTotal)}</span>
        {commande.recueLe ? (
          <span className="texte-meta flex w-44 items-center justify-end gap-1 text-st-ok">
            <CheckCircle2Icon className="size-3.5" />
            reçue le {formaterDate(commande.recueLe)}
          </span>
        ) : (
          <div className="flex w-44 flex-col items-end gap-1">
            {onRecevoir && (
              <Button size="sm" variant="outline" onClick={onRecevoir} disabled={enCours}>
                {enCours ? <Spinner data-icon="inline-start" /> : <PackageCheckIcon data-icon="inline-start" />}
                Réceptionner
              </Button>
            )}
            {prevue && <span className="texte-meta">attendue {formaterEcheance(prevue)}</span>}
          </div>
        )}
      </div>
      {ouverte && (
        <ul className="flex flex-col gap-1 border-l-2 pl-3">
          {commande.lignes.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3">
              <Button variant="lien-objet" size="texte" className="texte-donnee truncate font-normal" onClick={() => ouvrir(l.cip13)}>
                {l.libelle}
              </Button>
              <span className="texte-meta shrink-0 tabular">
                {l.quantite} × {formaterEuros(l.prixUnitaire)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
