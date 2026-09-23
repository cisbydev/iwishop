import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useBoutiqueActive } from '../context/boutiqueActiveContextValue';

// N'affiche rien pour la grande majorité des utilisateurs (une seule
// boutique) - le multi-boutique ne doit rien changer visuellement pour eux.
// variante="select" : <select> compact de la barre desktop.
// variante="liste" : ligne dépliable pour le panneau "Plus" (tablette/mobile).
export default function BoutiqueSelecteur({ variante = 'select' }) {
  const { boutiques, boutiqueActiveId, changerBoutique } = useBoutiqueActive();
  const [deplie, setDeplie] = useState(false);

  if (boutiques.length <= 1) {
    return null;
  }

  if (variante === 'liste') {
    const boutiqueActive = boutiques.find((boutique) => boutique.id === boutiqueActiveId);

    return (
      <div className="mb-3 border-b border-slate-100 pb-3">
        <button
          type="button"
          aria-expanded={deplie}
          onClick={() => setDeplie((valeur) => !valeur)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span className="truncate">
            Boutique : <span className="font-semibold">{boutiqueActive?.nom ?? '—'}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition ${deplie ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {deplie && (
          <ul aria-label="Boutique active" className="mt-1 space-y-1">
            {boutiques.map((boutique) => {
              const estActive = boutique.id === boutiqueActiveId;
              return (
                <li key={boutique.id}>
                  <button
                    type="button"
                    aria-current={estActive ? 'true' : undefined}
                    onClick={() => {
                      if (!estActive) changerBoutique(boutique.id);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm ${
                      estActive ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{boutique.nom}</span>
                    {estActive && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <select
      aria-label="Boutique active"
      value={boutiqueActiveId ?? ''}
      onChange={(event) => changerBoutique(Number(event.target.value))}
      className="h-10 max-w-28 truncate rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 min-[1600px]:max-w-36"
    >
      {boutiques.map((boutique) => (
        <option key={boutique.id} value={boutique.id}>
          {boutique.nom}
        </option>
      ))}
    </select>
  );
}
