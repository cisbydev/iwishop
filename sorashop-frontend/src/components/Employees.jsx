import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, UserCircle, UserX, UserCheck, ShieldCheck, ShieldOff } from 'lucide-react';

const FORM_VIDE = { username: '', first_name: '', last_name: '', password: '' };

export default function Employees() {
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchEmployes = async () => {
    try {
      const employes = await getAll('accounts/employes/');
      setEmployes(employes);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement employés", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadEmployes = async () => {
      await fetchEmployes();
    };

    void loadEmployes();
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

  const handleDesactiver = async (employe) => {
    if (!window.confirm(`Désactiver le compte de "${employe.username}" ? Il ne pourra plus se connecter à l'application.`)) {
      return;
    }
    try {
      await api.delete(`accounts/employes/${employe.id}/`);
      fetchEmployes();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la désactivation du compte."));
    }
  };

  const handleReactiver = async (employe) => {
    try {
      await api.post(`accounts/employes/${employe.id}/reactiver/`);
      fetchEmployes();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la réactivation du compte."));
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des employés...</div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Employés</h3>
          <p className="mt-1 text-sm text-slate-500">Gérez les utilisateurs qui ont accès à votre boutique.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Plus className="w-5 h-5" /> Ajouter un employé
        </button>
      </div>

      {employes.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 text-sm">Aucun compte employé créé pour le moment.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] divide-y divide-slate-200">
            <thead className="bg-blue-100/70 text-blue-950">
              <tr>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Nom d'utilisateur</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Nom complet</th>
                <th className="border-b border-blue-200 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">Statut</th>
                <th className="border-b border-blue-200 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {employes.map((emp) => (
                <tr key={emp.id} className="bg-white">
                  <td className="flex items-center gap-2 whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
                    <UserCircle className="h-4 w-4 text-blue-500" /> {emp.username}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    {emp.first_name || emp.last_name ? `${emp.first_name} ${emp.last_name}`.trim() : '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {emp.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-100">
                        <ShieldCheck className="h-3.5 w-3.5" /> Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
                        <ShieldOff className="h-3.5 w-3.5" /> Inactif
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    {emp.is_active ? (
                      <button
                        onClick={() => handleDesactiver(emp)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                        title="Désactiver"
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactiver(emp)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-600 transition hover:bg-green-100 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                        title="Réactiver"
                      >
                        <UserCheck className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal d'ajout d'employé */}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[30rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="mb-5 text-xl font-semibold text-slate-900">Ajouter un nouvel employé</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom d'utilisateur</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => updateForm('username', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => updateForm('first_name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => updateForm('last_name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Mot de passe initial</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
                <p className="mt-2 text-xs text-slate-500">
                  L'employé pourra le changer ensuite depuis "Mon Compte".
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(FORM_VIDE); }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
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
