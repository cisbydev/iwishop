import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { Truck, Plus, Trash2, CheckCircle, History } from 'lucide-react';

export default function Purchases() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [achats, setAchats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedFournisseur, setSelectedFournisseur] = useState('');
  const [notes, setNotes] = useState('');
  const [panier, setPanier] = useState([]);

  const [selectedProduit, setSelectedProduit] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState('');

  const [successMessage, setSuccessMessage] = useState('');

  const fetchProduits = async () => {
    try {
      const response = await api.get('produits/');
      setProduits(response.data);
      if (response.data.length > 0) setSelectedProduit(response.data[0].id);
    } catch (err) {
      console.error("Erreur chargement produits", err);
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
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement achats", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduits();
    fetchFournisseurs();
    fetchAchats();
  }, []);

  const handleAddLigne = (e) => {
    e.preventDefault();
    if (modeSupport) return;
    const prod = produits.find(p => p.id === parseInt(selectedProduit));
    if (!prod) return;

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

    const nouvelleLigne = {
      produit_id: prod.id,
      nom: prod.nom,
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
                  <label className="block text-sm font-medium text-gray-700">Prix d'achat unitaire</label>
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
                  disabled={modeSupport}
                  title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
                    modeSupport ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
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
                            {' '}- {ligne.quantite} x {ligne.prix_unitaire_achat} {devise}
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
