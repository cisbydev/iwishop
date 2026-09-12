import { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import illustrationBoutique from '../assets/iwishop-store-transparent-final.webp';
import {
  AlertTriangle,
  Award,
  CalendarDays,
  CircleDollarSign,
  PackageSearch,
  Plus,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

function KpiCard({ icon: Icon, label, value, detail, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-950">{value}</p>
          {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
        </div>
        <div className={`shrink-0 rounded-xl p-3 ring-1 ${tones[tone]}`} aria-hidden="true">
          <Icon className="h-5 w-5 stroke-[2.25]" />
        </div>
      </div>
    </article>
  );
}

export default function Dashboard({ onNouvelleVente }) {
  const { parametres, utilisateur } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const nomUtilisateur = utilisateur?.username || 'Admin';
  const dateDuJour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  useEffect(() => {
    const loadKpis = async () => {
      await Promise.resolve();
      setLoading(true);
      setError('');
      try {
        const response = await api.get('dashboard/kpis/');
        setKpis(response.data);
      } catch {
        setError('Erreur lors du chargement des indicateurs.');
      } finally {
        setLoading(false);
      }
    };

    void loadKpis();
  }, [modeSupport, boutiqueId]);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">Chargement du tableau de bord...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.9fr)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.95fr)_auto]">
          <div>
            <p className="text-sm font-semibold text-blue-700">Tableau de bord</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Bonjour, {nomUtilisateur} <span aria-hidden="true">👋</span></h2>
            <p className="mt-2 text-sm text-slate-600">Voici un aperçu de l’activité de votre boutique.</p>
          </div>
          <div className="hidden min-w-0 items-center justify-center md:flex" aria-hidden="true">
            <img
              src={illustrationBoutique}
              alt=""
              className="h-auto w-full max-h-28 object-contain lg:max-h-36 xl:max-h-44"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:flex-col md:items-end lg:flex-row lg:justify-self-end">
            <p className="flex items-center gap-2 text-sm capitalize text-slate-600">
              <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {dateDuJour}
            </p>
            <button
              type="button"
              onClick={() => onNouvelleVente?.()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto"
              aria-label="Créer une nouvelle vente"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle vente
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={CircleDollarSign}
          label="Chiffre d'affaires du jour"
          value={formatCurrency(kpis?.chiffre_affaires_jour, devise)}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventes aujourd'hui"
          value={kpis?.nombre_ventes_jour ?? 0}
          tone="blue"
        />
        <KpiCard
          icon={TrendingUp}
          label="Bénéfice du jour"
          value={formatCurrency(kpis?.benefice_jour, devise)}
          tone="green"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Ruptures de stock"
          value={kpis?.produits_rupture_count ?? 0}
          detail={`${kpis?.produits_stock_faible_count ?? 0} produit(s) à stock faible`}
          tone="orange"
        />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Aperçu du mois</h3>
              <p className="mt-1 max-w-xl text-sm text-slate-500">Les tendances détaillées seront disponibles lorsque davantage de données temporelles seront exploitées.</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700" aria-hidden="true">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700" aria-hidden="true">
                  <Wallet className="h-4 w-4" />
                </span>
                <p className="text-sm text-slate-600">CA du mois</p>
              </div>
              <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(kpis?.chiffre_affaires_mois, devise)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50/70 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <p className="text-sm text-emerald-800">Bénéfice du mois</p>
              </div>
              <p className="mt-2 text-xl font-bold text-emerald-800">{formatCurrency(kpis?.benefice_mois, devise)}</p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Award className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Meilleurs produits
          </h3>
          {kpis?.meilleurs_produits?.length > 0 ? (
            <ol className="mt-4 divide-y divide-slate-100">
              {kpis.meilleurs_produits.map((produit, index) => (
                <li key={produit.produit_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {index + 1}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{produit.nom}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-800">{produit.unites_vendues} unités</p>
                    <p className="text-xs text-slate-500">{formatCurrency(produit.chiffre_affaires, devise)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Aucune vente finalisée pour le moment. Les meilleurs produits apparaîtront après les premières ventes.</p>
          )}
        </article>
      </section>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-slate-900">Derniers mouvements de stock</h3>
        </div>
        {kpis?.derniers_mouvements?.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[620px] w-full divide-y divide-slate-200">
              <caption className="sr-only">Les derniers mouvements de stock enregistrés</caption>
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Produit</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Type</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Qté</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpis.derniers_mouvements.map((mouvement) => (
                  <tr key={mouvement.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{mouvement.produit}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${mouvement.type === 'ENTREE' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                        {mouvement.type === 'ENTREE' ? 'Entrée' : 'Sortie'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{mouvement.quantite}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{formatDateTime(mouvement.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Aucun mouvement récent. Les entrées, sorties et ajustements de stock apparaîtront ici.</p>
        )}
      </article>
    </div>
  );
}
