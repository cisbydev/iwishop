import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Ruler, Lock, Pencil, Trash2 } from 'lucide-react';

const FORM_VIDE = { nom: '', facteur_conversion: '' };

export default function UnitesVente() {
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [unites, setUnites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Unité en cours d'édition (null = mode "ajout")
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchUnites = async () => {
    try {
      const response = await api.get('produits/unites-vente/');
      setUnites(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement unités de vente", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnites();
  }, [modeSupport, boutiqueId]);

  const ouvrirAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowModal(true);
  };

  const ouvrirModification = (unite) => {
    if (unite.est_systeme) return;
    setEditingId(unite.id);
    setForm({ nom: unite.nom, facteur_conversion: unite.facteur_conversion });
    setShowModal(true);
  };

  const fermerModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { nom: form.nom, facteur_conversion: form.facteur_conversion };
    try {
      if (editingId) {
        await api.patch(`produits/unites-vente/${editingId}/`, payload);
      } else {
        await api.post('produits/unites-vente/', payload);
      }
      fermerModal();
      fetchUnites();
    } catch (err) {
      alert(getErrorMessage(err, editingId
        ? "Erreur lors de la modification de l'unité."
        : "Erreur lors de la création de l'unité."));
    }
  };

  const handleDelete = async (unite) => {
    if (unite.est_systeme) return;
    if (!window.confirm(`Supprimer l'unité "${unite.nom}" ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.delete(`produits/unites-vente/${unite.id}/`);
      fetchUnites();
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 400 && data?.nb_produit_prix_lies) {
        const confirmForce = window.confirm(
          `Cette unité est utilisée dans ${data.nb_produit_prix_lies} prix produit. ` +
          `Les supprimer aussi et confirmer la suppression de "${unite.nom}" ?`
        );
        if (!confirmForce) return;
        try {
          await api.delete(`produits/unites-vente/${unite.id}/?force=true`);
          fetchUnites();
        } catch (err2) {
          alert(getErrorMessage(err2, "Erreur lors de la suppression de l'unité."));
        }
        return;
      }
      alert(getErrorMessage(err, "Erreur lors de la suppression de l'unité."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des unités de vente...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">Unités de vente</h2>
        <button
          onClick={ouvrirAjout}
          disabled={modeSupport}
          title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
          className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
            modeSupport ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          }`}
        >
          <Plus className="w-5 h-5" /> Ajouter une unité
        </button>
      </div>

      {unites.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucune unité de vente enregistrée pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facteur de conversion</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {unites.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-gray-400" /> {u.nom}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.facteur_conversion}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {u.est_systeme ? (
                      <span className="flex items-center gap-1 w-fit px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                        <Lock className="w-3 h-3" /> Système
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700">
                        Personnalisée
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => ouvrirModification(u)}
                        disabled={modeSupport || u.est_systeme}
                        title={
                          u.est_systeme
                            ? "Les unités système ne peuvent pas être renommées."
                            : (modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Modifier")
                        }
                        className={(modeSupport || u.est_systeme) ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={modeSupport || u.est_systeme}
                        title={
                          u.est_systeme
                            ? "Les unités système ne peuvent pas être supprimées."
                            : (modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer")
                        }
                        className={(modeSupport || u.est_systeme) ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal d'ajout / modification d'unité */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {editingId ? "Modifier l'unité de vente" : 'Ajouter une nouvelle unité de vente'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom de l'unité</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
                  placeholder="Ex: Kg, Sac 25kg, Carton..."
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Facteur de conversion</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.facteur_conversion}
                  onChange={(e) => updateForm('facteur_conversion', e.target.value)}
                  placeholder="Ex: 25 pour un sac de 25kg"
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Combien d'unités de stock représente une vente de cette unité (Ex : "Sac 25kg" = 25).
                </p>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={fermerModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingId ? 'Enregistrer les modifications' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
