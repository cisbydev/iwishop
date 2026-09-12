import { useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { useSupportView } from '../context/supportViewContextValue';
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
  const [erreurChargement, setErreurChargement] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulaire de mouvement
  const [selectedProduit, setSelectedProduit] = useState('');
  const [typeMouvement, setTypeMouvement] = useState('ENTREE');
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [filtreType, setFiltreType] = useState('');

  const fetchProduits = async () => {
    try {
      const produits = await getAll('produits/');
      setProduits(produits);
      if (produits.length > 0) {
        setSelectedProduit(produits[0].id);
      }
    } catch (err) {
      console.error("Erreur chargement produits", err);
      setErreurChargement("Impossible de charger le stock. Vérifiez votre connexion puis réessayez.");
    }
  };

  const fetchMouvements = async (type = '') => {
    try {
      const params = type ? `?type_mouvement=${type}` : '';
      const mouvements = await getAll(`inventory/mouvements/${params}`);
      setMouvements(mouvements);
    } catch (err) {
      console.error("Erreur chargement mouvements", err);
      setErreurChargement("Impossible de charger le stock. Vérifiez votre connexion puis réessayez.");
    }
  };

  const loadStockData = async (type = filtreType) => {
    setLoading(true);
    setErreurChargement('');
    await Promise.all([fetchProduits(), fetchMouvements(type)]);
    setLoading(false);
  };

  useEffect(() => {
    const loadStock = async () => {
      await Promise.all([fetchProduits(), fetchMouvements()]);
      setLoading(false);
    };

    void loadStock();
  }, [modeSupport, boutiqueId]);

  const handleFiltreChange = async (type) => {
    setFiltreType(type);
    setLoading(true);
    setErreurChargement('');
    await fetchMouvements(type);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || modeSupport) return;
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const produitSelectionne = produits.find(p => p.id === parseInt(selectedProduit));

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement du stock...</div>;

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={() => loadStockData()} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Stock</h2>
        <p className="mt-2 text-sm text-slate-600">Enregistrez vos mouvements et suivez l'évolution de votre stock.</p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:items-start">
        {/* Formulaire de mouvement */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-600" /> Nouveau mouvement
          </h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Produit</label>
              <select
                value={selectedProduit}
                onChange={(e) => setSelectedProduit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              disabled={modeSupport || isSubmitting}
              title={modeSupport ? "Action désactivée en Vue Support (lecture seule)" : undefined}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                modeSupport || isSubmitting
                  ? 'bg-gray-300 cursor-not-allowed'
                  : typeMouvement === 'SORTIE' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {typeMouvement === 'SORTIE' ? <PackageMinus className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer le mouvement'}
            </button>
          </form>
        </section>

        {/* Historique des mouvements */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <History className="h-5 w-5 text-blue-600" /> Historique des mouvements
            </h3>
            <select
              value={filtreType}
              onChange={(e) => handleFiltreChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto"
            >
              <option value="">Tous les types</option>
              <option value="ENTREE">Entrées</option>
              <option value="SORTIE">Sorties</option>
              <option value="AJUSTEMENT">Ajustements</option>
            </select>
          </div>

          {mouvements.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-medium text-gray-800">Aucun mouvement enregistré.</p>
              <p className="mt-1 text-sm text-gray-500">Enregistrez un mouvement avec le formulaire pour suivre l'évolution du stock.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-x-auto overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 z-10 border-b border-blue-200 bg-blue-100/70">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Produit</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Type</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Qté</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Motif</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-blue-950">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mouvements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">{m.produit_nom}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TYPES_STYLES[m.type_mouvement]}`}>
                          {TYPES_LABELS[m.type_mouvement]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-800">{m.quantite}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{m.motif || '—'}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">{new Date(m.date_mouvement).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
