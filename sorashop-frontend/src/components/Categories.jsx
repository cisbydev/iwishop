import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Tag, Trash2 } from 'lucide-react';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');

  const fetchCategories = async () => {
    try {
      const response = await api.get('categories/');
      setCategories(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement catégories", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('categories/', { nom, description });
      setShowModal(false);
      setNom('');
      setDescription('');
      fetchCategories();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la création de la catégorie."));
    }
  };

  const handleDelete = async (id, nomCategorie) => {
    if (!window.confirm(`Supprimer la catégorie "${nomCategorie}" ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.delete(`categories/${id}/`);
      fetchCategories();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la suppression de la catégorie."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des catégories...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Gestion des Catégories</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Ajouter une catégorie
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucune catégorie enregistrée pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-full">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{cat.nom}</h3>
                  {cat.description && (
                    <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(cat.id, cat.nom)}
                className="text-red-500 hover:text-red-700"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal d'ajout de catégorie */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Ajouter une nouvelle catégorie</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom de la catégorie</label>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex: Robes, Sacs, Chaussures..."
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description (optionnel)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  rows="3"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
