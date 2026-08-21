import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
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
  const [successMessage, setSuccessMessage] = useState('');

  // Recharge uniquement les produits (stock à jour après une vente) sans
  // retoucher aux prix/unités, qui ne changent pas en cours de session.
  const fetchProduits = async () => {
    try {
      const response = await api.get('produits/');
      setProduits(response.data);
      if (response.data.length > 0) {
        setSelectedProduit(response.data[0].id);
      }
    } catch (err) {
      console.error("Erreur chargement produits", err);
    }
  };

  const fetchCatalogue = async () => {
    try {
      const [produitsRes, prixRes, unitesRes] = await Promise.all([
        api.get('produits/'),
        api.get('produits/prix/'),
        api.get('produits/unites-vente/'),
      ]);

      const facteurParUnite = {};
      unitesRes.data.forEach((u) => {
        facteurParUnite[u.id] = parseFloat(u.facteur_conversion);
      });

      const rangUnite = (nom) => (nom === 'Unité' ? 0 : nom === 'Douzaine' ? 1 : 2);
      const map = {};
      prixRes.data.forEach((p) => {
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

      setProduits(produitsRes.data);
      setPrixParUnite(map);
      if (produitsRes.data.length > 0) {
        setSelectedProduit(produitsRes.data[0].id);
      }
    } catch (err) {
      console.error("Erreur chargement catalogue", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogue();
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
    if (modeSupport) return;
    if (panier.length === 0) {
      alert("Le panier est vide.");
      return;
    }

    const paye = parseFloat(montantPaye);
    if (isNaN(paye) || paye < montantNet) {
      alert(`Le montant payé (${montantPaye || 0} ${devise}) est inférieur au montant net à payer (${montantNet} ${devise}).`);
      return;
    }

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
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Passation d'une Vente</h2>

      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire d'ajout au panier */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Ajouter un article</h3>
          <form onSubmit={handleAddLigne} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Produit</label>
              <select
                value={selectedProduit}
                onChange={(e) => setSelectedProduit(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                  className="mt-1 w-full p-2 border rounded-md"
                >
                  {uniteOptions.map((u) => (
                    <option key={u.unite_id} value={u.unite_id}>
                      {u.unite_nom} ({u.prix} {devise})
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
                className="mt-1 w-full p-2 border rounded-md"
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
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
                modeSupport || uniteOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              }`}
            >
              <Plus className="w-5 h-5" /> Ajouter au panier
            </button>
          </form>
        </div>

        {/* Panier & Validation */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Panier en cours
            </h3>

            {panier.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">Le panier est vide pour le moment.</p>
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
                        <td className="px-4 py-3 text-sm text-gray-500">{item.prix_unitaire} {devise}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800">{item.sous_total} {devise}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveLigne(index)}
                            disabled={modeSupport}
                            title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
                            className={modeSupport ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}
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
          <div className="mt-6 border-t pt-4 space-y-4">
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Total Brut :</span>
              <span className="font-semibold text-gray-800">{totalBrut} {devise}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Remise ({devise}) :</span>
              <input
                type="number"
                min="0"
                value={remise}
                onChange={(e) => setRemise(e.target.value)}
                className="w-32 p-1 border rounded-md text-right"
              />
            </div>
            <div className="flex justify-between items-center text-lg font-bold text-gray-900 border-t pt-2">
              <span>Montant Net à Payer :</span>
              <span className="text-blue-600">{montantNet >= 0 ? montantNet : 0} {devise}</span>
            </div>

            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Mode de paiement :</span>
              <select
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value)}
                className="w-40 p-1 border rounded-md"
              >
                <option value="ESPECES">Espèces</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="CARTE">Carte bancaire</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>

            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Montant payé par le client :</span>
              <input
                type="number"
                min="0"
                value={montantPaye}
                onChange={(e) => setMontantPaye(e.target.value)}
                placeholder="0"
                className="w-32 p-1 border rounded-md text-right"
              />
            </div>

            {montantPaye !== '' && !isNaN(parseFloat(montantPaye)) && (
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Monnaie à rendre :</span>
                <span className="font-semibold text-gray-800">
                  {Math.max(parseFloat(montantPaye) - montantNet, 0)} {devise}
                </span>
              </div>
            )}

            <button
              onClick={handleSubmitVente}
              disabled={panier.length === 0 || modeSupport}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full py-3 rounded-lg text-white font-semibold transition ${
                panier.length === 0 || modeSupport ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              Valider la Vente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
