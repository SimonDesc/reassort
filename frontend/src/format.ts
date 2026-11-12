/** Mise en forme à la française : montants, quantités, dates. */

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const jourMois = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const jourMoisAnnee = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formaterEuros = (montant: number) => euros.format(montant)
export const formaterNombre = (valeur: number) => decimal.format(valeur)

/** Une date ISO (AAAA-MM-JJ) lue comme une date locale, sans décalage de fuseau. */
const dateLocale = (iso: string) => {
  const [annee, mois, jour] = iso.slice(0, 10).split('-').map(Number)
  return new Date(annee, mois - 1, jour)
}

export const formaterJour = (iso: string) => jourMois.format(dateLocale(iso))
export const formaterDate = (iso: string) => jourMoisAnnee.format(dateLocale(iso))
export const formaterHeure = (iso: string) => heure.format(new Date(iso))

/** « aujourd'hui », « demain », « dans 3 j » ou la date, pour une échéance proche. */
export function formaterEcheance(iso: string) {
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)
  const jours = Math.round((dateLocale(iso).getTime() - aujourdhui.getTime()) / 86_400_000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return 'demain'
  if (jours < 14) return `dans ${jours} j`
  return formaterJour(iso)
}

export const pluriel = (n: number, singulier: string, plurielForme = `${singulier}s`) =>
  `${n} ${n > 1 ? plurielForme : singulier}`
