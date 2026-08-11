import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSupportView } from '../context/SupportViewContext';
import { getErrorMessage } from '../services/errorUtils';
import { PackagePlus, PackageMinus, ClipboardList, History } from 'lucide-react';

const TYPES_LABELS = {
  ENTREE: 'Entrée de stock',
  SORTIE: 'Sortie de stock',
  AJUSTEMENT: "Ajustement d'inventaire",
};

const TYPES_STYLES = {
  ENTREE: 'bg-green-100 text-green-800',
  SORTIE: 'bg-red-100 text-red-800',
  AJUSTEMENT: 'bg-yellow-100 text-yellow-800',
};

export default function Stock() {
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [produits, setProduits] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulaire de mouvement
  const [selectedProduit, setSelectedProduit] = useState('');
  const [typeMouvement, setTypeMouvement] = useState('ENTREE');
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [filtreType, setFiltreType] = useState('');

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

  const fetchMouvements = async (type = '') => {
    try {
      const params = type ? `?type_mouvement=${type}` : '';
      const response = await api.get(`inventory/mouvements/${params}`);
      setMouvements(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement mouvements", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduits();
    fetchMouvements();
  }, [modeSupport, boutiqueId]);

  const handleFiltreChange = (type) => {
    setFiltreType(type);
    fetchMouvements(type);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modeSupport) return;
    try {
      await api.post('inventory/mouvements/', {
        produit: selectedProduit,
        type_mouvement: typeMouvement,
        quantite: parseInt(quantite),
        motif: motif || null,
      });
      setQuantite('');
      setMotif('');
      fetchMouvements(filtreType);
      fetchProduits(); // Rafraîchir les stocks affichés dans le sélecteur
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement du mouvement."));
    }
  };

  const produitSelectionne = produits.find(p => p.id === parseInt(selectedProduit));

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement du stock...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Gestion du Stock</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire de mouvement */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Nouveau mouvement
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Produit</label>
              <select
                value={selectedProduit}
                onChange={(e) => setSelectedProduit(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
              >
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (Stock actuel : {p.quantite_en_stock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type de mouvement</label>
              <select
                value={typeMouvement}
                onChange={(e) => setTypeMouvement(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
              >
                <option value="ENTREE">Entrée de stock</option>
                <option value="SORTIE">Sortie de stock</option>
                <option value="AJUSTEMENT">Ajustement d'inventaire</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                {typeMouvement === 'AJUSTEMENT' ? 'Quantité réelle constatée' : 'Quantité'}
              </label>
              <input
                type="number"
                min="0"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
                required
              />
              {typeMouvement === 'AJUSTEMENT' && produitSelectionne && (
                <p className="text-xs text-gray-500 mt-1">
                  Le stock sera fixé exactement à cette valeur (stock actuel : {produitSelectionne.quantite_en_stock}).
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Motif (optionnel)</label>
              <input
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex: Réception fournisseur, casse, comptage..."
                className="mt-1 w-full p-2 border rounded-md"
              />
            </div>

            <button
              type="submit"
              disabled={modeSupport}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition ${
                modeSupport
                  ? 'bg-gray-300 cursor-not-allowed'
                  : typeMouvement === 'SORTIE' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {typeMouvement === 'SORTIE' ? <PackageMinus className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
              Enregistrer le mouvement
            </button>
          </form>
        </div>

        {/* Historique des mouvements */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <History className="w-5 h-5" /> Historique des mouvements
            </h3>
            <select
              value={filtreType}
              onChange={(e) => handleFiltreChange(e.target.value)}
              className="p-2 border rounded-md text-sm"
            >
              <option value="">Tous les types</option>
              <option value="ENTREE">Entrées</option>
              <option value="SORTIE">Sorties</option>
              <option value="AJUSTEMENT">Ajustements</option>
            </select>
          </div>

          {mouvements.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">Aucun mouvement enregistré.</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qté</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Motif</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mouvements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.produit_nom}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${TYPES_STYLES[m.type_mouvement]}`}>
                          {TYPES_LABELS[m.type_mouvement]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{m.quantite}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{m.motif || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(m.date_mouvement).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
