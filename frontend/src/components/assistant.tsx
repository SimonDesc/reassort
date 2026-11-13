import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { api, type TableauDeBord } from "@/api";
import { formaterEuros, pluriel } from "@/format";
import { allerA, useEcran, type Ecran } from "@/navigation";
import { cn } from "@/components/lib/utils";
import { Illustration } from "@/components/illustration";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type Conseil = {
  message: string;
  action?: { libelle: string; faire: () => void };
};

const voirPanier = {
  libelle: "Voir le panier",
  faire: () => allerA("reassort"),
};

/** Ce que l'assistant dit sur chaque écran, à partir des mêmes chiffres que le serveur MCP. */
const CONSEILS: Record<Ecran, (t: TableauDeBord) => Conseil> = {
  "tableau-de-bord": (t) => {
    const ruptures = t.produitsParStatut.RUPTURE_IMMINENTE;
    const aCommander = t.produitsParStatut.A_COMMANDER;
    if (ruptures + aCommander === 0)
      return { message: "Tout le stock est couvert cette semaine." };
    return {
      message: `${pluriel(ruptures, "rupture imminente", "ruptures imminentes")} et ${pluriel(aCommander, "produit")} à commander : le panier est prêt.`,
      action: voirPanier,
    };
  },
  reassort: (t) => {
    const n =
      t.produitsParStatut.RUPTURE_IMMINENTE + t.produitsParStatut.A_COMMANDER;
    if (n === 0)
      return {
        message: "Rien à commander : tout est couvert ou déjà en route.",
      };
    return {
      message: `${pluriel(n, "produit")} à traiter. Pour chacun, j’ai retenu l’offre la moins chère livrée à temps ; ajustez puis validez.`,
    };
  },
  commandes: (t) =>
    t.commandesEnCours > 0
      ? {
          message: `${pluriel(t.commandesEnCours, "commande")} en route pour ${formaterEuros(t.montantEnCours)} HT. Pointez chaque carton à son arrivée.`,
        }
      : { message: "Aucune commande en route." },
  statistiques: (t) =>
    t.economies90Jours > 0
      ? {
          message: `${formaterEuros(t.economies90Jours)} économisés en 90 jours en prenant chaque fois la meilleure offre.`,
        }
      : {
          message:
            "Comparez la consommation et les réassorts semaine par semaine.",
        },
  destockage: (t) => {
    const n = t.produitsParStatut.SURSTOCK;
    if (n === 0) return { message: "Aucun surstock à céder." };
    return {
      message: `${pluriel(n, "produit")} en surstock, ${formaterEuros(t.valeurSurstock)} immobilisés : des confrères peuvent les reprendre.`,
    };
  },
  reglages: () => ({
    message:
      "Ces réglages pilotent mes calculs : historique, stock de sécurité, seuil de surstock.",
  }),
};

const CLE = "reassort.assistant.ouvert";

function lireOuvert() {
  try {
    return localStorage.getItem(CLE) !== "non";
  } catch {
    return true;
  }
}

/**
 * L'assistant de réassort, toujours là en bas de la barre latérale : il ne cache jamais l'écran, se replie d'un clic
 * et signale par une pastille qu'il a quelque chose de neuf quand on change d'écran.
 */
export function Assistant() {
  const ecran = useEcran();
  const { state, setOpen, isMobile } = useSidebar();
  const tableau = useQuery({
    queryKey: ["tableau-de-bord"],
    queryFn: api.tableauDeBord,
  });
  const [ouvert, setOuvert] = useState(lireOuvert);
  const [nouveau, setNouveau] = useState(false);
  const conseil = tableau.data ? CONSEILS[ecran](tableau.data) : null;

  // Replié, l'assistant signale d'une pastille qu'il a un conseil pour le nouvel écran.
  useEffect(() => setNouveau(true), [ecran]);

  const basculer = (valeur: boolean) => {
    setOuvert(valeur);
    setNouveau(false);
    try {
      localStorage.setItem(CLE, valeur ? "oui" : "non");
    } catch {
      // Sans stockage local, l'état revient ouvert au prochain chargement : sans gravité.
    }
  };

  // Barre réduite aux icônes : un seul bouton, qui rouvre la barre sur l'assistant.
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarGroup className="mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={conseil?.message ?? "Assistant de réassort"}
              onClick={() => {
                setOpen(true);
                basculer(true);
              }}
              className="relative text-primary"
            >
              <SparklesIcon />
              <span>Assistant</span>
              {nouveau && <Pastille className="absolute top-1 right-1" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="mt-auto">
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-[0_1px_3px_oklch(0.3_0.06_262/0.08)]">
        <button
          type="button"
          onClick={() => basculer(!ouvert)}
          aria-expanded={ouvert}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
        >
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate text-[13px] font-semibold text-titre">
            Assistant de réassort
          </span>
          {!ouvert && nouveau && <Pastille />}
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !ouvert && "-rotate-180",
            )}
          />
        </button>
        {ouvert && (
          <div key={ecran} className="page-enter flex flex-col gap-2 px-3 pb-3">
            <Illustration nom="assistant-reassort" className="mx-auto w-36" />
            <p className="text-[13px] leading-snug">
              {conseil?.message ?? "…"}
            </p>
            {conseil?.action && (
              <Button
                size="xs"
                className="w-fit"
                onClick={conseil.action.faire}
              >
                {conseil.action.libelle}
              </Button>
            )}
          </div>
        )}
      </div>
    </SidebarGroup>
  );
}

function Pastille({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative flex size-2", className)}
      aria-label="Nouveau conseil"
    >
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}
