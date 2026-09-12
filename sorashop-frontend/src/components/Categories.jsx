import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSupportView } from '../context/supportViewContextValue';
import { useSettings } from '../context/settingsContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Tag, Trash2 } from 'lucide-react';

export default function Categories() {
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const { utilisateur } = useSettings();
  const estProprietaire = utilisateur?.est_proprietaire;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');

  const fetchCategories = async () => {
    setLoading(true);
    setErreurChargement('');
    try {
      const categories = await getAll('categories/');
      setCategories(categories);
    } catch (err) {
      console.error("Erreur chargement catégories", err);
      setErreurChargement("Impossible de charger les catégories. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadCategories = async () => {
      await fetchCategories();
    };

    void loadCategories();
  }, [modeSupport, boutiqueId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await api.post('categories/', { nom, description });
      setShowModal(false);
      setNom('');
      setDescription('');
      fetchCategories();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de la création de la catégorie."));
    } finally {
      setIsSaving(false);
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

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={fetchCategories} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Catégories</h2>
            <p className="mt-2 text-sm text-slate-600">Organisez vos produits par catégories pour mieux gérer votre catalogue.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={modeSupport}
            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto ${
              modeSupport ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <Plus className="h-5 w-5" /> Ajouter une catégorie
          </button>
        </div>
      </section>

      {categories.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="font-medium text-gray-800">Aucune catégorie enregistrée.</p>
          <p className="mt-1 text-sm text-gray-500">Créez une catégorie pour mieux organiser vos produits.</p>
          {!modeSupport && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Plus className="w-5 h-5" /> Ajouter une catégorie
            </button>
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${
          categories.length === 1
            ? 'mx-auto max-w-[26rem]'
            : categories.length === 2
              ? 'mx-auto max-w-[56rem] md:grid-cols-2'
              : 'md:grid-cols-2 xl:grid-cols-3'
        }`}>
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Tag className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{cat.nom}</h3>
                  {cat.description && (
                    <p className="mt-1 text-sm text-slate-500">{cat.description}</p>
                  )}
                </div>
              </div>
              {estProprietaire && (
                <button
                  onClick={() => handleDelete(cat.id, cat.nom)}
                  disabled={modeSupport}
                  title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer la catégorie"}
                  aria-label={`Supprimer la catégorie ${cat.nom}`}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${modeSupport ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal d'ajout de catégorie */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[30rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="mb-5 text-xl font-semibold text-slate-900">Ajouter une nouvelle catégorie</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom de la catégorie</label>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex: Robes, Sacs, Chaussures..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description (optionnel)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  rows="3"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
