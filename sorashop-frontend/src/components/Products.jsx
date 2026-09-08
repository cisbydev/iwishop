import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency } from '../utils/formatters';
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react';

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
  const { parametres, utilisateur } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const estProprietaire = utilisateur?.est_proprietaire;
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Produit en cours d'édition (null = mode "ajout")
  const [editingId, setEditingId] = useState(null);

  // Formulaire (partagé entre ajout et modification)
  const [form, setForm] = useState(FORM_VIDE);

  // Prix par unité personnalisée (en plus des 2 champs Unité/Douzaine ci-dessus)
  const [unitesPersonnalisees, setUnitesPersonnalisees] = useState([]);
  const [prixExistants, setPrixExistants] = useState([]); // tous les ProduitPrix de la boutique (pas de filtre serveur par produit)
  const [lignesPrix, setLignesPrix] = useState([]); // [{ clientId, produitPrixId, unite, uniteNom, prix }]
  const [lignesPrixOriginales, setLignesPrixOriginales] = useState([]); // snapshot pris à l'ouverture du modal, pour le diff à la sauvegarde

  const [recherche, setRecherche] = useState('');

  const produitsFiltres = produits.filter((p) =>
    p.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchProduits = async () => {
    try {
      const produits = await getAll('produits/');
      setProduits(produits);
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setErreurChargement("Impossible de charger les produits. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchCategories = async () => {
    try {
      const categories = await getAll('categories/');
      setCategories(categories);
    } catch (err) {
      console.error("Erreur chargement catégories", err);
      setErreurChargement("Impossible de charger les produits. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchUnitesVente = async () => {
    try {
      const unites = await getAll('produits/unites-vente/');
      setUnitesPersonnalisees(unites.filter((u) => !u.est_systeme));
    } catch (err) {
      console.error("Erreur chargement unités de vente", err);
      setErreurChargement("Impossible de charger les produits. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchPrix = async () => {
    try {
      const prix = await getAll('produits/prix/');
      setPrixExistants(prix);
    } catch (err) {
      console.error("Erreur chargement prix par unité", err);
      setErreurChargement("Impossible de charger les produits. Vérifiez votre connexion puis réessayez.");
    }
  };

  const loadProductsData = async () => {
    setLoading(true);
    setErreurChargement('');
    await Promise.all([
      fetchProduits(),
      fetchCategories(),
      fetchUnitesVente(),
      fetchPrix(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    const loadProducts = async () => {
      await Promise.all([
        fetchProduits(),
        fetchCategories(),
        fetchUnitesVente(),
        fetchPrix(),
      ]);
      setLoading(false);
    };

    void loadProducts();
  }, [modeSupport, boutiqueId]);

  const ouvrirAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setLignesPrix([]);
    setLignesPrixOriginales([]);
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
    const lignesExistantes = prixExistants
      .filter((pp) => pp.produit === p.id && unitesPersonnalisees.some((u) => u.id === pp.unite))
      .map((pp) => ({
        clientId: `existing-${pp.id}`,
        produitPrixId: pp.id,
        unite: pp.unite,
        uniteNom: pp.unite_nom,
        prix: pp.prix,
      }));
    setLignesPrix(lignesExistantes);
    setLignesPrixOriginales(lignesExistantes);
    setShowModal(true);
  };

  const fermerModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(FORM_VIDE);
    setLignesPrix([]);
    setLignesPrixOriginales([]);
  };

  const unitesDisponiblesPour = (clientId) => {
    const utilisees = new Set(lignesPrix.filter((l) => l.clientId !== clientId).map((l) => l.unite));
    return unitesPersonnalisees.filter((u) => !utilisees.has(u.id));
  };

  const ajouterLignePrix = () => {
    setLignesPrix((prev) => [
      ...prev,
      { clientId: `new-${Date.now()}-${Math.random()}`, produitPrixId: null, unite: '', uniteNom: '', prix: '' },
    ]);
  };

  const updateLignePrix = (clientId, champ, valeur) => {
    setLignesPrix((prev) => prev.map((l) => (l.clientId === clientId ? { ...l, [champ]: valeur } : l)));
  };

  const retirerLignePrix = (clientId) => {
    setLignesPrix((prev) => prev.filter((l) => l.clientId !== clientId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    const ligneIncomplete = lignesPrix.some((l) => !l.unite || l.prix === '' || l.prix === null);
    if (ligneIncomplete) {
      alert("Chaque ligne de prix personnalisé doit avoir une unité et un prix renseignés. Complète-la ou retire-la avant d'enregistrer.");
      return;
    }

    const payload = {
      nom: form.nom,
      categorie: form.categorie || null,
      prix_achat: form.prixAchat,
      prix_unitaire: form.prixVenteUnite,
      prix_douzaine: form.prixVenteDouzaine,
      quantite_en_stock: form.quantiteStock,
      stock_minimum: form.stockMinimum,
    };

    setIsSaving(true);
    try {
      let produitId = editingId;
      if (editingId) {
        // Modification d'un produit existant
        await api.put(`produits/${editingId}/`, payload);
      } else {
        // Création d'un nouveau produit
        const response = await api.post('produits/', payload);
        produitId = response.data.id;
      }

      // Synchronise les prix par unité personnalisée : nouvelles lignes -> POST,
      // lignes existantes toujours présentes -> PATCH (idempotent, même si le
      // prix n'a pas changé), lignes retirées par le commerçant -> DELETE.
      const nouvelles = lignesPrix.filter((l) => !l.produitPrixId);
      const conservees = lignesPrix.filter((l) => l.produitPrixId);
      const idsConserves = new Set(conservees.map((l) => l.produitPrixId));
      const supprimees = lignesPrixOriginales.filter((l) => !idsConserves.has(l.produitPrixId));

      const erreursPrix = [];
      await Promise.all([
        ...nouvelles.map((l) =>
          api.post('produits/prix/', { produit: produitId, unite: l.unite, prix: l.prix })
            .catch((err) => erreursPrix.push(`${l.uniteNom || 'unité'} : ${getErrorMessage(err)}`))
        ),
        ...conservees.map((l) =>
          api.patch(`produits/prix/${l.produitPrixId}/`, { prix: l.prix })
            .catch((err) => erreursPrix.push(`${l.uniteNom || 'unité'} : ${getErrorMessage(err)}`))
        ),
        ...supprimees.map((l) =>
          api.delete(`produits/prix/${l.produitPrixId}/`)
            .catch((err) => erreursPrix.push(`${l.uniteNom || 'unité'} : ${getErrorMessage(err)}`))
        ),
      ]);

      if (erreursPrix.length > 0) {
        alert(
          "Le produit a été enregistré, mais certains prix par unité personnalisée n'ont pas pu être synchronisés :\n"
          + erreursPrix.join('\n')
        );
      }

      fermerModal();
      fetchProduits();
      fetchPrix();
    } catch (err) {
      alert(getErrorMessage(err, editingId
        ? "Erreur lors de la modification du produit."
        : "Erreur lors de la création du produit."));
    } finally {
      setIsSaving(false);
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

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={loadProductsData} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
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
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Produits & Stocks</h2>
            <p className="mt-2 text-sm text-slate-600">Gérez votre catalogue, vos prix et vos niveaux de stock.</p>
          </div>
          <button
            onClick={ouvrirAjout}
            disabled={modeSupport}
            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto ${
              modeSupport ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <Plus className="h-5 w-5" /> Ajouter un produit
          </button>
        </div>

        <div className="relative mt-5 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un produit par nom..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </section>

      {/* Tableau des produits */}
      {produits.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="font-medium text-gray-800">Aucun produit enregistré.</p>
          <p className="mt-1 text-sm text-gray-500">Ajoutez votre premier produit pour commencer à gérer votre stock.</p>
          {!modeSupport && (
            <button
              type="button"
              onClick={ouvrirAjout}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Plus className="w-5 h-5" /> Ajouter un produit
            </button>
          )}
        </div>
      ) : (
      <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full divide-y divide-gray-200">
          <thead className="border-b border-blue-200 bg-blue-100/70">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Produit</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Catégorie</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Prix Achat</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Prix Vente (Unité)</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Prix Vente (Douzaine)</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Stock Actuel</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Statut</th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {produitsFiltres.map((p) => {
              const isRupture = p.quantite_en_stock <= 0;
              const isFaible = p.quantite_en_stock > 0 && p.quantite_en_stock <= p.stock_minimum;
              return (
                <tr key={p.id}>
                  <td className="px-6 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100" aria-hidden="true">
                        {p.nom.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.nom}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{p.categorie_nom || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.categorie_nom || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(p.prix_achat, devise)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">{formatCurrency(p.prix_unitaire, devise)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">{formatCurrency(p.prix_douzaine, devise)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold text-slate-800">{p.quantite_en_stock}</td>
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
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => ouvrirModification(p)}
                        disabled={modeSupport}
                        title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Modifier"}
                        aria-label={`Modifier le produit ${p.nom}`}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${modeSupport ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {estProprietaire && (
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={modeSupport}
                          title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : "Supprimer"}
                          aria-label={`Supprimer le produit ${p.nom}`}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${modeSupport ? 'cursor-not-allowed bg-slate-50 text-slate-300' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {produitsFiltres.length === 0 && recherche !== '' && (
          <p className="text-center text-gray-500 py-8">
            Aucun produit ne correspond à "{recherche}".
          </p>
        )}
      </div>
      )}

      {/* Modal d'ajout / modification de produit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[35rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <h3 className="shrink-0 border-b border-slate-100 px-5 py-4 text-xl font-bold text-slate-900 sm:px-6">
              {editingId ? 'Modifier le produit' : 'Ajouter un nouveau produit'}
            </h3>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom du produit</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
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
                  <option value="">— Aucune catégorie —</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Prix d'achat</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixAchat}
                    onChange={(e) => updateForm('prixAchat', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Prix vente (Unité)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixVenteUnite}
                    onChange={(e) => updateForm('prixVenteUnite', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Prix vente (Douzaine)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.prixVenteDouzaine}
                    onChange={(e) => updateForm('prixVenteDouzaine', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {editingId ? 'Quantité en stock' : 'Stock initial'}
                  </label>
                  <input
                    type="number"
                    value={form.quantiteStock}
                    onChange={(e) => updateForm('quantiteStock', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                <label className="block text-sm font-medium text-slate-700">Stock minimum d'alerte</label>
                <input
                  type="number"
                  value={form.stockMinimum}
                  onChange={(e) => updateForm('stockMinimum', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Prix par unité personnalisée</label>
                {unitesPersonnalisees.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Aucune unité personnalisée disponible — crée-les dans Paramètres &gt; Unités de vente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lignesPrix.map((ligne) => (
                      <div key={ligne.clientId} className="flex items-center gap-2">
                        {ligne.produitPrixId ? (
                          <span className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                            {ligne.uniteNom}
                          </span>
                        ) : (
                          <select
                            value={ligne.unite}
                            onChange={(e) => updateLignePrix(ligne.clientId, 'unite', Number(e.target.value) || '')}
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="">— Choisir une unité —</option>
                            {unitesDisponiblesPour(ligne.clientId).map((u) => (
                              <option key={u.id} value={u.id}>{u.nom}</option>
                            ))}
                          </select>
                        )}
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ligne.prix}
                          onChange={(e) => updateLignePrix(ligne.clientId, 'prix', e.target.value)}
                          placeholder="Prix"
                          className="w-28 rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => retirerLignePrix(ligne.clientId)}
                          disabled={isSaving}
                          aria-label={`Retirer le prix ${ligne.uniteNom || 'personnalisé'}`}
                          className="inline-flex min-w-11 min-h-11 items-center justify-center rounded-md text-gray-400 hover:text-red-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Retirer cette ligne"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={ajouterLignePrix}
                      disabled={isSaving || unitesDisponiblesPour(null).length === 0}
                      className={`flex items-center gap-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                        unitesDisponiblesPour(null).length === 0
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-blue-600 hover:text-blue-800'
                      }`}
                    >
                      <Plus className="w-4 h-4" /> Ajouter un prix
                    </button>
                  </div>
                )}
              </div>

              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
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
