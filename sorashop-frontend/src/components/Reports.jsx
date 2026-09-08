import { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { formatCurrency, formatDate } from '../utils/formatters';
import { DollarSign, ShoppingBag, Wallet, TrendingUp, TrendingDown, Printer } from 'lucide-react';

function formatDateForInput(d) {
  return d.toISOString().split('T')[0];
}

function getPlagePeriode(periode) {
  const aujourdHui = new Date();
  let debut, fin;

  if (periode === 'jour') {
    debut = new Date(aujourdHui);
    fin = new Date(aujourdHui);
  } else if (periode === 'mois') {
    debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1);
    fin = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + 1, 0);
  } else if (periode === 'annee') {
    debut = new Date(aujourdHui.getFullYear(), 0, 1);
    fin = new Date(aujourdHui.getFullYear(), 11, 31);
  }

  return { debut: formatDateForInput(debut), fin: formatDateForInput(fin) };
}

export default function Reports() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [periode, setPeriode] = useState('mois');
  const [dateDebut, setDateDebut] = useState(getPlagePeriode('mois').debut);
  const [dateFin, setDateFin] = useState(getPlagePeriode('mois').fin);
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const fetchResume = async (debut, fin) => {
    setLoading(true);
    setErreurChargement('');
    try {
      const response = await api.get(`reports/resume-financier/?date_debut=${debut}&date_fin=${fin}`);
      setResume(response.data);
    } catch (err) {
      console.error("Erreur chargement rapport", err);
      setErreurChargement("Impossible de charger le rapport. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadResume = async () => {
      await fetchResume(dateDebut, dateFin);
    };

    void loadResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeSupport, boutiqueId]);

  const handlePeriodeRapide = (nouvellePeriode) => {
    setPeriode(nouvellePeriode);
    const { debut, fin } = getPlagePeriode(nouvellePeriode);
    setDateDebut(debut);
    setDateFin(fin);
    fetchResume(debut, fin);
  };

  const handlePeriodePersonnalisee = () => {
    setPeriode('personnalise');
    fetchResume(dateDebut, dateFin);
  };

  const boutonClasse = (p) =>
    `inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
      periode === p ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <div className="space-y-6 min-[1366px]:-mx-3">
      <section className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm print:hidden sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Rapports</h2>
          <p className="mt-2 text-sm text-slate-600">Analysez les performances de votre boutique sur la période de votre choix.</p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 sm:w-auto"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </section>

      {/* Sélecteur de période */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <button className={boutonClasse('jour')} onClick={() => handlePeriodeRapide('jour')}>Aujourd'hui</button>
            <button className={boutonClasse('mois')} onClick={() => handlePeriodeRapide('mois')}>Ce mois</button>
            <button className={boutonClasse('annee')} onClick={() => handlePeriodeRapide('annee')}>Cette année</button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rapport-date-debut" className="mb-1 block text-sm font-medium text-slate-700">Date de début</label>
              <input
                id="rapport-date-debut"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="rapport-date-fin" className="mb-1 block text-sm font-medium text-slate-700">Date de fin</label>
              <input
                id="rapport-date-fin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <button
            onClick={handlePeriodePersonnalisee}
            className={`w-full sm:w-auto ${boutonClasse('personnalise')}`}
          >
            Appliquer
          </button>
          </div>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
          Période affichée : <span className="font-medium text-slate-700">{formatDate(dateDebut)}</span> au{' '}
          <span className="font-medium text-slate-700">{formatDate(dateFin)}</span>
        </p>
      </section>

      {loading ? (
        <div className="p-6 text-center text-gray-600">Chargement du rapport...</div>
      ) : erreurChargement ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={() => fetchResume(dateDebut, dateFin)} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Chiffre d'Affaires</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(resume?.chiffre_affaires, devise)}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_ventes} vente(s)</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Achats</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(resume?.total_achats, devise)}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_achats} achat(s)</p>
              </div>
              <div className="p-3 bg-orange-50 text-orange-600 rounded-full">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Dépenses</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(resume?.total_depenses, devise)}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_depenses} dépense(s)</p>
              </div>
              <div className="p-3 bg-red-50 text-red-600 rounded-full">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Bénéfices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Bénéfice Brut</p>
                <p className="text-xs text-gray-400">Ventes − Coût des produits vendus</p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(resume?.benefice_brut, devise)}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Bénéfice Net</p>
                <p className="text-xs text-gray-400">Bénéfice brut − Dépenses</p>
                <h3 className={`text-2xl font-bold mt-1 ${resume?.benefice_net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(resume?.benefice_net, devise)}
                </h3>
              </div>
              <div className={`p-3 rounded-full ${resume?.benefice_net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {resume?.benefice_net >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
