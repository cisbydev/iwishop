import { useBoutiqueActive } from '../context/boutiqueActiveContextValue';

// N'affiche rien pour la grande majorité des utilisateurs (une seule
// boutique) - le multi-boutique ne doit rien changer visuellement pour eux.
export default function BoutiqueSelecteur() {
  const { boutiques, boutiqueActiveId, changerBoutique } = useBoutiqueActive();

  if (boutiques.length <= 1) {
    return null;
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
