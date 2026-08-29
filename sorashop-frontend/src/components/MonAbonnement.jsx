import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import api from '../services/api';

function StatutAbonnement({ info }) {
  if (!info) return null;

  if (!info.a_abonnement) {
    return (
      <div className="flex items-center gap-2 p-4 bg-gray-100 text-gray-700 rounded-lg">
        <XCircle className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium">Aucun abonnement</span>
      </div>
    );
  }

  if (info.statut === 'EXPIRE' || !info.abonnement_valide) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-100 text-red-800 rounded-lg">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium">Expiré</span>
      </div>
    );
  }

  const [annee, mois, jour] = info.date_fin.split('-');
  return (
    <div className="flex items-center gap-2 p-4 bg-green-100 text-green-800 rounded-lg">
      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
      <span className="font-medium">Actif jusqu'au {jour}/{mois}/{annee}</span>
    </div>
  );
}

export default function MonAbonnement() {
  const [info, setInfo] = useState(null);
  const [formules, setFormules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('tenants/mon-abonnement/'),
      api.get('tenants/formules-abonnement/'),
    ])
      .then(([infoRes, formulesRes]) => {
        setInfo(infoRes.data);
        setFormules(formulesRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const choisirFormule = () => {
    alert('Le paiement en ligne arrive bientôt !');
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <StatutAbonnement info={info} />

      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Formules disponibles</h3>
        {formules.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune formule disponible pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {formules.map((formule) => (
              <div
                key={formule.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm border border-gray-100"
              >
                <div>
                  <p className="font-medium text-gray-800">{formule.nom}</p>
                  <p className="text-sm text-gray-500">
                    {formule.duree_jours} jours &middot; {formule.prix} FCFA
                  </p>
                </div>
                <button
                  onClick={choisirFormule}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  <CreditCard className="w-4 h-4" /> Choisir cette formule
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
