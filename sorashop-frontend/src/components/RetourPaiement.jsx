import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function RetourPaiement() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let annule = false;

    const verifier = () => {
      api.get('tenants/mon-abonnement/')
        .then((res) => {
          if (!annule) setInfo(res.data);
        })
        .catch(() => {});
    };

    verifier();
    const intervalle = setInterval(verifier, 5000);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, []);

  const confirme = info?.a_abonnement && info.abonnement_valide;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center space-y-4">
        {confirme ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-800">Abonnement confirmé</h2>
            <p className="text-gray-600 text-sm">
              Actif jusqu'au {info.date_fin?.split('-').reverse().join('/')}. Tu peux retourner à l'application.
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
