import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { History, FileText, Calendar } from 'lucide-react';

export default function SalesHistory() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const [ventes, setVentes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchVentes = async () => {
    try {
      const response = await api.get('ventes/');
      setVentes(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur lors du chargement de l'historique des ventes", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVentes();
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement de l'historique...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <History className="w-6 h-6 text-blue-600" /> Historique des Ventes
        </h2>
      </div>

      {ventes.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucune vente enregistrée pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Vente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Heure</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Articles / Détails</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remise</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant Net</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ventes.map((vente) => (
                <tr key={vente.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                    #{vente.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {new Date(vente.date_vente).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <ul className="space-y-1">
                      {vente.lignes && vente.lignes.map((ligne, idx) => (
                        <li key={idx} className="text-xs bg-gray-50 p-1.5 rounded border border-gray-100">
                          <span className="font-medium text-gray-800">{ligne.produit_nom || `Produit #${ligne.produit}`}</span> 
                          {' '}- {ligne.quantite} ({ligne.type_vente}) x {ligne.prix_applique} {devise}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {vente.remise} {devise}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    {vente.montant_net} {devise}
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
