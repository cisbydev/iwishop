import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Truck, Pencil, Trash2, Phone, MapPin } from 'lucide-react';

const FORM_VIDE = { nom: '', telephone: '', adresse: '' };

export default function Suppliers() {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchFournisseurs = async () => {
    try {
      const response = await api.get('fournisseurs/');
      setFournisseurs(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement fournisseurs", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFournisseurs();
  }, []);

  const ouvrirAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowModal(true);
  };

  const ouvrirModification = (f) => {
    setEditingId(f.id);
    setForm({ nom: f.nom, telephone: f.telephone || '', adresse: f.adresse || '' });
    setShowModal(true);
  };

  const fermerModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`fournisseurs/${editingId}/`, form);
      } else {
        await api.post('fournisseurs/', form);
      }
      fermerModal();
      fetchFournisseurs();
    } catch (err) {
      alert(getErrorMessage(err, editingId
        ? "Erreur lors de la modification du fournisseur."
        : "Erreur lors de la création du fournisseur."));
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Supprimer définitivement le fournisseur "${f.nom}" ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.delete(`fournisseurs/${f.id}/`);
      fetchFournisseurs();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la suppression du fournisseur."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des fournisseurs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Gestion des Fournisseurs</h2>
        <button
          onClick={ouvrirAjout}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Ajouter un fournisseur
        </button>
      </div>

      {fournisseurs.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucun fournisseur enregistré pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fournisseurs.map((f) => (
            <div key={f.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-full">
                    <Truck className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-gray-800">{f.nom}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => ouvrirModification(f)}
                    className="text-blue-600 hover:text-blue-800"
                    title="Modifier"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(f)}
                    className="text-red-500 hover:text-red-700"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-gray-500">
                {f.telephone && (
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" /> {f.telephone}
                  </p>
                )}
                {f.adresse && (
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> {f.adresse}
                  </p>
                )}
                {!f.telephone && !f.adresse && (
                  <p className="italic text-gray-400">Aucune coordonnée renseignée</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal d'ajout / modification de fournisseur */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {editingId ? 'Modifier le fournisseur' : 'Ajouter un nouveau fournisseur'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom du fournisseur</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                <input
                  type="text"
                  value={form.telephone}
                  onChange={(e) => updateForm('telephone', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Adresse</label>
                <textarea
                  value={form.adresse}
                  onChange={(e) => updateForm('adresse', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  rows="3"
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
