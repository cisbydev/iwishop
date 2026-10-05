import { useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import MonAbonnement from './MonAbonnement';
import { useSettings } from '../context/settingsContextValue';
import { EVENEMENT_ABONNEMENT_EXPIRE } from '../services/errorUtils';

const MESSAGE_PROPRIETAIRE = "Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée.";
const MESSAGE_EMPLOYE = 'Abonnement expiré : prévenez le propriétaire de la boutique.';

// Monté une seule fois dans App.jsx, invisible tant qu'aucun écran n'a reçu
// le refus ABONNEMENT_EXPIRE (signalé par alerterErreur, errorUtils.js).
// Un seul message, quel que soit le nombre de refus reçus.
// Couche 50, rendu après le contenu : il passe devant une fenêtre ouverte.
// « Renouveler » ouvre Mon Abonnement dans une fenêtre par-dessus l'écran,
// qui reste monté : panier et formulaires sont conservés.
export default function RefusAbonnementExpire() {
  const { utilisateur } = useSettings();
  const [visible, setVisible] = useState(false);
  const [abonnementOuvert, setAbonnementOuvert] = useState(false);

  useEffect(() => {
    const afficher = () => setVisible(true);
    window.addEventListener(EVENEMENT_ABONNEMENT_EXPIRE, afficher);
    return () => window.removeEventListener(EVENEMENT_ABONNEMENT_EXPIRE, afficher);
  }, []);

  if (!visible) return null;

  // Propriétaire inconnu (utilisateur pas encore chargé) : le texte du
  // propriétaire, sans bouton ni texte destiné aux employés.
  const estProprietaire = utilisateur?.est_proprietaire;
  const texte = estProprietaire === false ? MESSAGE_EMPLOYE : MESSAGE_PROPRIETAIRE;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3 print:hidden">
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{texte}</p>
            {estProprietaire === true && (
              <button
                type="button"
                onClick={() => setAbonnementOuvert(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" /> Renouveler
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Fermer le message"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-700 transition hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {abonnementOuvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mon abonnement"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px] print:hidden"
        >
          <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setAbonnementOuvert(false)}
              aria-label="Fermer"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <MonAbonnement />
          </div>
        </div>
      )}
    </>
  );
}
