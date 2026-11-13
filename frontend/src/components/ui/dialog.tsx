import * as React from "react"
import { cn } from "@/components/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Service 9000 : trois largeurs pour toutes les fenêtres (GUIDE-UI §7). `petite` : une décision, une erreur, un
 * message ; `moyenne` : un formulaire court ; `grande` : une fiche, un passage, un import. La grande garde une hauteur
 * minimale : une fenêtre peu remplie ne rétrécit pas, son pied reste en bas. Sur un écran étroit, une marge reste de
 * chaque côté.
 */
const TAILLES = {
  petite: "sm:max-w-[min(32rem,calc(100%-2rem))]",
  moyenne: "sm:max-w-[min(42rem,calc(100%-2rem))]",
  grande: "sm:max-w-[min(64rem,calc(100%-2rem))] min-h-[min(40rem,calc(100dvh-2*var(--marge-fenetre)))]",
} as const

/** Service 9000 : saisir le bandeau d'une fenêtre pour la déplacer (`DialogHeader`), sans rien d'autre à poser. */
const DeplacementFenetre = React.createContext<{ saisir: (e: React.PointerEvent<HTMLElement>) => void; replacer: (e: React.MouseEvent<HTMLElement>) => void } | null>(null)

/** Ce qui se saisit dans un bandeau sans le déplacer : ses boutons, ses liens, ses champs. */
const INTERACTIF = "button, a, input, select, textarea, [role=button]"

/**
 * La fenêtre suit le pointeur tant qu'on tient son bandeau ; le bandeau reste dans l'écran. Un double-clic sur le
 * bandeau la remet à sa place. Le décalage vit avec la fenêtre : rouverte, elle revient à sa place.
 */
function useDeplacement() {
  const [decalage, setDecalage] = React.useState({ x: 0, y: 0 })
  // Pendant le geste, la fenêtre suit le pointeur sans transition ; le retour par double-clic reste animé.
  const [enCours, setEnCours] = React.useState(false)
  const saisir = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest(INTERACTIF)) return
    const fenetre = e.currentTarget.closest<HTMLElement>("[data-slot=dialog-content]")
    if (!fenetre) return
    e.preventDefault()
    // Le décalage déjà pris se lit sur la fenêtre (ses marges), là où il est posé.
    const depart = { pointeurX: e.clientX, pointeurY: e.clientY, x: parseFloat(fenetre.style.marginLeft) || 0, y: parseFloat(fenetre.style.marginTop) || 0 }
    const cadre = fenetre.getBoundingClientRect()
    const hauteurBandeau = e.currentTarget.getBoundingClientRect().height
    const suivre = (m: PointerEvent) => {
      // Le bandeau reste dans l'écran : on peut toujours reprendre la fenêtre.
      const dx = Math.min(Math.max(m.clientX - depart.pointeurX, 80 - cadre.right), window.innerWidth - 80 - cadre.left)
      const dy = Math.min(Math.max(m.clientY - depart.pointeurY, -cadre.top), window.innerHeight - hauteurBandeau - cadre.top)
      setDecalage({ x: depart.x + dx, y: depart.y + dy })
    }
    const lacher = () => {
      setEnCours(false)
      window.removeEventListener("pointermove", suivre)
      window.removeEventListener("pointerup", lacher)
      window.removeEventListener("pointercancel", lacher)
    }
    setEnCours(true)
    window.addEventListener("pointermove", suivre)
    window.addEventListener("pointerup", lacher)
    window.addEventListener("pointercancel", lacher)
  }, [])
  const replacer = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!(e.target as Element).closest(INTERACTIF)) setDecalage({ x: 0, y: 0 })
  }, [])
  const valeur = React.useMemo(() => ({ saisir, replacer }), [saisir, replacer])
  return { decalage, enCours, valeur }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  taille = "petite",
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  taille?: keyof typeof TAILLES
}) {
  const { decalage, enCours, valeur } = useDeplacement()
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-fermeture={showCloseButton || undefined}
        data-taille={taille}
        data-deplacement={enCours || undefined}
        // Service 9000 : en colonne, le bandeau (`DialogHeader`), le contenu qui défile seul (`DialogBody`) et le pied
        // (`DialogFooter`) ; un formulaire qui englobe la fenêtre s'efface de la mise en page. Déplacée par son bandeau :
        // un décalage depuis sa place.
        style={{ ...style, marginLeft: decalage.x || undefined, marginTop: decalage.y || undefined }}
        className={cn(
          // Service 9000 : le bord haut est ancré (GUIDE-UI §7). La fenêtre ne se recentre pas quand son contenu change
          // de hauteur (onglet, liste chargée) : elle grandit vers le bas, jusqu'à garder la même marge en bas, puis défile.
          "group/fenetre cartes-etroites fixed top-(--marge-fenetre) left-1/2 z-50 flex max-h-[calc(100dvh-2*var(--marge-fenetre))] w-full origin-top flex-col max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none [--marge-fenetre:clamp(1rem,8dvh,5rem)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-deplacement:transition-none [&>form]:contents",
          TAILLES[taille],
          className
        )}
        {...props}
      >
        <DeplacementFenetre.Provider value={valeur}>
          {children}
        </DeplacementFenetre.Provider>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2.5 right-2.5 z-20"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Fermer</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * Service 9000 : l'en-tête de toute fenêtre, un bandeau en haut : son nom (`DialogTitle`, toujours visible),
 * sa description éventuelle, puis ses `actions` à droite (« Ouvrir en pleine page »), avant la croix de fermeture.
 */
function DialogHeader({ className, actions, children, ...props }: React.ComponentProps<"div"> & { actions?: React.ReactNode }) {
  const deplacement = React.useContext(DeplacementFenetre)
  return (
    <div
      data-slot="dialog-header"
      // Le bandeau se saisit pour déplacer la fenêtre ; un double-clic la remet à sa place.
      onPointerDown={deplacement?.saisir}
      onDoubleClick={deplacement?.replacer}
      // La croix de fermeture garde sa place, un titre long passe à la ligne avant elle.
      className={cn("flex min-h-12 shrink-0 items-start gap-3 border-b px-4 py-3 group-data-[fermeture]/fenetre:pr-12", deplacement && "cursor-grab touch-none select-none active:cursor-grabbing", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      {actions && <div className="-my-1 flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * Service 9000 : le contenu d'une fenêtre, entre le bandeau et le pied ; lui seul défile, sa barre ne longe ni l'un ni
 * l'autre. Ce qui y est placé en absolu (textes des lecteurs d'écran, listes natives cachées) y reste.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Service 9000 : un bandeau en bas de la fenêtre, toujours au même endroit.
        "mt-auto flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 px-4 py-3 sm:flex-row sm:flex-wrap sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-6 font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
