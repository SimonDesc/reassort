import { createCn } from "cn/config"

/**
 * Fusion des classes (clsx + tailwind-merge). Un rôle de texte (`texte-*`, index.css) remplace la taille, la graisse,
 * l'interligne, la police et la couleur posées avant lui, par exemple celles d'un composant (Label, Button) : le rôle
 * de l'écran l'emporte. Une couleur de sens (text-destructive…) se pose après le rôle.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "texte-role": ["texte-titre", "texte-section", "texte-intitule", "texte-valeur", "texte-donnee", "texte-discret", "texte-meta"],
    },
    conflictingClassGroups: {
      "texte-role": ["font-size", "font-weight", "text-color", "leading", "font-family", "tracking"],
    },
  },
})
