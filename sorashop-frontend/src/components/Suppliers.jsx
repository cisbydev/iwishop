import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSupportView } from '../context/supportViewContextValue';
import { useSettings } from '../context/settingsContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { Plus, Truck, Pencil, Trash2, Phone, MapPin } from 'lucide-react';

const FORM_VIDE = { nom: '', telephone: '', adresse: '' };

export default function Suppliers() {
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const { utilisateur } = useSettings();
  const estProprietaire = utilisateur?.est_proprietaire;
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchFournisseurs = async () => {
    setLoading(true);
    setErreurChargement('');
    try {
      const fournisseurs = await getAll('fournisseurs/');
      setFournisseurs(fournisseurs);
    } catch (err) {
      console.error("Erreur chargement fournisseurs", err);
      setErreurChargement("Impossible de charger les fournisseurs. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadFournisseurs = async () => {
      await fetchFournisseurs();
    };

    void loadFournisseurs();
  }, [modeSupport, boutiqueId]);

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
    if (isSaving) return;
    setIsSaving(true);
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
    } finally {
      setIsSaving(false);
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

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={fetchFournisseurs} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1366px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Fournisseurs</h2>
            <p className="mt-2 text-sm text-slate-600">Gérez vos fournisseurs et leurs informations de contact.</p>
          </div>
          <button
            onClick={ouvrirAjout}
            disabled={modeSupport}
            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto ${
              modeSupport ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <Plus className="h-5 w-5" /> Ajouter un fournisseur
          </button>
        </div>
      </section>

      {fournisseurs.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="font-medium text-gray-800">Aucun fournisseur enregistré.</p>
          <p className="mt-1 text-sm text-gray-500">Ajoutez un fournisseur pour faciliter le suivi de vos achats.</p>
          {!modeSupport && (
            <button
              type="button"
              onClick={ouvrirAjout}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Plus className="w-5 h-5" /> Ajouter un fournisseur
            </button>
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${
          fournisseurs.length === 1
            ? 'mx-auto max-w-[30rem]'
            : fournisseurs.length === 2
              ? 'mx-auto max-w-[56rem] md:grid-cols-2'
              : 'md:grid-cols-2 xl:grid-cols-3'
        }`}>
          {fournisseurs.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Truck className="h-5 w-5" />
                  </div>
                  <h3 className="truncate font-semibold text-slate-900">{f.nom}</h3>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => ouvrirModification(f)}
                    disabled={modeSupport}
                    title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Modifier le fournisseur"}
                    aria-label={`Modifier le fournisseur ${f.nom}`}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${modeSupport ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {estProprietaire && (
                    <button
                      onClick={() => handleDelete(f)}
                      disabled={modeSupport}
                      title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer le fournisseur"}
                      aria-label={`Supprimer le fournisseur ${f.nom}`}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${modeSupport ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-2 pl-14 text-sm text-slate-600">
                {f.telephone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" /> {f.telephone}
                  </p>
                )}
                {f.adresse && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> {f.adresse}
                  </p>
                )}
                {!f.telephone && !f.adresse && (
                  <p className="italic text-slate-400">Aucune coordonnée renseignée</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal d'ajout / modification de fournisseur */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[30rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="mb-5 text-xl font-semibold text-slate-900">
              {editingId ? 'Modifier le fournisseur' : 'Ajouter un nouveau fournisseur'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom du fournisseur</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input
                  type="text"
                  value={form.telephone}
                  onChange={(e) => updateForm('telephone', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Adresse</label>
                <textarea
                  value={form.adresse}
                  onChange={(e) => updateForm('adresse', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  rows="3"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={fermerModal}
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
                  {isSaving ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
