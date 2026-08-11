import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Receipt, Trash2, Wallet } from 'lucide-react';

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
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [filtreCategorie, setFiltreCategorie] = useState('');

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchDepenses = async (categorie = '') => {
    try {
      const params = categorie ? `?categorie=${categorie}` : '';
      const response = await api.get(`depenses/${params}`);
      setDepenses(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement dépenses", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepenses();
  }, [modeSupport, boutiqueId]);

  const handleFiltreChange = (categorie) => {
    setFiltreCategorie(categorie);
    fetchDepenses(categorie);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('depenses/', form);
      setShowModal(false);
      setForm(FORM_VIDE);
      fetchDepenses(filtreCategorie);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement de la dépense."));
    }
  };

  const handleDelete = async (depense) => {
    if (!window.confirm(`Supprimer la dépense "${depense.titre}" (${depense.montant} ${devise}) ?`)) {
      return;
    }
    try {
      await api.delete(`depenses/${depense.id}/`);
      fetchDepenses(filtreCategorie);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la suppression de la dépense."));
    }
  };

  const totalAffiche = depenses.reduce((acc, d) => acc + parseFloat(d.montant), 0);

  const labelCategorie = (val) => CATEGORIES.find(c => c.value === val)?.label || val;

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des dépenses...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Gestion des Dépenses</h2>
        <button
          onClick={() => setShowModal(true)}
          disabled={modeSupport}
          title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
          className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
            modeSupport ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          }`}
        >
          <Plus className="w-5 h-5" /> Ajouter une dépense
        </button>
      </div>

      {/* Total + filtre */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-50 text-red-600 rounded-full">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">
              Total {filtreCategorie ? `(${labelCategorie(filtreCategorie)})` : ''}
            </p>
            <h3 className="text-2xl font-bold text-gray-800">{totalAffiche.toFixed(2)} {devise}</h3>
          </div>
        </div>

        <select
          value={filtreCategorie}
          onChange={(e) => handleFiltreChange(e.target.value)}
          className="p-2 border rounded-md text-sm"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Liste des dépenses */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
        {depenses.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">Aucune dépense enregistrée pour le moment.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Titre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {depenses.map((d) => (
                <tr key={d.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" /> {d.titre}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${CATEGORIES_STYLES[d.categorie]}`}>
                      {labelCategorie(d.categorie)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{d.montant} {devise}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(d.date_depense).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{d.description || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={modeSupport}
                      title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer"}
                      className={modeSupport ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal d'ajout de dépense */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Ajouter une nouvelle dépense</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Titre</label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={(e) => updateForm('titre', e.target.value)}
                  placeholder="Ex: Loyer boutique - Août"
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                  value={form.categorie}
                  onChange={(e) => updateForm('categorie', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Montant</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.montant}
                    onChange={(e) => updateForm('montant', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={form.date_depense}
                    onChange={(e) => updateForm('date_depense', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description (optionnel)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  rows="3"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(FORM_VIDE); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
