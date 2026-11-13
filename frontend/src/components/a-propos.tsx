import { useState } from 'react'
import { ExternalLinkIcon, MailIcon, UserRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

const DEPOT = 'https://github.com/SimonDesc/reassort'

/** Ce que l'offre demande, et où le voir dans la démo. */
const CORRESPONDANCES: [string, string][] = [
  ['Du catalogue à la réception des cartons', 'Prévision, panier multi-fournisseurs, réception, déstockage entre confrères'],
  ['Back Java / Spring Boot', 'Spring Boot 4, SQL lisible (JdbcClient), Flyway, PostgreSQL'],
  ['Front TypeScript / React', 'React 19, TanStack Query, shadcn/ui, Recharts'],
  ['Qualité', '75 tests JUnit sur un vrai PostgreSQL, client MCP de bout en bout'],
  ['Infra et delivery', 'Image Docker, Coolify sur VPS, CI GitHub Actions'],
  ['Outillage IA', 'Développé avec Claude Code, serveur MCP pour piloter le réassort'],
]

/** Le lien discret en bas de la barre latérale, et la fenêtre qui présente l'auteur de la démo. */
export function APropos() {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Démo réalisée par Simon Descombes" onClick={() => setOuvert(true)}>
          <UserRoundIcon />
          <span>Simon Descombes</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {ouvert && (
        <Dialog open onOpenChange={setOuvert}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="texte-section">Simon Descombes</DialogTitle>
              <DialogDescription>Lead développeur full stack · Toulouse</DialogDescription>
            </DialogHeader>
            <DialogBody className="gap-5">
              <p className="text-sm leading-relaxed">
                Dix ans à déployer une GMAO chez des centaines de clients, puis développeur. Je pilote aujourd’hui la modernisation des
                produits de Technic-Soft (PWA pour plus de 2 000 techniciens, migration d’un logiciel de plus de 7 000 utilisateurs, RAG,
                CI/CD, serveurs MCP) et j’encadre 2 à 4 développeurs. Réassort est ma réponse à l’offre de développeur fullstack du
                Comptoir des Pharmacies.
              </p>
              <dl className="grid gap-x-4 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-[minmax(0,13rem)_1fr]">
                {CORRESPONDANCES.map(([offre, demo]) => (
                  <div key={offre} className="contents">
                    <dt className="font-medium text-titre">{offre}</dt>
                    <dd className="text-muted-foreground">{demo}</dd>
                  </div>
                ))}
              </dl>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" asChild>
                <a href={DEPOT} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  Code source
                </a>
              </Button>
              <Button asChild>
                <a href="mailto:pro.descombes@gmail.com?subject=R%C3%A9assort">
                  <MailIcon data-icon="inline-start" />
                  pro.descombes@gmail.com
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
