import { useEffect, useState } from 'react';
import { getAll } from '../services/api';
import { ShieldCheck, Clock } from 'lucide-react';

export default function AccesSupportHistorique() {
  const [acces, setAcces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAcces = async () => {
      try {
        const acces = await getAll('tenants/mes-acces-support/');
        setAcces(acces);
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Historique des accès support</h3>
        <p className="mt-1 text-sm text-slate-500">Consultez les accès effectués dans le cadre du support technique.</p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
      <div className="flex gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
        <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Par transparence, chaque consultation de vos données par l'administrateur
          de la plateforme (à des fins de support technique) est enregistrée ici.
        </p>
      </div>

      {acces.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
          <ShieldCheck className="h-7 w-7 text-blue-400" aria-hidden="true" />
          <p className="text-gray-500 text-sm">Aucun accès enregistré pour le moment.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[520px] divide-y divide-slate-200">
            <thead className="bg-blue-100/70 text-blue-950">
              <tr>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Administrateur</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Date et heure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {acces.map((a) => (
                <tr key={a.id} className="bg-white">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">{a.admin_username}</td>
                  <td className="flex items-center gap-2 whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {new Date(a.date_acces).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </section>
  );
}
