import { useCallback, useEffect, useState } from 'react';
import api, { getAll } from '../services/api';
import { ajouterVenteEnAttente } from '../services/offlineQueue';
import { sauvegarderCatalogue, chargerCatalogueCache } from '../services/catalogueCache';
import { listerClients, creerClient } from '../services/clients';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { ShoppingCart, Plus, Trash2, CheckCircle, WifiOff, CloudOff, X } from 'lucide-react';

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
  // Vente à crédit (V2) : décochée par défaut, le flux comptant ci-dessus
  // reste inchangé tant qu'elle n'est pas activée.
  const [venteACredit, setVenteACredit] = useState(false);
  const [clientCreditMode, setClientCreditMode] = useState('existant'); // 'existant' | 'nouveau'
  const [clientCreditId, setClientCreditId] = useState('');
  const [clientsCredit, setClientsCredit] = useState([]);
  const [clientsCreditCharges, setClientsCreditCharges] = useState(false);
  const [chargementClientsCredit, setChargementClientsCredit] = useState(false);
  const [rechercheClient, setRechercheClient] = useState('');
  const [nouveauClientNom, setNouveauClientNom] = useState('');
  const [nouveauClientTelephone, setNouveauClientTelephone] = useState('');
  const [acompte, setAcompte] = useState('');
  const [avertissementCredit, setAvertissementCredit] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [venteEnAttenteMessage, setVenteEnAttenteMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Date de la dernière sauvegarde du catalogue utilisé (cf. catalogueCache) -
  // non nul tant que l'écran affiche des données issues du cache plutôt que
  // du dernier chargement réseau réussi. Reste affiché en permanence, pas
  // seulement au moment du chargement.
  const [catalogueHorsLigne, setCatalogueHorsLigne] = useState(null);

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

  // Dérive prixParUnite des 3 tableaux bruts (produits, prix, unités) tels
  // que renvoyés par l'API - réutilisé à l'identique que ces tableaux
  // viennent d'un chargement réseau frais ou du cache hors ligne
  // (catalogueCache), pour ne jamais dupliquer cette logique.
  const appliquerCatalogue = useCallback((produitsRecus, prixRecus, unitesRecues) => {
    const facteurParUnite = {};
    unitesRecues.forEach((u) => {
      facteurParUnite[u.id] = parseFloat(u.facteur_conversion);
    });

    const rangUnite = (nom) => (nom === 'Unité' ? 0 : nom === 'Douzaine' ? 1 : 2);
    const map = {};
    prixRecus.forEach((p) => {
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

    setProduits(produitsRecus);
    setPrixParUnite(map);
    if (produitsRecus.length > 0) {
      setSelectedProduit(produitsRecus[0].id);
    }
  }, []);

  // useCallback (deps []) : aucune valeur réactive (state/props) n'est lue
  // par cette fonction, seulement des setters stables et des paramètres -
  // une référence stable permet de la lister honnêtement dans les deps de
  // l'effet ci-dessous sans le faire re-déclencher à chaque rendu.
  const fetchCatalogue = useCallback(async () => {
    try {
      const [produits, prix, unites] = await Promise.all([
        getAll('produits/'),
        getAll('produits/prix/'),
        getAll('produits/unites-vente/'),
      ]);

      appliquerCatalogue(produits, prix, unites);
      // Un chargement réseau frais réussi rend le cache précédent obsolète
      // du point de vue de l'affichage (le bandeau, s'il était visible,
      // n'a plus lieu d'être) - le cache lui-même est mis à jour juste après.
      setCatalogueHorsLigne(null);

      // Sauvegarde silencieuse pour un futur démarrage hors ligne. Ne doit
      // jamais faire échouer l'affichage du catalogue si elle échoue
      // elle-même (ex: IndexedDB indisponible ou quota dépassé) : erreur
      // avalée, uniquement tracée.
      sauvegarderCatalogue({ produits, prix, unites }).catch((erreurCache) => {
        console.error("Erreur sauvegarde du catalogue hors ligne :", erreurCache);
      });
    } catch (err) {
      if (!err.response) {
        // Panne réseau réelle (pas une erreur serveur/validation) : on
        // retombe sur le dernier catalogue connu plutôt que de bloquer
        // tout l'écran, quitte à l'afficher avec des données possiblement
        // périmées (bandeau permanent, cf. rendu ci-dessous).
        try {
          const cache = await chargerCatalogueCache();
          if (cache) {
            appliquerCatalogue(cache.produits, cache.prix, cache.unites);
            setCatalogueHorsLigne(cache.derniere_maj);
            return;
          }
        } catch (erreurCache) {
          console.error("Erreur lecture du cache catalogue hors ligne :", erreurCache);
        }
      }

      // Erreur serveur/validation, ou panne réseau sans aucun cache
      // disponible (tout premier lancement de l'app sans jamais avoir été
      // en ligne) : rien d'autre à faire que le message d'erreur actuel.
      console.error("Erreur chargement catalogue", err);
      setErreurChargement("Impossible de charger les données de vente. Vérifiez votre connexion puis réessayez.");
    }
  }, [appliquerCatalogue]);

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
  }, [modeSupport, boutiqueId, fetchCatalogue]);

  // Chargé une seule fois, à la demande (pas au montage de l'écran) : la
  // grande majorité des ventes restent au comptant et n'ont jamais besoin
  // de cette liste.
  useEffect(() => {
    if (!venteACredit || clientsCreditCharges) return;

    const chargerClientsCredit = async () => {
      setChargementClientsCredit(true);
      try {
        const liste = await listerClients();
        setClientsCredit(liste);
        setClientsCreditCharges(true);
      } catch (err) {
        console.error("Erreur chargement clients", err);
      } finally {
        setChargementClientsCredit(false);
      }
    };

    void chargerClientsCredit();
  }, [venteACredit, clientsCreditCharges]);

  const resetFormulaireCredit = () => {
    setClientCreditMode('existant');
    setClientCreditId('');
    setNouveauClientNom('');
    setNouveauClientTelephone('');
    setRechercheClient('');
    setAcompte('');
  };

  const handleToggleCredit = (checked) => {
    setVenteACredit(checked);
    setAvertissementCredit('');
    if (!checked) {
      resetFormulaireCredit();
    }
  };

  const uniteOptions = prixParUnite[parseInt(selectedProduit)] || [];
  // L'unité choisie par l'utilisateur peut ne plus s'appliquer au produit
  // qui vient d'être sélectionné (ex: elle n'existe pas pour ce produit) :
  // on retombe alors sur la première unité disponible, dérivée au rendu
  // plutôt que synchronisée via un effet.
  const uniteIdEffectif = uniteOptions.some(u => u.unite_id === parseInt(selectedUniteId))
    ? parseInt(selectedUniteId)
    : (uniteOptions[0]?.unite_id ?? '');

  const clientsCreditFiltres = clientsCredit.filter((c) =>
    c.nom.toLowerCase().includes(rechercheClient.toLowerCase()) ||
    (c.telephone || '').includes(rechercheClient)
  );

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

    let clientCreditIdEffectif = clientCreditId;
    const acompteNum = acompte === '' ? 0 : parseFloat(acompte);

    if (venteACredit) {
      // Le sélecteur de client est obligatoire pour une vente à crédit -
      // impossible de créer une dette sans savoir à qui elle appartient.
      if (clientCreditMode === 'existant' && !clientCreditId) {
        alert("Sélectionnez un client pour une vente à crédit.");
        return;
      }
      if (clientCreditMode === 'nouveau' && (!nouveauClientNom.trim() || !nouveauClientTelephone.trim())) {
        alert("Le nom et le téléphone du nouveau client sont obligatoires.");
        return;
      }
      // Même règle que VenteSerializer.create() côté backend (0 <= acompte
      // <= montant net) : validée ici aussi pour un retour immédiat.
      if (isNaN(acompteNum) || acompteNum < 0 || acompteNum > montantNet) {
        alert(`L'acompte doit être compris entre 0 et le montant net (${formatCurrency(montantNet, devise)}).`);
        return;
      }
    } else {
      const paye = parseFloat(montantPaye);
      if (isNaN(paye) || paye < montantNet) {
        alert(`Le montant payé (${formatCurrency(montantPaye || 0, devise)}) est inférieur au montant net à payer (${formatCurrency(montantNet, devise)}).`);
        return;
      }
    }

    setIsSubmitting(true);

    if (venteACredit && clientCreditMode === 'nouveau') {
      try {
        const nouveauClient = await creerClient({
          nom: nouveauClientNom.trim(),
          telephone: nouveauClientTelephone.trim(),
        });
        clientCreditIdEffectif = nouveauClient.id;
      } catch (err) {
        alert(getErrorMessage(err, "Erreur lors de la création du nouveau client."));
        setIsSubmitting(false);
        return;
      }
    }

    const payload = {
      remise: parseFloat(remise) || 0,
      montant_paye: venteACredit ? acompteNum : parseFloat(montantPaye),
      mode_paiement: modePaiement,
      lignes: panier.map(item => ({
        produit: item.produit_id,
        unite: item.unite_id,
        quantite: item.quantite,
        prix_applique: item.prix_unitaire,
      })),
      ...(venteACredit ? { client_credit: Number(clientCreditIdEffectif) } : {}),
    };

    try {
      const response = await api.post('ventes/', payload);
      setSuccessMessage("Vente enregistrée avec succès ! Stock mis à jour.");
      // Avertissement non bloquant (plafond de crédit dépassé, cf.
      // VenteViewSet.create()) : la vente est déjà créée à ce stade.
      if (response.data?.avertissement) {
        setAvertissementCredit(response.data.avertissement);
      }
      setPanier([]);
      setRemise(0);
      setMontantPaye('');
      setVenteACredit(false);
      resetFormulaireCredit();
      fetchProduits(); // Recharger les produits pour actualiser les stocks affichés
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      if (!err.response) {
        // Aucune réponse serveur du tout (panne réseau réelle, distincte
        // d'un 400/401 qui suppose que le serveur a été joint) : la vente
        // a bien eu lieu physiquement en boutique, elle est mise en file
        // d'attente locale (IndexedDB) plutôt que perdue - elle sera
        // rejouée automatiquement dès le retour du réseau (cf. syncEngine).
        try {
          await ajouterVenteEnAttente(payload);
          setVenteEnAttenteMessage("Vente enregistrée - sera envoyée dès que la connexion revient.");
          setPanier([]);
          setRemise(0);
          setMontantPaye('');
          setTimeout(() => setVenteEnAttenteMessage(''), 4000);
        } catch (erreurFileAttente) {
          console.error("Erreur mise en file d'attente hors ligne :", erreurFileAttente);
          alert("Impossible d'enregistrer la vente, même hors ligne. Réessayez.");
        }
      } else {
        console.error("Erreur vente :", err.response?.data || err);
        alert(getErrorMessage(err, "Erreur lors de l'enregistrement de la vente."));
      }
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
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Ventes</h2>
        <p className="mt-2 text-sm text-slate-600">Préparez le panier, appliquez les remises et finalisez les ventes de votre boutique.</p>
      </section>

      {catalogueHorsLigne && (
        <div
          role="status"
          className="rounded-lg bg-amber-500 px-4 py-2 flex items-center gap-2 text-white"
        >
          <CloudOff className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            Catalogue hors ligne - dernières données du {formatDateTime(catalogueHorsLigne)}. Le stock affiché peut être dépassé.
          </span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> {successMessage}
        </div>
      )}

      {venteEnAttenteMessage && (
        <div className="p-4 bg-amber-100 text-amber-800 rounded-lg flex items-center gap-2">
          <WifiOff className="w-5 h-5" /> {venteEnAttenteMessage}
        </div>
      )}

      {avertissementCredit && (
        <div className="p-4 bg-orange-100 text-orange-800 rounded-lg flex items-start justify-between gap-3">
          <span className="text-sm">{avertissementCredit}</span>
          <button
            type="button"
            onClick={() => setAvertissementCredit('')}
            aria-label="Fermer l'avertissement"
            className="shrink-0 text-orange-700 hover:text-orange-900"
          >
            <X className="h-4 w-4" />
          </button>
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

            <div className="rounded-lg border border-slate-200 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={venteACredit}
                  onChange={(e) => handleToggleCredit(e.target.checked)}
                  disabled={modeSupport}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Vente à crédit
              </label>

              {venteACredit && (
                <div className="mt-4 space-y-4">
                  {clientCreditMode === 'nouveau' ? (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nouveau client</p>
                        <button
                          type="button"
                          onClick={() => setClientCreditMode('existant')}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Choisir un client existant
                        </button>
                      </div>
                      <div>
                        <label htmlFor="credit-nouveau-nom" className="block text-xs font-medium text-slate-700">Nom</label>
                        <input
                          id="credit-nouveau-nom"
                          type="text"
                          value={nouveauClientNom}
                          onChange={(e) => setNouveauClientNom(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label htmlFor="credit-nouveau-telephone" className="block text-xs font-medium text-slate-700">Téléphone</label>
                        <input
                          id="credit-nouveau-telephone"
                          type="text"
                          value={nouveauClientTelephone}
                          onChange={(e) => setNouveauClientTelephone(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  ) : clientCreditId ? (
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                      <span className="text-sm font-medium text-blue-900">
                        {clientsCredit.find((c) => c.id === Number(clientCreditId))?.nom || 'Client sélectionné'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setClientCreditId('')}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Changer
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="credit-recherche-client" className="block text-xs font-medium text-slate-700">Client</label>
                      <input
                        id="credit-recherche-client"
                        type="text"
                        value={rechercheClient}
                        onChange={(e) => setRechercheClient(e.target.value)}
                        placeholder="Rechercher par nom ou téléphone..."
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-100">
                        {chargementClientsCredit ? (
                          <p className="p-3 text-sm text-slate-500">Chargement des clients...</p>
                        ) : (
                          <>
                            {clientsCreditFiltres.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setClientCreditId(String(c.id))}
                                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                {c.nom} {c.telephone && <span className="text-slate-400">· {c.telephone}</span>}
                              </button>
                            ))}
                            {clientsCreditFiltres.length === 0 && (
                              <p className="p-3 text-sm text-slate-500">Aucun client ne correspond à cette recherche.</p>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setClientCreditMode('nouveau')}
                          className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
                        >
                          + Nouveau client
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="credit-acompte" className="block text-xs font-medium text-slate-700">Acompte (optionnel)</label>
                    <input
                      id="credit-acompte"
                      type="number"
                      min="0"
                      step="0.01"
                      value={acompte}
                      onChange={(e) => setAcompte(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Restera dû :</span>
                    <span className="font-semibold text-red-700">
                      {formatCurrency(Math.max(montantNet - (parseFloat(acompte) || 0), 0), devise)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {!venteACredit && (
              <>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span id="montant-paye-label">Montant payé par le client :</span>
                  <input
                    type="number"
                    min="0"
                    aria-labelledby="montant-paye-label"
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
              </>
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
