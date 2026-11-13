import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Reglages } from '@/api'
import { formaterDate } from '@/format'
import { EnteteEcran } from '@/components/entete'
import { Panel } from '@/components/service-ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

const CHAMPS: { cle: keyof Reglages; libelle: string; aide: string; min: number; max: number }[] = [
  { cle: 'joursHistorique', libelle: 'Historique de ventes', aide: 'Jours de ventes pris pour calculer la moyenne journalière.', min: 7, max: 90 },
  { cle: 'stockSecuriteJours', libelle: 'Stock de sécurité', aide: 'Jours de ventes gardés en plus du délai de livraison.', min: 0, max: 30 },
  { cle: 'surstockJours', libelle: 'Seuil de surstock', aide: 'Au-delà de cette couverture, le produit est en surstock.', min: 30, max: 365 },
  { cle: 'conserverJours', libelle: 'Stock à conserver', aide: 'Jours de ventes gardés quand on déstocke le reste.', min: 7, max: 365 },
]

/** Les paramètres du calcul : chaque officine règle sa prudence. Tout le reste de l'application en dépend. */
export function ReglagesEcran() {
  const reglages = useQuery({ queryKey: ['reglages'], queryFn: api.reglages })
  return (
    <div className="page-enter">
      <EnteteEcran titre="Réglages" sousTitre="Les règles de calcul des prévisions et du déstockage." />
      {reglages.isPending ? (
        <Skeleton className="h-80" />
      ) : reglages.isError ? (
        <p className="texte-donnee text-destructive">{reglages.error.message}</p>
      ) : (
        <Formulaire key={JSON.stringify(reglages.data)} initial={reglages.data} />
      )}
      <Demo />
    </div>
  )
}

function Formulaire({ initial }: { initial: Reglages }) {
  const client = useQueryClient()
  const [valeurs, setValeurs] = useState<Record<keyof Reglages, string>>(
    () => Object.fromEntries(CHAMPS.map(({ cle }) => [cle, String(initial[cle])])) as Record<keyof Reglages, string>,
  )
  const modifie = CHAMPS.some(({ cle }) => valeurs[cle] !== String(initial[cle]))

  const enregistrer = useMutation({
    mutationFn: () =>
      api.modifierReglages(Object.fromEntries(CHAMPS.map(({ cle }) => [cle, Number(valeurs[cle])])) as Reglages),
    onSuccess: (nouveaux) => {
      client.setQueryData(['reglages'], nouveaux)
      for (const cle of ['previsions', 'tableau-de-bord', 'fiche', 'destockage']) client.invalidateQueries({ queryKey: [cle] })
      toast.success('Réglages enregistrés : prévisions recalculées')
    },
  })

  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    enregistrer.mutate()
  }

  return (
    <Panel className="p-carte">
      <form onSubmit={envoyer} className="flex flex-col gap-6">
        <h2 className="texte-section">Prévision et déstockage</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {CHAMPS.map(({ cle, libelle, aide, min, max }) => (
            <div key={cle} className="flex flex-col gap-1.5">
              <Label htmlFor={cle}>{libelle}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={cle}
                  type="number"
                  required
                  min={min}
                  max={max}
                  className="w-28 tabular"
                  value={valeurs[cle]}
                  onChange={(e) => setValeurs({ ...valeurs, [cle]: e.target.value })}
                />
                <span className="texte-discret">jours</span>
              </div>
              <p className="texte-meta">
                {aide} Entre {min} et {max}.
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={!modifie || enregistrer.isPending}>
            {enregistrer.isPending && <Spinner data-icon="inline-start" />}
            Enregistrer
          </Button>
          {modifie && (
            <Button
              type="button"
              variant="discret"
              onClick={() => setValeurs(Object.fromEntries(CHAMPS.map(({ cle }) => [cle, String(initial[cle])])) as Record<keyof Reglages, string>)}
            >
              Annuler les modifications
            </Button>
          )}
          {enregistrer.isError && <p className="texte-donnee text-destructive">{enregistrer.error.message}</p>}
        </div>
      </form>
    </Panel>
  )
}

function Demo() {
  const client = useQueryClient()
  const resume = useQuery({ queryKey: ['resume'], queryFn: api.resume })
  const reinitialiser = useMutation({
    mutationFn: api.reinitialiser,
    onSuccess: () => {
      client.invalidateQueries()
      toast.success('Démonstration réinitialisée')
    },
  })

  return (
    <Panel tone="muted" className="mt-6 gap-3 p-carte">
      <h2 className="texte-section">Données de démonstration</h2>
      <p className="texte-discret">
        En production, stock et ventes arrivent du logiciel de gestion de l’officine (LGO).
        {resume.data?.premiereVente && resume.data.derniereVente &&
          ` Ici, ${resume.data.produits} produits et leurs ventes du ${formaterDate(resume.data.premiereVente)} au ${formaterDate(resume.data.derniereVente)}.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => reinitialiser.mutate()} disabled={reinitialiser.isPending}>
          {reinitialiser.isPending ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
          Réinitialiser la démo
        </Button>
        <p className="texte-meta">Remet le stock, les commandes, les annonces et les réglages à leur état de départ.</p>
      </div>
      {reinitialiser.isError && <p className="texte-donnee text-destructive">{reinitialiser.error.message}</p>}
    </Panel>
  )
}
