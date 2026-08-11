import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { ShoppingCart, Plus, Trash2, CheckCircle } from 'lucide-react';

export default function Sales() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [panier, setPanier] = useState([]);
  const [selectedProduit, setSelectedProduit] = useState('');
  const [typeVente, setTypeVente] = useState('UNITE');
  const [quantite, setQuantite] = useState(1);
  const [remise, setRemise] = useState(0);
  const [montantPaye, setMontantPaye] = useState('');
  const [modePaiement, setModePaiement] = useState('ESPECES');
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchProduits = async () => {
    try {
      const response = await api.get('produits/');
      setProduits(response.data);
      if (response.data.length > 0) {
        setSelectedProduit(response.data[0].id);
      }
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduits();
  }, []);

  const handleAddLigne = (e) => {
    e.preventDefault();
    if (modeSupport) return;
    const prod = produits.find(p => p.id === parseInt(selectedProduit));
    if (!prod) return;

    // Vérification du stock selon les règles métier
    const qteNum = parseInt(quantite);
    const unitesRequises = typeVente === 'DOUZAINE' ? qteNum * 12 : qteNum;
    if (unitesRequises > prod.quantite_en_stock) {
      alert(`Stock insuffisant ! Stock disponible en unités : ${prod.quantite_en_stock}`);
      return;
    }

    const prixUnitaireApplique = typeVente === 'DOUZAINE' ? prod.prix_douzaine : prod.prix_unitaire;
    const sousTotal = prixUnitaireApplique * qteNum;

    const nouvelleLigne = {
      produit_id: prod.id,
      nom: prod.nom,
      type_vente: typeVente,
      quantite: qteNum,
      prix_unitaire: prixUnitaireApplique,
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
          type_vente: item.type_vente,
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
              <select
                value={typeVente}
                onChange={(e) => setTypeVente(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
              >
                <option value="UNITE">À l'unité</option>
                <option value="DOUZAINE">Par douzaine (12 unités)</option>
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

            <button
              type="submit"
              disabled={modeSupport}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition ${
                modeSupport ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
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
                        <td className="px-4 py-3 text-sm text-gray-500">{item.type_vente}</td>
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
