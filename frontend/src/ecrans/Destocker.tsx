import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type SuggestionDestockage } from '@/api'
import { formaterDate, formaterEuros, formaterNombre, pluriel } from '@/format'
import { Panel } from '@/components/service-ui/panel'
import { EnteteEcran } from '@/components/entete'
import { useFicheProduit } from '@/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

/** Ce qui dort dans la pharmacie, proposé aux confrères sur la marketplace. */
export function Destocker() {
  const client = useQueryClient()
  const [aPublier, setAPublier] = useState<SuggestionDestockage | null>(null)
  const suggestions = useQuery({ queryKey: ['destockage'], queryFn: api.suggestionsDestockage })
  const retirer = useMutation({
    mutationFn: api.retirerAnnonce,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['destockage'] })
      toast.success('Annonce retirée')
    },
  })

  const { ouvrir } = useFicheProduit()
  const liste = suggestions.data ?? []
  const valeur = liste.reduce((total, s) => total + s.quantiteADestocker * (s.prixConseille ?? 0), 0)

  return (
    <div className="page-enter">
      <EnteteEcran
        titre="Déstockage"
        sousTitre={
          suggestions.data &&
          (liste.length === 0
            ? 'Aucun surstock : rien à déstocker.'
            : `${pluriel(liste.length, 'produit')} en surstock · environ ${formaterEuros(valeur)} à récupérer en les proposant aux confrères`)
        }
      />
      <Panel className="gap-6 p-carte">
      {suggestions.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : suggestions.isError ? (
        <p className="texte-donnee text-destructive">{suggestions.error.message}</p>
      ) : (
        liste.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="texte-intitule">Produit</TableHead>
                <TableHead className="texte-intitule text-right">Stock</TableHead>
                <TableHead className="texte-intitule text-right">Couverture</TableHead>
                <TableHead className="texte-intitule text-right">À déstocker</TableHead>
                <TableHead className="texte-intitule text-right">Prix conseillé</TableHead>
                <TableHead className="texte-intitule">Annonce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liste.map((s) => (
                <TableRow key={s.cip13}>
                  <TableCell className="max-w-80">
                    <Button variant="lien-objet" size="texte" className="max-w-full truncate" onClick={() => ouvrir(s.cip13)}>
                      {s.libelle}
                    </Button>
                    <p className="texte-meta tabular">{formaterNombre(s.venteMoyenneParJour)} vendus par jour</p>
                  </TableCell>
                  <TableCell className="texte-donnee tabular text-right">{s.stock}</TableCell>
                  <TableCell className="texte-donnee tabular text-right">
                    {s.couvertureJours === null ? 'Aucune vente' : `${Math.round(s.couvertureJours)} j`}
                  </TableCell>
                  <TableCell className="texte-valeur tabular text-right">{s.quantiteADestocker}</TableCell>
                  <TableCell className="texte-donnee tabular text-right">
                    {s.prixConseille !== null && formaterEuros(s.prixConseille)}
                  </TableCell>
                  <TableCell>
                    {s.annonce ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="ok">
                          Publiée · {s.annonce.quantite} × {formaterEuros(s.annonce.prixUnitaire)}
                        </Badge>
                        <Button variant="discret" size="xs" onClick={() => setAPublier(s)}>
                          Modifier
                        </Button>
                        <Button variant="discret" size="xs" onClick={() => retirer.mutate(s.annonce!.id)}>
                          Retirer
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setAPublier(s)}>
                        Publier
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      </Panel>
      {aPublier && <FenetrePublication suggestion={aPublier} onFermer={() => setAPublier(null)} />}
    </div>
  )
}

function FenetrePublication({ suggestion, onFermer }: { suggestion: SuggestionDestockage; onFermer: () => void }) {
  const client = useQueryClient()
  const annonce = suggestion.annonce
  const [quantite, setQuantite] = useState(String(annonce?.quantite ?? suggestion.quantiteADestocker))
  const [prix, setPrix] = useState(String(annonce?.prixUnitaire ?? suggestion.prixConseille ?? ''))
  const [peremption, setPeremption] = useState(annonce?.peremption ?? '')

  const publier = useMutation({
    mutationFn: () =>
      api.publierAnnonce({
        cip13: suggestion.cip13,
        quantite: Number(quantite),
        prixUnitaire: Number(prix.replace(',', '.')),
        peremption,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['destockage'] })
      toast.success(`${suggestion.libelle} : annonce publiée`)
      onFermer()
    },
  })

  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    publier.mutate()
  }

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent taille="moyenne">
        <form onSubmit={envoyer}>
          <DialogHeader>
            <DialogTitle className="texte-section">{annonce ? 'Modifier l’annonce' : 'Publier sur la marketplace'}</DialogTitle>
            <DialogDescription>
              {suggestion.libelle} · {suggestion.stock} en stock
              {annonce && ` · publiée le ${formaterDate(annonce.publieeLe)}`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantite">Quantité</Label>
                <Input id="quantite" type="number" min={1} max={suggestion.stock} required value={quantite}
                  onChange={(e) => setQuantite(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prix">Prix unitaire HT (€)</Label>
                <Input id="prix" inputMode="decimal" required value={prix} onChange={(e) => setPrix(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="peremption">Péremption du lot</Label>
                <Input id="peremption" type="date" required value={peremption} onChange={(e) => setPeremption(e.target.value)} />
              </div>
            </div>
            {publier.isError && <p className="texte-donnee text-destructive">{publier.error.message}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onFermer}>
              Annuler
            </Button>
            <Button type="submit" disabled={publier.isPending}>
              {annonce ? 'Mettre à jour' : 'Publier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
