import { useState } from 'react';
import { FileDown, FileText, Share2 } from 'lucide-react';
import api from '../services/api';
import { messageErreur } from '../services/errorUtils';
import { telechargerBlob } from '../utils/telechargerBlob';

const BOUTON =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
// Sur téléphone (sous sm), icône seule : le libellé est masqué, le nom du
// bouton reste dans aria-label (lecteurs d'écran) et title (survol).
const TEXTE_BOUTON = 'hidden sm:inline';

// Facture d'une vente : la créer, puis la télécharger. N'affiche que ce que
// renvoie l'API (numéro, est_annulee), aucun montant.
// - `vente.facture` absent (backend pas encore déployé, Render et Vercel se
//   déploient de façon décalée) : rien n'est affiché.
// - null : bouton « Créer la facture », sauf sur une vente annulée, et
//   désactivé en Vue Support (lecture seule, refusé par l'API).
// - présent : numéro, badge « Annulée » le cas échéant, « Télécharger »
//   (permis en Vue Support : c'est une lecture).
//
// « Partager » : avec le fichier PDF via le partage du téléphone (WhatsApp y
// figure), quand le navigateur sait partager un fichier. Sinon (ordinateur,
// navigateur ancien, ou partage refusé parce que l'attente du PDF a fait
// expirer le geste de l'utilisateur, cas de Safari) : le PDF est téléchargé
// et un lien ouvre WhatsApp avec le numéro de la facture. Un lien plutôt
// qu'un window.open : cliqué par l'utilisateur, il n'est jamais bloqué. Pas
// de numéro de client prérempli : les téléphones sont enregistrés sans
// indicatif pays, que wa.me exige.
export default function FactureActions({ vente, modeSupport, onFactureEmise }) {
  const [enCours, setEnCours] = useState(null); // null | 'creation' | 'telechargement' | 'partage'
  const [erreur, setErreur] = useState('');
  const [lienWhatsApp, setLienWhatsApp] = useState('');
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

  const nomFichier = facture ? `facture-${facture.numero}.pdf` : '';

  // Réponse d'erreur en blob (responseType de toute la requête) : pas de
  // JSON lisible, on distingue seulement sur le statut HTTP.
  const messageEchecPdf = (err) => (
    err.response?.status === 404
      ? 'Facture introuvable.'
      : 'Impossible de télécharger la facture. Vérifiez votre connexion puis réessayez.'
  );

  const recupererPdf = async () => {
    const response = await api.get(`ventes/factures/${facture.id}/pdf/`, { responseType: 'blob' });
    return response.data;
  };

  const telecharger = async () => {
    if (enCours) return;
    setEnCours('telechargement');
    setErreur('');
    setLienWhatsApp('');
    try {
      telechargerBlob(await recupererPdf(), nomFichier);
    } catch (err) {
      setErreur(messageEchecPdf(err));
    } finally {
      setEnCours(null);
    }
  };

  const partager = async () => {
    if (enCours) return;
    setEnCours('partage');
    setErreur('');
    setLienWhatsApp('');
    let pdf;
    try {
      pdf = await recupererPdf();
    } catch (err) {
      setErreur(messageEchecPdf(err));
      setEnCours(null);
      return;
    }
    const titre = `Facture ${facture.numero}`;
    const fichier = new File([pdf], nomFichier, { type: 'application/pdf' });
    try {
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: titre, text: titre });
        return;
      }
    } catch (err) {
      // Partage fermé par l'utilisateur : rien à signaler.
      if (err?.name === 'AbortError') return;
      // Autre refus (geste expiré...) : repli ci-dessous.
    } finally {
      setEnCours(null);
    }
    telechargerBlob(pdf, nomFichier);
    setLienWhatsApp(`https://wa.me/?text=${encodeURIComponent(titre)}`);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {facture === null ? (
        <button
          type="button"
          onClick={creer}
          disabled={modeSupport || enCours !== null}
          title={modeSupport ? 'Action désactivée en Vue Support (lecture seule)' : 'Créer la facture'}
          aria-label={enCours === 'creation' ? 'Création de la facture en cours' : 'Créer la facture'}
          className={`${BOUTON} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
        >
          <FileText className="h-4 w-4" />
          <span className={TEXTE_BOUTON}>{enCours === 'creation' ? 'Création...' : 'Créer la facture'}</span>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs font-semibold text-slate-700">{facture.numero}</span>
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
            title={`Télécharger la facture ${facture.numero}`}
            className={`${BOUTON} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <FileDown className="h-4 w-4" />
            <span className={TEXTE_BOUTON}>{enCours === 'telechargement' ? 'Téléchargement...' : 'Télécharger'}</span>
          </button>
          <button
            type="button"
            onClick={partager}
            disabled={enCours !== null}
            aria-label={`Partager la facture ${facture.numero}`}
            title={`Partager la facture ${facture.numero}`}
            className={`${BOUTON} border-green-200 bg-green-50 text-green-800 hover:bg-green-100`}
          >
            <Share2 className="h-4 w-4" />
            <span className={TEXTE_BOUTON}>{enCours === 'partage' ? 'Préparation...' : 'Partager'}</span>
          </button>
        </div>
      )}
      {lienWhatsApp && (
        <p className="max-w-xs whitespace-normal text-right text-xs text-slate-600">
          PDF téléchargé : joignez-le dans{' '}
          <a href={lienWhatsApp} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-800 underline">
            WhatsApp
          </a>
          .
        </p>
      )}
      {erreur && (
        <p role="alert" className="max-w-xs whitespace-normal text-right text-xs text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
