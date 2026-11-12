import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PillIcon, RotateCcwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/service-ui/panel'

type Resume = {
  produits: number
  fournisseurs: number
  offres: number
  premiereVente: string | null
  derniereVente: string | null
  stockReleveLe: string | null
}

const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(url, init)
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return (await reponse.json()) as T
}

/** Coque de l'application ; le tableau des ruptures et le panier arrivent aux lots 3 à 5. */
export function App() {
  const client = useQueryClient()
  const resume = useQuery({ queryKey: ['resume'], queryFn: () => appeler<Resume>('/api/demo/resume') })
  const reinitialiser = useMutation({
    mutationFn: () => appeler<Resume>('/api/demo/reinitialiser', { method: 'POST' }),
    onSuccess: (donnees) => {
      client.setQueryData(['resume'], donnees)
      toast.success('Démo réinitialisée')
    },
  })

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PillIcon className="size-5" />
            </div>
            <div>
              <p className="texte-titre">Réassort</p>
              <p className="texte-meta">Pharmacie de démonstration</p>
            </div>
          </div>
          <Button variant="discret" size="sm" onClick={() => reinitialiser.mutate()} disabled={reinitialiser.isPending}>
            <RotateCcwIcon data-icon="inline-start" />
            Réinitialiser la démo
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-8">
        <Panel className="page-enter p-carte">
          {resume.isPending ? (
            <Skeleton className="h-5 w-96 max-w-full" />
          ) : resume.isError ? (
            <p className="texte-donnee text-destructive">Le serveur ne répond pas.</p>
          ) : (
            <ResumeDonnees resume={resume.data} />
          )}
        </Panel>
      </main>
    </div>
  )
}

function ResumeDonnees({ resume }: { resume: Resume }) {
  const { produits, fournisseurs, offres, premiereVente, derniereVente, stockReleveLe } = resume
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      <Propriete intitule="Produits suivis" valeur={String(produits)} />
      {premiereVente && derniereVente && (
        <Propriete
          intitule="Ventes analysées"
          valeur={`du ${jour.format(new Date(premiereVente))} au ${jour.format(new Date(derniereVente))}`}
        />
      )}
      {stockReleveLe && <Propriete intitule="Stock relevé" valeur={`aujourd'hui à ${heure.format(new Date(stockReleveLe))}`} />}
      <Propriete intitule="Offres de la marketplace" valeur={`${offres} chez ${fournisseurs} fournisseurs`} />
    </dl>
  )
}

function Propriete({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="texte-intitule">{intitule}</dt>
      <dd className="texte-valeur tabular">{valeur}</dd>
    </div>
  )
}
