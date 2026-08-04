import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, UserCircle, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';

const FORM_VIDE = { username: '', first_name: '', last_name: '', password: '' };

export default function Employees() {
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchEmployes = async () => {
    try {
      const response = await api.get('accounts/employes/');
      setEmployes(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement employés", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('accounts/employes/', form);
      setShowModal(false);
      setForm(FORM_VIDE);
      fetchEmployes();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la création du compte employé."));
    }
  };

  const handleDelete = async (employe) => {
    if (!window.confirm(`Supprimer définitivement le compte de "${employe.username}" ? Cette action est irréversible.`)) {
      return;
    }
    try {
      await api.delete(`accounts/employes/${employe.id}/`);
      fetchEmployes();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la suppression du compte."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des employés...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Ajouter un employé
        </button>
      </div>

      {employes.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">Aucun compte employé créé pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom d'utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom complet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employes.map((emp) => (
                <tr key={emp.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                    <UserCircle className="w-4 h-4 text-gray-400" /> {emp.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {emp.first_name || emp.last_name ? `${emp.first_name} ${emp.last_name}`.trim() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {emp.is_active ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                        <ShieldCheck className="w-3.5 h-3.5" /> Actif
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-gray-400">
                        <ShieldOff className="w-3.5 h-3.5" /> Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleDelete(emp)}
                      className="text-red-600 hover:text-red-800"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal d'ajout d'employé */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Ajouter un nouvel employé</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom d'utilisateur</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => updateForm('username', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => updateForm('first_name', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => updateForm('last_name', e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mot de passe initial</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  L'employé pourra le changer ensuite depuis "Mon Compte".
                </p>
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
                  Créer le compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
