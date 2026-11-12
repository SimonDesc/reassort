import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageOpenIcon, PillIcon, RotateCcwIcon, ShoppingCartIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { formaterHeure, formaterJour } from '@/format'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Commander } from '@/ecrans/Commander'
import { Destocker } from '@/ecrans/Destocker'

/** Coque : la pharmacie de démonstration, ses données, et les deux faces de la marketplace. */
export function App() {
  const client = useQueryClient()
  const resume = useQuery({ queryKey: ['resume'], queryFn: api.resume })
  const reinitialiser = useMutation({
    mutationFn: api.reinitialiser,
    onSuccess: () => {
      client.invalidateQueries()
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
              <p className="texte-meta">
                Pharmacie de démonstration
                {resume.data?.premiereVente && resume.data.derniereVente && resume.data.stockReleveLe && (
                  <span className="hidden sm:inline">
                    {' '}· {resume.data.produits} produits · ventes du {formaterJour(resume.data.premiereVente)} au{' '}
                    {formaterJour(resume.data.derniereVente)} · stock relevé à {formaterHeure(resume.data.stockReleveLe)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button variant="discret" size="sm" onClick={() => reinitialiser.mutate()} disabled={reinitialiser.isPending}>
            <RotateCcwIcon data-icon="inline-start" />
            Réinitialiser la démo
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
        <Tabs defaultValue="commander" className="gap-6">
          <TabsList variant="line">
            <TabsTrigger value="commander" className="px-3">
              <ShoppingCartIcon data-icon="inline-start" />
              Commander
            </TabsTrigger>
            <TabsTrigger value="destocker" className="px-3">
              <PackageOpenIcon data-icon="inline-start" />
              Déstocker
            </TabsTrigger>
          </TabsList>
          <TabsContent value="commander">
            <Commander />
          </TabsContent>
          <TabsContent value="destocker">
            <Destocker />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
