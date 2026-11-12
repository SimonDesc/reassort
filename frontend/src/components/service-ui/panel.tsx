import { cn } from "@/components/lib/utils"

/* Panneau « atelier » : remplace la Card shadcn. Niveaux de surface :
 *   - fond de page (background)   - zone de travail (Panel)   - contexte (Panel tone="muted")
 *   - bloc d'une fiche (Panel tone="plat") : bordure fine, sans ombre
 */
export function Panel({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"section"> & { tone?: "default" | "muted" | "plat" }) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col border",
        tone === "default"
          ? "rounded-2xl bg-card border-border/70 shadow-[0_1px_2px_oklch(0.3_0.08_273/0.05),0_8px_24px_-12px_oklch(0.3_0.1_273/0.16)]"
          : tone === "muted"
            ? "rounded-2xl bg-surface border-transparent"
            : "rounded-lg bg-card",
        className,
      )}
      {...props}
    />
  )
}
