import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { Truck, Plus, Trash2, CheckCircle, History } from 'lucide-react';

export default function Purchases() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [unitesParProduit, setUnitesParProduit] = useState({}); // produitId -> [{ unite_id, unite_nom, facteur_conversion }]
  const [fournisseurs, setFournisseurs] = useState([]);
  const [achats, setAchats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const [selectedFournisseur, setSelectedFournisseur] = useState('');
  const [notes, setNotes] = useState('');
  const [panier, setPanier] = useState([]);

  const [selectedProduit, setSelectedProduit] = useState('');
  const [selectedUniteId, setSelectedUniteId] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState('');

  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recharge uniquement les produits (stock à jour après un achat) sans
  // retoucher aux unités, qui ne changent pas en cours de session.
  const fetchProduits = async () => {
    try {
      const produits = await getAll('produits/');
      setProduits(produits);
      if (produits.length > 0) setSelectedProduit(produits[0].id);
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setErreurChargement("Impossible de charger les données des achats. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchCatalogue = async () => {
    try {
      const [produits, prix, unites] = await Promise.all([
        getAll('produits/'),
        getAll('produits/prix/'),
        getAll('produits/unites-vente/'),
      ]);

      const facteurParUnite = {};
      unites.forEach((u) => {
        facteurParUnite[u.id] = parseFloat(u.facteur_conversion);
      });

      // Les unités disponibles à l'achat pour un produit sont les mêmes
      // que celles configurées pour sa vente (ProduitPrix) : c'est la
      // liste des unités pertinentes pour ce produit, indépendamment du
      // prix de vente qui y est attaché (non utilisé ici, l'achat a son
      // propre prix négocié).
      const rangUnite = (nom) => (nom === 'Unité' ? 0 : nom === 'Douzaine' ? 1 : 2);
      const map = {};
      prix.forEach((p) => {
        const facteur = facteurParUnite[p.unite];
        if (facteur === undefined) return; // unité inconnue : on ignore par sécurité
        if (!map[p.produit]) map[p.produit] = [];
        map[p.produit].push({
          unite_id: p.unite,
          unite_nom: p.unite_nom,
          facteur_conversion: facteur,
        });
      });
      Object.values(map).forEach((options) => {
        options.sort((a, b) => rangUnite(a.unite_nom) - rangUnite(b.unite_nom) || a.unite_nom.localeCompare(b.unite_nom));
      });

      setProduits(produits);
      setUnitesParProduit(map);
      if (produits.length > 0) setSelectedProduit(produits[0].id);
    } catch (err) {
      console.error("Erreur chargement catalogue", err);
      setErreurChargement("Impossible de charger les données des achats. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchFournisseurs = async () => {
    try {
      const fournisseurs = await getAll('fournisseurs/');
      setFournisseurs(fournisseurs);
      if (fournisseurs.length > 0) setSelectedFournisseur(fournisseurs[0].id);
    } catch (err) {
      console.error("Erreur chargement fournisseurs", err);
      setErreurChargement("Impossible de charger les données des achats. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchAchats = async () => {
    try {
      const achats = await getAll('achats/');
      setAchats(achats);
    } catch (err) {
      console.error("Erreur chargement achats", err);
      setErreurChargement("Impossible de charger les données des achats. Vérifiez votre connexion puis réessayez.");
    }
  };

  const loadPurchasesData = async () => {
    setLoading(true);
    setErreurChargement('');
    await Promise.all([
      fetchCatalogue(),
      fetchFournisseurs(),
      fetchAchats(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    const loadPurchases = async () => {
      await Promise.all([
        fetchCatalogue(),
        fetchFournisseurs(),
        fetchAchats(),
      ]);
      setLoading(false);
    };

    void loadPurchases();
  }, [modeSupport, boutiqueId]);

  const uniteOptions = unitesParProduit[parseInt(selectedProduit)] || [];
  // Même logique de repli qu'en Vente : si l'unité choisie ne s'applique
  // plus au produit sélectionné, on retombe sur la première disponible.
  const uniteIdEffectif = uniteOptions.some(u => u.unite_id === parseInt(selectedUniteId))
    ? parseInt(selectedUniteId)
    : (uniteOptions[0]?.unite_id ?? '');
  const uniteChoisieCourante = uniteOptions.find(u => u.unite_id === uniteIdEffectif);

  const handleAddLigne = (e) => {
    e.preventDefault();
    if (modeSupport) return;
    const prod = produits.find(p => p.id === parseInt(selectedProduit));
    if (!prod) return;

    const uniteChoisie = uniteOptions.find(u => u.unite_id === uniteIdEffectif);
    if (!uniteChoisie) {
      alert("Aucune unité configurée pour ce produit.");
      return;
    }

    const qte = parseInt(quantite);
    const prix = parseFloat(prixUnitaire);

    if (!qte || qte <= 0) {
      alert("La quantité doit être supérieure à zéro.");
      return;
    }
    if (isNaN(prix) || prix < 0) {
      alert("Le prix d'achat unitaire est invalide.");
      return;
    }

    // Nombre réel d'unités de stock à ajouter, via le facteur de
    // conversion de l'unité choisie (même règle que purchases/serializers.py).
    const unitesReellesRaw = qte * uniteChoisie.facteur_conversion;
    const unitesAAjouter = Math.round(unitesReellesRaw);
    if (Math.abs(unitesReellesRaw - unitesAAjouter) > 1e-6) {
      alert(`'${prod.nom}' ne peut pas être acheté en quantité fractionnaire avec l'unité '${uniteChoisie.unite_nom}'. Utilisez une quantité entière compatible.`);
      return;
    }

    const nouvelleLigne = {
      produit_id: prod.id,
      nom: prod.nom,
      unite_id: uniteChoisie.unite_id,
      unite_nom: uniteChoisie.unite_nom,
      quantite: qte,
      prix_unitaire_achat: prix,
      sous_total: qte * prix,
    };

    setPanier([...panier, nouvelleLigne]);
    setQuantite(1);
    setPrixUnitaire('');
  };

  const handleRemoveLigne = (index) => {
    setPanier(panier.filter((_, i) => i !== index));
  };

  const totalAchat = panier.reduce((acc, item) => acc + item.sous_total, 0);

  const handleSubmitAchat = async () => {
    if (isSubmitting || modeSupport) return;
    if (panier.length === 0) {
      alert("Ajoute au moins un produit à l'achat.");
      return;
    }
    if (!selectedFournisseur) {
      alert("Sélectionne un fournisseur.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('achats/', {
        fournisseur: selectedFournisseur,
        notes: notes || null,
        lignes: panier.map(item => ({
          produit: item.produit_id,
          unite: item.unite_id,
          quantite: item.quantite,
          prix_unitaire_achat: item.prix_unitaire_achat,
        })),
      });
      setSuccessMessage("Achat enregistré avec succès ! Stock mis à jour.");
      setPanier([]);
      setNotes('');
      fetchAchats();
      fetchProduits(); // Rafraîchir les stocks
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement de l'achat."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={loadPurchasesData} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Achats fournisseurs</h2>
        <p className="mt-2 text-sm text-slate-600">Enregistrez vos approvisionnements et suivez le détail de vos achats.</p>
      </section>

      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] lg:items-start">
        {/* Formulaire d'ajout au panier */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Truck className="h-5 w-5 text-blue-600" /> Nouvel achat
          </h3>

          {fournisseurs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-medium text-gray-800">Aucun fournisseur enregistré.</p>
              <p className="mt-1 text-sm text-gray-500">Ajoutez d'abord un fournisseur dans l'onglet « Fournisseurs » avant de créer un achat.</p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700">Fournisseur</label>
                <select
                  value={selectedFournisseur}
                  onChange={(e) => setSelectedFournisseur(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleAddLigne} className="space-y-5 border-t border-slate-100 pt-5">
                <p className="text-sm font-medium text-gray-700">Ajouter un produit à l'achat</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Produit</label>
                  <select
                    value={selectedProduit}
                    onChange={(e) => setSelectedProduit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>{p.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unité</label>
                  {uniteOptions.length > 0 ? (
                    <select
                      value={uniteIdEffectif}
                      onChange={(e) => setSelectedUniteId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {uniteOptions.map((u) => (
                        <option key={u.unite_id} value={u.unite_id}>{u.unite_nom}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-sm text-red-600">Aucune unité configurée pour ce produit.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={quantite}
                    onChange={(e) => setQuantite(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Prix d'achat par {uniteChoisieCourante?.unite_nom || 'unité'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prixUnitaire}
                    onChange={(e) => setPrixUnitaire(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={modeSupport || uniteOptions.length === 0}
                  title={
                    modeSupport
                      ? "Action désactivée en Vue Support (lecture seule)"
                      : uniteOptions.length === 0
                        ? "Aucune unité configurée pour ce produit"
                        : undefined
                  }
                  className={`flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                    modeSupport || uniteOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  <Plus className="w-5 h-5" /> Ajouter à l'achat
                </button>
              </form>
            </>
          )}
        </section>

        {/* Panier de l'achat en cours */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="mb-5 text-lg font-semibold text-slate-900">Détail de l'achat</h3>

            {panier.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center text-center">
                <p className="font-medium text-slate-800">Aucun produit ajouté.</p>
                <p className="mt-1 text-sm text-slate-500">Sélectionnez un produit puis ajoutez-le à l'achat.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unité</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qté</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prix Achat U.</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sous-total</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {panier.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nom}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.unite_nom}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.quantite}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(item.prix_unitaire_achat, devise)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800">{formatCurrency(item.sous_total, devise)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveLigne(index)}
                            disabled={modeSupport}
                            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
                            aria-label={`Retirer ${item.nom} de l'achat`}
                            className={`inline-flex min-w-11 min-h-11 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${modeSupport ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}`}
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
          </div>

          <div className="mt-6 border-t pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes (optionnel)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Facture n°..., livraison partielle..."
                className="mt-1 w-full p-2 border rounded-md"
              />
            </div>

            <div className="flex justify-between items-center text-lg font-bold text-gray-900">
              <span>Montant Total :</span>
              <span className="text-blue-600">{formatCurrency(totalAchat, devise)}</span>
            </div>

            <button
              onClick={handleSubmitAchat}
              disabled={panier.length === 0 || modeSupport || isSubmitting}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full py-3 rounded-lg text-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
                panier.length === 0 || modeSupport || isSubmitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Validation...' : "Valider l'Achat"}
            </button>
          </div>
        </section>
      </div>

      {/* Historique des achats */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <History className="h-5 w-5 text-blue-600" /> Historique des achats
        </h3>

        {achats.length === 0 ? (
          <div className="py-6 text-center">
            <p className="font-medium text-gray-800">Aucun achat enregistré.</p>
            <p className="mt-1 text-sm text-gray-500">Les achats validés apparaîtront ici.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="border-b border-blue-200 bg-blue-100/70">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Fournisseur</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Détail</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Montant Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {achats.map((a) => (
                  <tr key={a.id}>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-blue-600">#{a.id}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-slate-800">{a.fournisseur_nom || 'Inconnu'}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-slate-600">
                      {formatDateTime(a.date_achat)}
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600">
                      <ul className="space-y-1.5">
                        {a.lignes && a.lignes.map((ligne, idx) => (
                          <li key={idx} className="text-xs leading-5 text-slate-600">
                            <span className="font-medium text-slate-800">{ligne.produit_nom}</span>
                            {' '}- {ligne.quantite} ({ligne.unite_nom}) x {formatCurrency(ligne.prix_unitaire_achat, devise)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-slate-900">{formatCurrency(a.montant_total, devise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
