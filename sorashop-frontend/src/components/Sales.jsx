import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency } from '../utils/formatters';
import { ShoppingCart, Plus, Trash2, CheckCircle } from 'lucide-react';

export default function Sales() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [prixParUnite, setPrixParUnite] = useState({}); // produitId -> [{ unite_id, unite_nom, prix, facteur_conversion }]
  const [panier, setPanier] = useState([]);
  const [selectedProduit, setSelectedProduit] = useState('');
  const [selectedUniteId, setSelectedUniteId] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [remise, setRemise] = useState(0);
  const [montantPaye, setMontantPaye] = useState('');
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recharge uniquement les produits (stock à jour après une vente) sans
  // retoucher aux prix/unités, qui ne changent pas en cours de session.
  const fetchProduits = async () => {
    try {
      const produits = await getAll('produits/');
      setProduits(produits);
      if (produits.length > 0) {
        setSelectedProduit(produits[0].id);
      }
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setErreurChargement("Impossible de charger les données de vente. Vérifiez votre connexion puis réessayez.");
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

      const rangUnite = (nom) => (nom === 'Unité' ? 0 : nom === 'Douzaine' ? 1 : 2);
      const map = {};
      prix.forEach((p) => {
        const facteur = facteurParUnite[p.unite];
        if (facteur === undefined) return; // unité inconnue : on ignore ce prix par sécurité
        if (!map[p.produit]) map[p.produit] = [];
        map[p.produit].push({
          unite_id: p.unite,
          unite_nom: p.unite_nom,
          prix: parseFloat(p.prix),
          facteur_conversion: facteur,
        });
      });
      Object.values(map).forEach((options) => {
        options.sort((a, b) => rangUnite(a.unite_nom) - rangUnite(b.unite_nom) || a.unite_nom.localeCompare(b.unite_nom));
      });

      setProduits(produits);
      setPrixParUnite(map);
      if (produits.length > 0) {
        setSelectedProduit(produits[0].id);
      }
    } catch (err) {
      console.error("Erreur chargement catalogue", err);
      setErreurChargement("Impossible de charger les données de vente. Vérifiez votre connexion puis réessayez.");
    }
  };

  const loadCatalogue = async () => {
    setLoading(true);
    setErreurChargement('');
    await fetchCatalogue();
    setLoading(false);
  };

  useEffect(() => {
    const chargerCatalogue = async () => {
      await fetchCatalogue();
      setLoading(false);
    };

    void chargerCatalogue();
  }, [modeSupport, boutiqueId]);

  const uniteOptions = prixParUnite[parseInt(selectedProduit)] || [];
  // L'unité choisie par l'utilisateur peut ne plus s'appliquer au produit
  // qui vient d'être sélectionné (ex: elle n'existe pas pour ce produit) :
  // on retombe alors sur la première unité disponible, dérivée au rendu
  // plutôt que synchronisée via un effet.
  const uniteIdEffectif = uniteOptions.some(u => u.unite_id === parseInt(selectedUniteId))
    ? parseInt(selectedUniteId)
    : (uniteOptions[0]?.unite_id ?? '');

  const handleAddLigne = (e) => {
    e.preventDefault();
    if (modeSupport) return;
    const prod = produits.find(p => p.id === parseInt(selectedProduit));
    if (!prod) return;

    const uniteChoisie = uniteOptions.find(u => u.unite_id === uniteIdEffectif);
    if (!uniteChoisie) {
      alert("Aucun prix configuré pour ce produit sur l'unité sélectionnée.");
      return;
    }

    const qteNum = parseInt(quantite);

    // Nombre réel d'unités de stock à déduire, via le facteur de
    // conversion de l'unité choisie (même règle que sales/serializers.py).
    const unitesReellesRaw = qteNum * uniteChoisie.facteur_conversion;
    const unitesADeduire = Math.round(unitesReellesRaw);
    if (Math.abs(unitesReellesRaw - unitesADeduire) > 1e-6) {
      alert(`'${prod.nom}' ne peut pas être vendu en quantité fractionnaire avec l'unité '${uniteChoisie.unite_nom}'. Utilisez une quantité entière compatible.`);
      return;
    }

    // Vérification du stock selon les règles métier
    if (unitesADeduire > prod.quantite_en_stock) {
      alert(`Stock insuffisant ! Stock disponible en unités : ${prod.quantite_en_stock}`);
      return;
    }

    const sousTotal = uniteChoisie.prix * qteNum;

    const nouvelleLigne = {
      produit_id: prod.id,
      nom: prod.nom,
      unite_id: uniteChoisie.unite_id,
      unite_nom: uniteChoisie.unite_nom,
      quantite: qteNum,
      prix_unitaire: uniteChoisie.prix,
      sous_total: sousTotal,
    };

    setPanier([...panier, nouvelleLigne]);
    setQuantite(1);
  };

  const handleRemoveLigne = (index) => {
    const nouveauPanier = panier.filter((_, i) => i !== index);
    setPanier(nouveauPanier);
  };

  const totalBrut = panier.reduce((acc, item) => acc + item.sous_total, 0);
  const montantNet = totalBrut - (parseFloat(remise) || 0);

  const handleSubmitVente = async () => {
    if (isSubmitting || modeSupport) return;
    if (panier.length === 0) {
      alert("Le panier est vide.");
      return;
    }

    const paye = parseFloat(montantPaye);
    if (isNaN(paye) || paye < montantNet) {
      alert(`Le montant payé (${formatCurrency(montantPaye || 0, devise)}) est inférieur au montant net à payer (${formatCurrency(montantNet, devise)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('ventes/', {
        remise: parseFloat(remise) || 0,
        montant_paye: paye,
        mode_paiement: modePaiement,
        lignes: panier.map(item => ({
          produit: item.produit_id,
          unite: item.unite_id,
          quantite: item.quantite,
          prix_applique: item.prix_unitaire,
        }))
      });
      setSuccessMessage("Vente enregistrée avec succès ! Stock mis à jour.");
      setPanier([]);
      setRemise(0);
      setMontantPaye('');
      fetchProduits(); // Recharger les produits pour actualiser les stocks affichés
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error("Erreur vente :", err.response?.data || err);
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement de la vente."));
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
          <button onClick={loadCatalogue} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1366px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Ventes</h2>
        <p className="mt-2 text-sm text-slate-600">Préparez le panier, appliquez les remises et finalisez les ventes de votre boutique.</p>
      </section>

      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]">
        {/* Formulaire d'ajout au panier */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-5 text-lg font-semibold text-slate-900">Ajouter un article</h3>
          <form onSubmit={handleAddLigne} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Produit</label>
              <select
                value={selectedProduit}
                onChange={(e) => setSelectedProduit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (Stock : {p.quantite_en_stock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type de vente</label>
              {uniteOptions.length > 0 ? (
                <select
                  value={uniteIdEffectif}
                  onChange={(e) => setSelectedUniteId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {uniteOptions.map((u) => (
                    <option key={u.unite_id} value={u.unite_id}>
                      {u.unite_nom} ({formatCurrency(u.prix, devise)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-sm text-red-600">Aucun prix configuré pour ce produit.</p>
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

            <button
              type="submit"
              disabled={modeSupport || uniteOptions.length === 0}
              title={
                modeSupport
                  ? "Action désactivée en Vue Support (lecture seule)"
                  : uniteOptions.length === 0
                    ? "Aucun prix configuré pour ce produit"
                    : undefined
              }
              className={`flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                modeSupport || uniteOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              }`}
            >
              <Plus className="w-5 h-5" /> Ajouter au panier
            </button>
          </form>
        </div>

        {/* Panier & Validation */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <ShoppingCart className="h-5 w-5 text-blue-600" /> Panier en cours
            </h3>

            {panier.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
                <p className="font-medium text-gray-800">Votre panier est vide.</p>
                <p className="mt-1 text-sm text-gray-500">Choisissez un produit puis ajoutez-le au panier pour préparer la vente.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qté</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prix U.</th>
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
                        <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(item.prix_unitaire, devise)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800">{formatCurrency(item.sous_total, devise)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveLigne(index)}
                            disabled={modeSupport}
                            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
                            aria-label={`Retirer ${item.nom} du panier`}
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

          {/* Totaux et Validation */}
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Total Brut :</span>
              <span className="font-semibold text-gray-800">{formatCurrency(totalBrut, devise)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Remise ({devise}) :</span>
              <input
                type="number"
                min="0"
                value={remise}
                onChange={(e) => setRemise(e.target.value)}
                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-lg font-bold text-slate-900">
              <span>Montant Net à Payer :</span>
              <span className="text-blue-600">{formatCurrency(montantNet >= 0 ? montantNet : 0, devise)}</span>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Mode de paiement :</span>
              <select
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value)}
                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="ESPECES">Espèces</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="CARTE">Carte bancaire</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Montant payé par le client :</span>
              <input
                type="number"
                min="0"
                value={montantPaye}
                onChange={(e) => setMontantPaye(e.target.value)}
                placeholder="0"
                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {montantPaye !== '' && !isNaN(parseFloat(montantPaye)) && (
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Monnaie à rendre :</span>
                <span className="font-semibold text-gray-800">
                  {formatCurrency(Math.max(parseFloat(montantPaye) - montantNet, 0), devise)}
                </span>
              </div>
            )}

            <button
              onClick={handleSubmitVente}
              disabled={panier.length === 0 || modeSupport || isSubmitting}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full py-3 rounded-lg text-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
                panier.length === 0 || modeSupport || isSubmitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Validation...' : 'Valider la Vente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
