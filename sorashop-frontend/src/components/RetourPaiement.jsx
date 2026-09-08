import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../services/api';

const PAIEMENT_ABONNEMENT_STORAGE_KEY = 'iwishop_paiement_abonnement_id';
const INTERVALLE_VERIFICATION_MS = 5000;
const NOMBRE_MAX_VERIFICATIONS = 12;

function obtenirPaiementId() {
  const paiementIdDansUrl = new URLSearchParams(window.location.search).get('paiement_id');
  const paiementIdEnregistre = sessionStorage.getItem(PAIEMENT_ABONNEMENT_STORAGE_KEY);
  const paiementId = paiementIdEnregistre || paiementIdDansUrl;

  if (
    !paiementId
    || !/^\d+$/.test(paiementId)
    || (paiementIdDansUrl && paiementIdEnregistre && paiementIdDansUrl !== paiementIdEnregistre)
  ) {
    return null;
  }

  return paiementId;
}

export default function RetourPaiement() {
  const [paiementId] = useState(obtenirPaiementId);
  const [etat, setEtat] = useState(() => (paiementId ? 'chargement' : 'invalide'));

  useEffect(() => {
    let annule = false;
    let timeoutId;
    let nombreVerifications = 0;

    if (!paiementId) return undefined;

    const verifier = () => {
      nombreVerifications += 1;
      api.get(`tenants/paiements-abonnement/${paiementId}/`)
        .then((res) => {
          if (annule) return;

          setEtat(res.data.statut);
          if (res.data.statut === 'CONFIRME' || res.data.statut === 'ECHEC') {
            sessionStorage.removeItem(PAIEMENT_ABONNEMENT_STORAGE_KEY);
            return;
          }

          if (res.data.statut === 'EN_ATTENTE' && nombreVerifications < NOMBRE_MAX_VERIFICATIONS) {
            timeoutId = setTimeout(verifier, INTERVALLE_VERIFICATION_MS);
          } else if (res.data.statut === 'EN_ATTENTE') {
            setEtat('delai_expire');
          }
        })
        .catch(() => {
          if (!annule) setEtat('invalide');
        });
    };

    verifier();
    return () => {
      annule = true;
      clearTimeout(timeoutId);
    };
  }, [paiementId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center space-y-4">
        {etat === 'CONFIRME' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-800">Abonnement confirmé</h2>
            <p className="text-gray-600 text-sm">
              Ton paiement a été confirmé. Tu peux retourner à l'application.
            </p>
          </>
        ) : etat === 'ECHEC' ? (
          <>
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-800">Paiement non confirmé</h2>
            <p className="text-gray-600 text-sm">
              Le paiement n'a pas pu être confirmé. Tu peux réessayer depuis l'application.
            </p>
          </>
        ) : etat === 'invalide' ? (
          <>
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-800">Paiement introuvable</h2>
            <p className="text-gray-600 text-sm">
              Nous ne pouvons pas vérifier ce paiement. Aucun abonnement n'a été confirmé.
            </p>
          </>
        ) : etat === 'delai_expire' ? (
          <>
            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-800">Confirmation toujours en cours</h2>
            <p className="text-gray-600 text-sm">
              Le paiement n'est pas encore confirmé. Réessaie cette page dans quelques instants.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 text-blue-600 mx-auto animate-spin" />
            <h2 className="text-lg font-semibold text-gray-800">Paiement en cours de confirmation</h2>
            <p className="text-gray-600 text-sm">
              Ça peut prendre quelques instants après le paiement. Cette page se met à jour automatiquement.
            </p>
          </>
        )}
        <a href="/" className="inline-block text-sm text-blue-600 hover:underline">
          Retour à l'application
        </a>
      </div>
    </div>
  );
}
