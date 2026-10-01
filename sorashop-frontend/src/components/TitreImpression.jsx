import { formatDate } from '../utils/formatters';

// En-tête visible seulement à l'impression : à l'écran, le titre de la page
// et les onglets (print:hidden) suffisent. Nom de boutique et période doivent
// venir de la réponse API du rapport (boutique_nom, date_debut, date_fin),
// jamais des paramètres chargés au démarrage ni des champs de date en cours
// de saisie : en Vue Support, seule la réponse garantit la bonne boutique.
export default function TitreImpression({ titre, nomBoutique, dateDebut, dateFin }) {
  const details = [
    nomBoutique,
    dateDebut && dateFin ? `Période du ${formatDate(dateDebut)} au ${formatDate(dateFin)}` : null,
  ].filter(Boolean);

  return (
    <div className="hidden border-b border-slate-300 pb-3 print:block">
      <h2 className="text-2xl font-bold text-slate-900">{titre}</h2>
      {details.length > 0 && <p className="mt-1 text-sm text-slate-700">{details.join(' · ')}</p>}
    </div>
  );
}
