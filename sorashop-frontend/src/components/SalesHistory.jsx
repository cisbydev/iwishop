import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { History, Calendar } from 'lucide-react';

export default function SalesHistory() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [ventes, setVentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [failedPage, setFailedPage] = useState(null);
  const [pagination, setPagination] = useState({
    count: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const fetchVentes = useCallback(async (pageDemandee) => {
    setLoading(true);
    setError('');
    setFailedPage(null);
    try {
      const response = await api.get('ventes/', { params: { page: pageDemandee } });
      setVentes(response.data.results);
      setPagination({
        count: response.data.count,
        hasNextPage: Boolean(response.data.next),
        hasPreviousPage: Boolean(response.data.previous),
      });
      setPage(pageDemandee);
    } catch (err) {
      console.error("Erreur lors du chargement de l'historique des ventes", err);
      setError("Impossible de charger l'historique des ventes. Veuillez réessayer.");
      setFailedPage(pageDemandee);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let annule = false;

    const chargerPremierePage = async () => {
      await Promise.resolve();
      if (annule) return;
      await fetchVentes(1);
    };

    void chargerPremierePage();
    return () => {
      annule = true;
    };
  }, [fetchVentes, modeSupport, boutiqueId]);

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement de l'historique...</div>;

  return (
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            <History className="h-6 w-6 text-blue-600" /> Historique des ventes
          </h2>
          <p className="mt-2 text-sm text-slate-600">Consultez les ventes enregistrées et leurs détails.</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
          {pagination.count} vente{pagination.count > 1 ? 's' : ''}
        </span>
      </section>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center justify-between gap-4">
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => fetchVentes(failedPage || page)}
            className="text-sm font-medium underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {ventes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-gray-800">Aucune vente enregistrée.</p>
          <p className="mt-1 text-sm text-gray-500">Les ventes finalisées apparaîtront ici.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] divide-y divide-slate-200">
            <thead className="bg-blue-100/70 text-blue-950">
              <tr>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">ID Vente</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Date & Heure</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Articles / Détails</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Remise</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Montant Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {ventes.map((vente) => (
                <tr key={vente.id} className="bg-white transition-colors even:bg-slate-50 hover:bg-blue-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-blue-600">
                    #{vente.id}
                  </td>
                  <td className="flex items-center gap-1 whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDateTime(vente.date_vente)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    <ul className="space-y-1">
                      {vente.lignes && vente.lignes.map((ligne, idx) => (
                        <li key={idx} className="text-xs leading-5 text-slate-600">
                          <span className="font-medium text-slate-800">{ligne.produit_nom || `Produit #${ligne.produit}`}</span>
                          {' '}- {ligne.quantite} ({ligne.unite_nom || ligne.type_vente}) x {formatCurrency(ligne.prix_applique, devise)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    {formatCurrency(vente.remise, devise)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
                    {formatCurrency(vente.montant_net, devise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-sm font-medium text-slate-600">Page {page}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fetchVentes(page - 1)}
                disabled={loading || !pagination.hasPreviousPage}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => fetchVentes(page + 1)}
                disabled={loading || !pagination.hasNextPage}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
