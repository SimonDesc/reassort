import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, type TableauDeBord } from '@/api'
import { formaterEuros, pluriel } from '@/format'
import { allerA, type Ecran } from '@/navigation'
import { Illustration } from '@/components/illustration'
import { Button } from '@/components/ui/button'

type Conseil = { message: string; action?: { libelle: string; faire: () => void } }

const preparerPanier = { libelle: 'Voir le panier', faire: () => allerA('reassort', { panier: 'nouveau' }) }

/** Ce que l'assistant signale en arrivant sur chaque écran, à partir des mêmes chiffres que le serveur MCP. */
const CONSEILS: Partial<Record<Ecran, (t: TableauDeBord) => Conseil | null>> = {
  'tableau-de-bord': (t) => {
    const ruptures = t.produitsParStatut.RUPTURE_IMMINENTE
    const aCommander = t.produitsParStatut.A_COMMANDER
    if (ruptures + aCommander === 0) return { message: 'Tout le stock est couvert cette semaine.' }
    return {
      message: `${pluriel(ruptures, 'rupture imminente', 'ruptures imminentes')} et ${pluriel(aCommander, 'produit')} à commander. Je prépare le panier ?`,
      action: preparerPanier,
    }
  },
  reassort: (t) => {
    const n = t.produitsParStatut.RUPTURE_IMMINENTE + t.produitsParStatut.A_COMMANDER
    if (n === 0) return null
    return { message: `${pluriel(n, 'produit')} à traiter : le panier ci-dessous retient pour chacun l’offre la moins chère livrée à temps. Ajustez les quantités puis validez.` }
  },
  commandes: (t) =>
    t.commandesEnCours > 0
      ? { message: `${pluriel(t.commandesEnCours, 'commande')} en route pour ${formaterEuros(t.montantEnCours)} HT. Je vous préviens si une livraison arrive après la rupture.` }
      : null,
  statistiques: (t) =>
    t.economies90Jours > 0
      ? { message: `${formaterEuros(t.economies90Jours)} économisés en 90 jours en prenant chaque fois la meilleure offre.` }
      : null,
  destockage: (t) => {
    const n = t.produitsParStatut.SURSTOCK
    if (n === 0) return null
    return { message: `${pluriel(n, 'produit')} en surstock, ${formaterEuros(t.valeurSurstock)} immobilisés : des confrères peuvent les reprendre.` }
  },
}

const CLE = 'reassort.assistant.vus'

function lireVus(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(CLE) ?? '[]')
  } catch {
    return []
  }
}

function marquerVu(ecran: Ecran) {
  try {
    sessionStorage.setItem(CLE, JSON.stringify([...lireVus(), ecran]))
  } catch {
    // Sans stockage de session, la notification revient à chaque passage : sans gravité.
  }
}

/** Une fois par écran et par session, l'assistant de réassort glisse une notification en bas à droite. */
export function useAssistant(ecran: Ecran) {
  const tableau = useQuery({ queryKey: ['tableau-de-bord'], queryFn: api.tableauDeBord })

  useEffect(() => {
    const conseil = tableau.data && CONSEILS[ecran]?.(tableau.data)
    if (!conseil || lireVus().includes(ecran)) return
    const minuterie = setTimeout(() => {
      marquerVu(ecran)
      toast.custom((id) => <Notification conseil={conseil} onFermer={() => toast.dismiss(id)} />, { id: 'assistant', duration: 10000 })
    }, 700)
    return () => clearTimeout(minuterie)
    // Le conseil se calcule à l'arrivée sur l'écran ; une mise à jour des chiffres ne le relance pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecran, tableau.data === undefined])
}

function Notification({ conseil, onFermer }: { conseil: Conseil; onFermer: () => void }) {
  return (
    <div className="relative flex w-[min(380px,calc(100vw-2rem))] items-center gap-3 overflow-hidden rounded-xl border bg-popover p-3 pr-9 text-popover-foreground shadow-lg">
      <Illustration nom="assistant-reassort" className="w-24 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="texte-intitule text-primary">Assistant de réassort</span>
        <p className="text-sm leading-snug">{conseil.message}</p>
        {conseil.action && (
          <Button
            size="sm"
            className="mt-0.5 w-fit"
            onClick={() => {
              conseil.action!.faire()
              onFermer()
            }}
          >
            {conseil.action.libelle}
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={onFermer}
        aria-label="Fermer la notification"
        className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}
