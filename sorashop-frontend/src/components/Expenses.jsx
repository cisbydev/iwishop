import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Ban, Plus, Receipt, Wallet } from 'lucide-react';

const CATEGORIES = [
  { value: 'LOYER', label: 'Loyer' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'SALAIRE', label: 'Salaire' },
  { value: 'ELECTRICITE', label: 'Électricité' },
  { value: 'INTERNET', label: 'Internet' },
  { value: 'AUTRE', label: 'Autre' },
];

const CATEGORIES_STYLES = {
  LOYER: 'bg-purple-100 text-purple-800',
  TRANSPORT: 'bg-blue-100 text-blue-800',
  SALAIRE: 'bg-green-100 text-green-800',
  ELECTRICITE: 'bg-yellow-100 text-yellow-800',
  INTERNET: 'bg-cyan-100 text-cyan-800',
  AUTRE: 'bg-gray-100 text-gray-800',
};

const FORM_VIDE = {
  titre: '',
  categorie: 'AUTRE',
  montant: '',
  date_depense: new Date().toISOString().split('T')[0],
  description: '',
};

export default function Expenses() {
  const { parametres, utilisateur } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const estProprietaire = utilisateur?.est_proprietaire;
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [annulationEnCours, setAnnulationEnCours] = useState(null);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchDepenses = async (categorie = '') => {
    try {
      const params = categorie ? `?categorie=${categorie}` : '';
      const depenses = await getAll(`depenses/${params}`);
      setDepenses(depenses);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement dépenses", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadDepenses = async () => {
      await fetchDepenses();
    };

    void loadDepenses();
  }, [modeSupport, boutiqueId]);

  const handleFiltreChange = (categorie) => {
    setFiltreCategorie(categorie);
    fetchDepenses(categorie);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await api.post('depenses/', form);
      setShowModal(false);
      setForm(FORM_VIDE);
      fetchDepenses(filtreCategorie);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement de la dépense."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnnuler = async (depense) => {
    if (annulationEnCours === depense.id) return;
    if (!window.confirm(`Annuler cette dépense "${depense.titre}" (${formatCurrency(depense.montant, devise)}) ?`)) {
      return;
    }
    setAnnulationEnCours(depense.id);
    try {
      await api.post(`depenses/${depense.id}/annuler/`);
      fetchDepenses(filtreCategorie);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'annulation de la dépense."));
    } finally {
      setAnnulationEnCours(null);
    }
  };

  // Une dépense annulée reste visible (historique conservé, cf.
  // DepenseViewSet.annuler) mais ne doit plus compter dans le total affiché.
  const totalAffiche = depenses
    .filter((d) => d.statut !== 'ANNULEE')
    .reduce((acc, d) => acc + parseFloat(d.montant), 0);

  const labelCategorie = (val) => CATEGORIES.find(c => c.value === val)?.label || val;

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des dépenses...</div>;

  return (
    <div className="space-y-6 min-[1366px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dépenses</h2>
            <p className="mt-2 text-sm text-slate-600">Suivez et maîtrisez les dépenses de votre boutique.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={modeSupport}
            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto ${
              modeSupport ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <Plus className="h-5 w-5" /> Ajouter une dépense
          </button>
        </div>
      </section>

      {/* Total + filtre */}
      <section className="flex flex-col items-stretch justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">
              Total {filtreCategorie ? `(${labelCategorie(filtreCategorie)})` : ''}
            </p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(totalAffiche, devise)}</h3>
          </div>
        </div>

        <select
          value={filtreCategorie}
          onChange={(e) => handleFiltreChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </section>

      {/* Liste des dépenses */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
        {depenses.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-gray-800">Aucune dépense enregistrée.</p>
            <p className="mt-1 text-sm text-gray-500">Les dépenses enregistrées apparaîtront ici.</p>
            {!modeSupport && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <Plus className="w-5 h-5" /> Ajouter une dépense
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full divide-y divide-gray-200">
            <thead className="border-b border-blue-200 bg-blue-100/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Titre</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Catégorie</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Montant</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Description</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {depenses.map((d) => (
                <tr key={d.id} className={d.statut === 'ANNULEE' ? 'bg-slate-50/70 opacity-75' : ''}>
                  <td className="flex items-center gap-2 whitespace-nowrap px-6 py-5 text-sm font-semibold text-slate-900">
                    <Receipt className="h-4 w-4 text-slate-400" /> {d.titre}
                  </td>
                  <td className="whitespace-nowrap px-6 py-5 text-sm">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORIES_STYLES[d.categorie]}`}>
                      {labelCategorie(d.categorie)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-5 text-sm font-semibold text-slate-800">{formatCurrency(d.montant, devise)}</td>
                  <td className="whitespace-nowrap px-6 py-5 text-sm text-slate-600">
                    {formatDate(d.date_depense)}
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">{d.description || '—'}</td>
                  <td className="whitespace-nowrap px-6 py-5 text-right text-sm">
                    {d.statut === 'ANNULEE' ? (
                      <span className="text-xs font-medium italic text-slate-500">Annulée</span>
                    ) : estProprietaire ? (
                      <button
                        onClick={() => handleAnnuler(d)}
                        disabled={modeSupport || annulationEnCours === d.id}
                        title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Annuler la dépense"}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${modeSupport || annulationEnCours === d.id ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                        aria-label={annulationEnCours === d.id ? `Annulation de la dépense ${d.titre} en cours` : `Annuler la dépense ${d.titre}`}
                      >
                        {annulationEnCours === d.id ? 'Annulation...' : <Ban className="w-4 h-4" />}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal d'ajout de dépense */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[30rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="mb-5 text-xl font-semibold text-slate-900">Ajouter une nouvelle dépense</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Titre</label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={(e) => updateForm('titre', e.target.value)}
                  placeholder="Ex: Loyer boutique - Août"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Catégorie</label>
                <select
                  value={form.categorie}
                  onChange={(e) => updateForm('categorie', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Montant</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.montant}
                    onChange={(e) => updateForm('montant', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={form.date_depense}
                    onChange={(e) => updateForm('date_depense', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description (optionnel)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  rows="3"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(FORM_VIDE); }}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
