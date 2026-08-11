import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { ShieldCheck, Clock } from 'lucide-react';

export default function AccesSupportHistorique() {
  const [acces, setAcces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAcces = async () => {
      try {
        const response = await api.get('tenants/mes-acces-support/');
        setAcces(response.data);
      } catch (err) {
        console.error("Erreur chargement historique des accès support", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAcces();
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Par transparence, chaque consultation de vos données par l'administrateur
          de la plateforme (à des fins de support technique) est enregistrée ici.
        </p>
      </div>

      {acces.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucun accès enregistré pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Administrateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date et heure</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {acces.map((a) => (
                <tr key={a.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{a.admin_username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {new Date(a.date_acces).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
