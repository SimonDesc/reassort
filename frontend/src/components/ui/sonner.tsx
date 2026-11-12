import { Toaster as Sonner, type ToasterProps } from "sonner"
import { AnimatedCheck } from "@/components/service-ui/animated-check"
import { InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Clair par défaut ; le cadre de l'application lui passe le thème choisi.
const Toaster = ({ theme = "light", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      closeButton
      richColors
      className="toaster group"
      icons={{
        success: (
          <AnimatedCheck className="size-6 text-st-done" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: "Fermer la notification",
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
