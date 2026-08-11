import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, Award } from 'lucide-react';

export default function Dashboard() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('dashboard/kpis/')
      .then(response => {
        setKpis(response.data);
        setLoading(false);
      })
      .catch(err => {
        setError('Erreur lors du chargement des indicateurs.');
        setLoading(false);
      });
  }, [modeSupport, boutiqueId]);

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement du tableau de bord...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Tableau de Bord & Vue d'ensemble</h2>

      {/* Grille des KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">CA du Jour</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{kpis?.chiffre_affaires_jour} {devise}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">CA du Mois</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{kpis?.chiffre_affaires_mois} {devise}</h3>
          </div>
          <div className="p-3 bg-green-50 text-green-600 rounded-full">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Ventes aujourd'hui</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{kpis?.nombre_ventes_jour}</h3>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-full">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Ruptures de stock</p>
            <h3 className="text-2xl font-bold text-red-600 mt-1">{kpis?.produits_rupture_count}</h3>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-full">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Bénéfices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Bénéfice du Jour</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{kpis?.benefice_jour} {devise}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Bénéfice du Mois</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{kpis?.benefice_mois} {devise}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meilleurs produits */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" /> Meilleurs Produits
          </h3>
          {kpis?.meilleurs_produits && kpis.meilleurs_produits.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {kpis.meilleurs_produits.map((p, idx) => (
                <li key={p.produit_id} className="py-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{p.nom}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{p.unites_vendues} unités</p>
                    <p className="text-xs text-gray-500">{p.chiffre_affaires} {devise}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Aucune vente enregistrée pour le moment.</p>
          )}
        </div>

        {/* Derniers mouvements de stock */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Derniers Mouvements de Stock</h3>
          {kpis?.derniers_mouvements && kpis.derniers_mouvements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qté</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {kpis.derniers_mouvements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{m.produit}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${m.type === 'ENTREE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{m.quantite}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(m.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucun mouvement récent enregistré.</p>
          )}
        </div>
      </div>
    </div>
  );
}
