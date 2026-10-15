import { useState } from 'react';
import { FileDown, FileText } from 'lucide-react';
import api from '../services/api';
import { messageErreur } from '../services/errorUtils';
import { telechargerBlob } from '../utils/telechargerBlob';

const BOUTON =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

// Facture d'une vente : la créer, puis la télécharger. N'affiche que ce que
// renvoie l'API (numéro, est_annulee), aucun montant.
// - `vente.facture` absent (backend pas encore déployé, Render et Vercel se
//   déploient de façon décalée) : rien n'est affiché.
// - null : bouton « Créer la facture », sauf sur une vente annulée, et
//   désactivé en Vue Support (lecture seule, refusé par l'API).
// - présent : numéro, badge « Annulée » le cas échéant, « Télécharger »
//   (permis en Vue Support : c'est une lecture).
export default function FactureActions({ vente, modeSupport, onFactureEmise }) {
  const [enCours, setEnCours] = useState(null); // null | 'creation' | 'telechargement'
  const [erreur, setErreur] = useState('');
  const facture = vente.facture;

  if (facture === undefined) return null;
  if (facture === null && vente.statut === 'ANNULEE') return null;

  const creer = async () => {
    if (enCours) return;
    setEnCours('creation');
    setErreur('');
    try {
      const response = await api.post(`ventes/${vente.id}/facture/`);
      onFactureEmise(vente.id, response.data);
    } catch (err) {
      setErreur(messageErreur(err, 'Impossible de créer la facture. Réessayez.'));
    } finally {
      setEnCours(null);
    }
  };

  const telecharger = async () => {
    if (enCours) return;
    setEnCours('telechargement');
    setErreur('');
    try {
      const response = await api.get(`ventes/factures/${facture.id}/pdf/`, { responseType: 'blob' });
      telechargerBlob(response.data, `facture-${facture.numero}.pdf`);
    } catch (err) {
      // Réponse d'erreur en blob (responseType de toute la requête) : pas de
      // JSON lisible, on distingue seulement sur le statut HTTP.
      setErreur(
        err.response?.status === 404
          ? 'Facture introuvable.'
          : 'Impossible de télécharger la facture. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {facture === null ? (
        <button
          type="button"
          onClick={creer}
          disabled={modeSupport || enCours !== null}
          title={modeSupport ? 'Action désactivée en Vue Support (lecture seule)' : undefined}
          className={`${BOUTON} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
        >
          <FileText className="h-4 w-4" />
          {enCours === 'creation' ? 'Création...' : 'Créer la facture'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{facture.numero}</span>
          {facture.est_annulee && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Annulée
            </span>
          )}
          <button
            type="button"
            onClick={telecharger}
            disabled={enCours !== null}
            aria-label={`Télécharger la facture ${facture.numero}`}
            className={`${BOUTON} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <FileDown className="h-4 w-4" />
            {enCours === 'telechargement' ? 'Téléchargement...' : 'Télécharger'}
          </button>
        </div>
      )}
      {erreur && (
        <p role="alert" className="max-w-xs whitespace-normal text-right text-xs text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
