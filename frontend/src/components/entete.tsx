import type { ReactNode } from 'react'

/** En-tête commun d'un écran : titre, phrase de contexte, action à droite. */
export function EnteteEcran({ titre, sousTitre, actions }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="texte-titre">{titre}</h1>
        {sousTitre && <p className="texte-discret">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}
