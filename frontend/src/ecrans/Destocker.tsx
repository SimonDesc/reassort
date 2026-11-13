import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type SuggestionDestockage } from '@/api'
import { formaterDate, formaterEuros, formaterNombre } from '@/format'
import { useFicheProduit } from '@/navigation'
import { BarreListe, ChampRecherche, PageEcran, Segments, Tableau, type Colonne } from '@/components/liste'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Vue = 'a-publier' | 'publiees' | 'toutes'

/** Le surstock de l'officine, proposé aux confrères sur la marketplace. */
export function Destocker() {
  const client = useQueryClient()
  const { ouvrir } = useFicheProduit()
  const [vue, setVue] = useState<Vue>('a-publier')
  const [recherche, setRecherche] = useState('')
  const [aPublier, setAPublier] = useState<SuggestionDestockage | null>(null)
  const suggestions = useQuery({ queryKey: ['destockage'], queryFn: api.suggestionsDestockage })
  const retirer = useMutation({
    mutationFn: api.retirerAnnonce,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['destockage'] })
      toast.success('Annonce retirée de la marketplace')
    },
  })

  const liste = suggestions.data ?? []
  const nonPubliees = liste.filter((s) => !s.annonce)
  const publiees = liste.filter((s) => s.annonce)
  const cherche = recherche.trim().toLowerCase()
  const visibles = (vue === 'a-publier' ? nonPubliees : vue === 'publiees' ? publiees : liste).filter(
    (s) => !cherche || s.libelle.toLowerCase().includes(cherche) || s.cip13.includes(cherche),
  )
  const valeur = (s: SuggestionDestockage) => (s.annonce ? s.annonce.montant : s.quantiteADestocker * (s.prixConseille ?? 0))

  const colonnes: Colonne<SuggestionDestockage>[] = [
    { id: 'produit', libelle: 'Produit', rendu: (s) => s.libelle, tri: (s) => s.libelle },
    { id: 'stock', libelle: 'Stock', rendu: (s) => s.stock, tri: (s) => s.stock, alignement: 'droite', largeur: 80 },
    { id: 'ventes', libelle: 'Ventes / j', rendu: (s) => formaterNombre(s.venteMoyenneParJour), tri: (s) => s.venteMoyenneParJour, alignement: 'droite', largeur: 100, masqueeSous: 'md' },
    {
      id: 'couverture',
      libelle: 'Couverture',
      rendu: (s) => (s.couvertureJours === null ? 'Sans vente' : `${Math.round(s.couvertureJours)} j`),
      tri: (s) => s.couvertureJours ?? Infinity,
      alignement: 'droite',
      largeur: 110,
    },
    { id: 'aCeder', libelle: 'À céder', rendu: (s) => <span className="font-semibold text-titre">{s.annonce?.quantite ?? s.quantiteADestocker}</span>, tri: (s) => s.quantiteADestocker, alignement: 'droite', largeur: 90 },
    {
      id: 'prix',
      libelle: 'Prix unitaire',
      rendu: (s) => (s.annonce ? formaterEuros(s.annonce.prixUnitaire) : s.prixConseille !== null ? formaterEuros(s.prixConseille) : ''),
      alignement: 'droite',
      largeur: 120,
      masqueeSous: 'sm',
    },
    { id: 'valeur', libelle: 'Valeur HT', rendu: (s) => formaterEuros(valeur(s)), tri: valeur, alignement: 'droite', largeur: 120 },
    {
      id: 'annonce',
      libelle: 'Annonce',
      rendu: (s) =>
        s.annonce ? (
          <span className="inline-flex items-center gap-1">
            <Badge variant="ok">Publiée</Badge>
            <Button
              variant="discret"
              size="xs"
              onClick={(e) => {
                e.stopPropagation()
                retirer.mutate(s.annonce!.id)
              }}
            >
              Retirer
            </Button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => {
              e.stopPropagation()
              setAPublier(s)
            }}
          >
            Publier
          </Button>
        ),
      largeur: 160,
    },
  ]

  return (
    <PageEcran titre="Déstockage" nombre={suggestions.data ? visibles.length : undefined} pleineLargeur>
      <BarreListe>
        <ChampRecherche etiquette="Produit ou CIP13" valeur={recherche} onChange={setRecherche} />
        <Segments
          etiquette="Annonces affichées"
          valeur={vue}
          onChange={setVue}
          options={[
            { valeur: 'a-publier', libelle: 'À publier', nombre: nonPubliees.length },
            { valeur: 'publiees', libelle: 'Publiées', nombre: publiees.length },
            { valeur: 'toutes', libelle: 'Toutes', nombre: liste.length },
          ]}
        />
      </BarreListe>
      {retirer.isError && <p className="texte-donnee text-destructive">{retirer.error.message}</p>}
      <Tableau
        libelle="Produits en surstock"
        colonnes={colonnes}
        lignes={visibles}
        idLigne={(s) => s.cip13}
        onOuvrir={(s) => ouvrir(s.cip13)}
        chargement={suggestions.isPending}
        erreur={suggestions.error?.message}
        vide={vue === 'publiees' ? 'Aucune annonce publiée.' : 'Aucun produit en surstock.'}
      />
      {aPublier && <FenetrePublication suggestion={aPublier} onFermer={() => setAPublier(null)} />}
    </PageEcran>
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
      api.publierAnnonce({ cip13: suggestion.cip13, quantite: Number(quantite), prixUnitaire: Number(prix.replace(',', '.')), peremption }),
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
                <Input id="quantite" type="number" min={1} max={suggestion.stock} required value={quantite} onChange={(e) => setQuantite(e.target.value)} />
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
            <Button type="button" variant="outline" onClick={onFermer}>
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
