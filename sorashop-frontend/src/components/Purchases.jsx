import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
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

  const [selectedFournisseur, setSelectedFournisseur] = useState('');
  const [notes, setNotes] = useState('');
  const [panier, setPanier] = useState([]);

  const [selectedProduit, setSelectedProduit] = useState('');
  const [selectedUniteId, setSelectedUniteId] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState('');

  const [successMessage, setSuccessMessage] = useState('');

  // Recharge uniquement les produits (stock à jour après un achat) sans
  // retoucher aux unités, qui ne changent pas en cours de session.
  const fetchProduits = async () => {
    try {
      const response = await api.get('produits/');
      setProduits(response.data);
      if (response.data.length > 0) setSelectedProduit(response.data[0].id);
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

      // Les unités disponibles à l'achat pour un produit sont les mêmes
      // que celles configurées pour sa vente (ProduitPrix) : c'est la
      // liste des unités pertinentes pour ce produit, indépendamment du
      // prix de vente qui y est attaché (non utilisé ici, l'achat a son
      // propre prix négocié).
      const rangUnite = (nom) => (nom === 'Unité' ? 0 : nom === 'Douzaine' ? 1 : 2);
      const map = {};
      prixRes.data.forEach((p) => {
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

      setProduits(produitsRes.data);
      setUnitesParProduit(map);
      if (produitsRes.data.length > 0) setSelectedProduit(produitsRes.data[0].id);
    } catch (err) {
      console.error("Erreur chargement catalogue", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFournisseurs = async () => {
    try {
      const response = await api.get('fournisseurs/');
      setFournisseurs(response.data);
      if (response.data.length > 0) setSelectedFournisseur(response.data[0].id);
    } catch (err) {
      console.error("Erreur chargement fournisseurs", err);
    }
  };

  const fetchAchats = async () => {
    try {
      const response = await api.get('achats/');
      setAchats(response.data);
    } catch (err) {
      console.error("Erreur chargement achats", err);
    }
  };

  useEffect(() => {
    fetchCatalogue();
    fetchFournisseurs();
    fetchAchats();
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
    if (modeSupport) return;
    if (panier.length === 0) {
      alert("Ajoute au moins un produit à l'achat.");
      return;
    }
    if (!selectedFournisseur) {
      alert("Sélectionne un fournisseur.");
      return;
    }

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
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Achats Fournisseurs</h2>

      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire d'ajout au panier */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5" /> Nouvel achat
          </h3>

          {fournisseurs.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucun fournisseur enregistré. Ajoute d'abord un fournisseur dans l'onglet "Fournisseurs".
            </p>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Fournisseur</label>
                <select
                  value={selectedFournisseur}
                  onChange={(e) => setSelectedFournisseur(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                >
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleAddLigne} className="space-y-4 border-t pt-4">
                <p className="text-sm font-medium text-gray-700">Ajouter un produit à l'achat</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Produit</label>
                  <select
                    value={selectedProduit}
                    onChange={(e) => setSelectedProduit(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-md"
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
                      className="mt-1 w-full p-2 border rounded-md"
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
                    className="mt-1 w-full p-2 border rounded-md"
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
                        ? "Aucune unité configurée pour ce produit"
                        : undefined
                  }
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
                    modeSupport || uniteOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  <Plus className="w-5 h-5" /> Ajouter à l'achat
                </button>
              </form>
            </>
          )}
        </div>

        {/* Panier de l'achat en cours */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Détail de l'achat</h3>

            {panier.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">Aucun produit ajouté pour le moment.</p>
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
                        <td className="px-4 py-3 text-sm text-gray-500">{item.prix_unitaire_achat} {devise}</td>
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
              <span className="text-blue-600">{totalAchat} {devise}</span>
            </div>

            <button
              onClick={handleSubmitAchat}
              disabled={panier.length === 0 || modeSupport}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full py-3 rounded-lg text-white font-semibold transition ${
                panier.length === 0 || modeSupport ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              Valider l'Achat
            </button>
          </div>
        </div>
      </div>

      {/* Historique des achats */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <History className="w-5 h-5" /> Historique des achats
        </h3>

        {achats.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">Aucun achat enregistré pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fournisseur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Détail</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {achats.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">#{a.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{a.fournisseur_nom || 'Inconnu'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(a.date_achat).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <ul className="space-y-1">
                        {a.lignes && a.lignes.map((ligne, idx) => (
                          <li key={idx} className="text-xs bg-gray-50 p-1.5 rounded border border-gray-100">
                            <span className="font-medium text-gray-800">{ligne.produit_nom}</span>
                            {' '}- {ligne.quantite} ({ligne.unite_nom}) x {ligne.prix_unitaire_achat} {devise}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{a.montant_total} {devise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
