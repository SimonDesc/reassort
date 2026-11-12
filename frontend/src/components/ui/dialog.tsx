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
 * trois largeurs pour toutes les fenêtres. `petite` : une décision, une erreur, un
 * message ; `moyenne` : un formulaire court ; `grande` : un panier, un import. La grande garde une hauteur
 * minimale : une fenêtre peu remplie ne rétrécit pas, son pied reste en bas. Sur un écran étroit, une marge reste de
 * chaque côté.
 */
const TAILLES = {
  petite: "sm:max-w-[min(32rem,calc(100%-2rem))]",
  moyenne: "sm:max-w-[min(42rem,calc(100%-2rem))]",
  grande: "sm:max-w-[min(64rem,calc(100%-2rem))] min-h-[min(40rem,calc(100dvh-2*var(--marge-fenetre)))]",
} as const

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
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-fermeture={showCloseButton || undefined}
        data-taille={taille}
        // En colonne : le bandeau (`DialogHeader`), le contenu qui défile seul (`DialogBody`) et le pied (`DialogFooter`) ;
        // un formulaire qui englobe la fenêtre s'efface de la mise en page.
        style={style}
        className={cn(
          // le bord haut est ancré. La fenêtre ne se recentre pas quand son contenu change
          // de hauteur (onglet, liste chargée) : elle grandit vers le bas, jusqu'à garder la même marge en bas, puis défile.
          "group/fenetre cartes-etroites fixed top-(--marge-fenetre) left-1/2 z-50 flex max-h-[calc(100dvh-2*var(--marge-fenetre))] w-full origin-top flex-col max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none [--marge-fenetre:clamp(1rem,8dvh,5rem)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 [&>form]:contents",
          TAILLES[taille],
          className
        )}
        {...props}
      >
        {children}
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
 * l'en-tête de toute fenêtre, un bandeau en haut : son nom (`DialogTitle`, toujours visible),
 * sa description éventuelle, puis ses `actions` à droite (« Ouvrir en pleine page »), avant la croix de fermeture.
 */
function DialogHeader({ className, actions, children, ...props }: React.ComponentProps<"div"> & { actions?: React.ReactNode }) {
  return (
    <div
      data-slot="dialog-header"
      // La croix de fermeture garde sa place, un titre long passe à la ligne avant elle.
      className={cn("flex min-h-12 shrink-0 items-start gap-3 border-b px-4 py-3 group-data-[fermeture]/fenetre:pr-12", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      {actions && <div className="-my-1 flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * le contenu d'une fenêtre, entre le bandeau et le pied ; lui seul défile, sa barre ne longe ni l'un ni
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
        // un bandeau en bas de la fenêtre, toujours au même endroit.
        "mt-auto flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 px-4 py-3 sm:flex-row sm:flex-wrap sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Fermer</Button>
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
