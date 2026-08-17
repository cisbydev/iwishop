import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Package, Pencil, Trash2, Search } from 'lucide-react';

const FORM_VIDE = {
  nom: '',
  categorie: '',
  prixAchat: '',
  prixVenteUnite: '',
  prixVenteDouzaine: '',
  quantiteStock: '',
  stockMinimum: '',
};

export default function Products() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Produit en cours d'édition (null = mode "ajout")
  const [editingId, setEditingId] = useState(null);

  // Formulaire (partagé entre ajout et modification)
  const [form, setForm] = useState(FORM_VIDE);

  const [recherche, setRecherche] = useState('');

  const produitsFiltres = produits.filter((p) =>
    p.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchProduits = async () => {
    try {
      const response = await api.get('produits/');
      setProduits(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('categories/');
      setCategories(response.data);
    } catch (err) {
      console.error("Erreur chargement catégories", err);
    }
  };

  useEffect(() => {
    fetchProduits();
    fetchCategories();
  }, [modeSupport, boutiqueId]);

  const ouvrirAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowModal(true);
  };

  const ouvrirModification = (p) => {
    setEditingId(p.id);
    setForm({
      nom: p.nom,
      categorie: p.categorie || '',
      prixAchat: p.prix_achat,
      prixVenteUnite: p.prix_unitaire,
      prixVenteDouzaine: p.prix_douzaine,
      quantiteStock: p.quantite_en_stock,
      stockMinimum: p.stock_minimum,
    });
    setShowModal(true);
  };

  const fermerModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      nom: form.nom,
      categorie: form.categorie || null,
      prix_achat: form.prixAchat,
      prix_unitaire: form.prixVenteUnite,
      prix_douzaine: form.prixVenteDouzaine,
      quantite_en_stock: form.quantiteStock,
      stock_minimum: form.stockMinimum,
    };

    try {
      if (editingId) {
        // Modification d'un produit existant
        await api.put(`produits/${editingId}/`, payload);
      } else {
        // Création d'un nouveau produit
        await api.post('produits/', payload);
      }
      fermerModal();
      fetchProduits();
    } catch (err) {
      alert(getErrorMessage(err, editingId
        ? "Erreur lors de la modification du produit."
        : "Erreur lors de la création du produit."));
    }
  };

  const handleDelete = async (produit) => {
    if (!window.confirm(`Supprimer définitivement "${produit.nom}" ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.delete(`produits/${produit.id}/`);
      fetchProduits();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la suppression du produit."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des produits...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Gestion des Produits & Stocks</h2>
        <button
          onClick={ouvrirAjout}
          disabled={modeSupport}
          title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
          className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
            modeSupport ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          }`}
        >
          <Plus className="w-5 h-5" /> Ajouter un produit
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un produit par nom..."
          className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Tableau des produits */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produit</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Achat</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Vente (Unité)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Vente (Douzaine)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Actuel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {produitsFiltres.map((p) => {
              const isRupture = p.quantite_en_stock <= 0;
              const isFaible = p.quantite_en_stock > 0 && p.quantite_en_stock <= p.stock_minimum;
              return (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.nom}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.categorie_nom || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.prix_achat} {devise}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.prix_unitaire} {devise}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.prix_douzaine} {devise}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{p.quantite_en_stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {isRupture ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Rupture</span>
                    ) : isFaible ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Stock Faible</span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">En stock</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => ouvrirModification(p)}
                        disabled={modeSupport}
                        title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Modifier"}
                        className={modeSupport ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={modeSupport}
                        title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer"}
                        className={modeSupport ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {produitsFiltres.length === 0 && recherche !== '' && (
          <p className="text-center text-gray-500 py-8">
            Aucun produit ne correspond à "{recherche}".
          </p>
        )}
      </div>

      {/* Modal d'ajout / modification de produit */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {editingId ? 'Modifier le produit' : 'Ajouter un nouveau produit'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom du produit</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                  value={form.categorie}
                  onChange={(e) => updateForm('categorie', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Aucune catégorie —</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prix d'achat</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixAchat}
                    onChange={(e) => updateForm('prixAchat', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prix vente (Unité)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixVenteUnite}
                    onChange={(e) => updateForm('prixVenteUnite', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prix vente (Douzaine)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixVenteDouzaine}
                    onChange={(e) => updateForm('prixVenteDouzaine', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {editingId ? 'Quantité en stock' : 'Stock initial'}
                  </label>
                  <input
                    type="number"
                    value={form.quantiteStock}
                    onChange={(e) => updateForm('quantiteStock', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                    required
                  />
                  {editingId && (
                    <p className="text-xs text-gray-500 mt-1">
                      Pour corriger le stock suite à un comptage, préfère plutôt un "Ajustement d'inventaire" dans l'onglet Stock — ça garde une trace dans l'historique.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Stock minimum d'alerte</label>
                <input
                  type="number"
                  value={form.stockMinimum}
                  onChange={(e) => updateForm('stockMinimum', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  required
                />
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
