import { useEffect, useState } from 'react';
import { useSupportView } from '../context/supportViewContextValue';
import { useSettings } from '../context/settingsContextValue';
import { getErrorMessage, getErrorCode, CODE_PALIER_INSUFFISANT } from '../services/errorUtils';
import { formatCurrency, formatDate, couleurBadgeDette } from '../utils/formatters';
import { MODES_PAIEMENT, libelleModePaiement } from '../utils/modesPaiement';
import {
  listerClients,
  listerClientsAvecDette,
  obtenirHistoriqueClient,
  creerClient,
  enregistrerRemboursement,
  corrigerRemboursement,
} from '../services/clients';
import PremiumRequisBanner from './PremiumRequisBanner';
import { Plus, Users, Search, Phone, MapPin, X } from 'lucide-react';

const FORM_VIDE = { nom: '', telephone: '', adresse: '', plafond_credit: '' };

const STATUT_PAIEMENT_LABELS = {
  en_attente: 'En attente',
  partiel: 'Partiel',
  paye: 'Payé',
};

const STATUT_PAIEMENT_BADGES = {
  en_attente: 'bg-red-100 text-red-800',
  partiel: 'bg-yellow-100 text-yellow-800',
  paye: 'bg-green-100 text-green-800',
};

const CORRECTION_VIDE = { nouveauMontant: '', motif: '' };

// Montants au centime : évite les résidus flottants (0.1 + 0.2) dans les
// comparaisons de bornes et d'écart nul.
const arrondirCentimes = (valeur) => Math.round(valeur * 100) / 100;

// Regroupe chaque remboursement d'origine avec ses corrections (lignes
// append-only pointant vers lui via remboursement_corrige) et calcule son
// montant effectif (original + écarts des corrections).
function grouperRemboursements(remboursements) {
  const correctionsParOriginal = new Map();
  remboursements
    .filter((r) => r.remboursement_corrige != null)
    .forEach((r) => {
      const liste = correctionsParOriginal.get(r.remboursement_corrige) || [];
      liste.push(r);
      correctionsParOriginal.set(r.remboursement_corrige, liste);
    });

  return remboursements
    .filter((r) => r.remboursement_corrige == null)
    .map((original) => {
      const corrections = correctionsParOriginal.get(original.id) || [];
      const montantEffectif = arrondirCentimes(corrections.reduce(
        (total, c) => total + Number(c.montant),
        Number(original.montant),
      ));
      return { original, corrections, montantEffectif };
    });
}

function formatEcart(montant, devise) {
  const valeur = Number(montant);
  return `${valeur > 0 ? '+' : ''}${formatCurrency(valeur, devise)}`;
}

function FicheClient({ client, devise, modeSupport, premiumRefuse, estProprietaire, onClose, onRemboursementEnregistre, onNaviguerVersAbonnement }) {
  const [ventes, setVentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [montantsParVente, setMontantsParVente] = useState({});
  const [modesParVente, setModesParVente] = useState({});
  const [erreursParVente, setErreursParVente] = useState({});
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(null);
  // Une seule correction ouverte à la fois (id du remboursement d'origine).
  const [correctionOuverte, setCorrectionOuverte] = useState(null);
  const [formCorrection, setFormCorrection] = useState(CORRECTION_VIDE);
  const [erreurCorrection, setErreurCorrection] = useState('');
  const [correctionEnCours, setCorrectionEnCours] = useState(false);

  const chargerHistorique = async () => {
    setLoading(true);
    setErreur('');
    try {
      const data = await obtenirHistoriqueClient(client.id);
      setVentes(data);
    } catch (err) {
      console.error("Erreur chargement historique client", err);
      setErreur("Impossible de charger l'historique de ce client.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadHistorique = async () => {
      await chargerHistorique();
    };

    void loadHistorique();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const handleMontantChange = (venteId, valeur) => {
    setMontantsParVente((prev) => ({ ...prev, [venteId]: valeur }));
    setErreursParVente((prev) => ({ ...prev, [venteId]: '' }));
  };

  const handleModeChange = (venteId, valeur) => {
    setModesParVente((prev) => ({ ...prev, [venteId]: valeur }));
    setErreursParVente((prev) => ({ ...prev, [venteId]: '' }));
  };

  const handleSubmitRemboursement = async (vente) => {
    const montantSaisi = montantsParVente[vente.id];
    const modePaiement = modesParVente[vente.id];
    const montant = Number(montantSaisi);
    const montantDu = Number(vente.montant_du);

    // Validation frontend, en plus de la validation backend déjà en place
    // (RemboursementSerializer/enregistrer_remboursement) : jamais une
    // seule couche de validation sur un montant financier.
    if (!montantSaisi || Number.isNaN(montant) || montant <= 0) {
      setErreursParVente((prev) => ({ ...prev, [vente.id]: "Le montant doit être strictement positif." }));
      return;
    }
    if (montant > montantDu) {
      setErreursParVente((prev) => ({
        ...prev,
        [vente.id]: `Le montant dépasse le montant dû (${formatCurrency(montantDu, devise)}).`,
      }));
      return;
    }
    // Obligatoire ici (journal de caisse par mode), alors que l'API
    // l'accepte absent pour ne pas casser un frontend PWA encore en cache.
    if (!modePaiement) {
      setErreursParVente((prev) => ({ ...prev, [vente.id]: 'Choisissez le mode de paiement.' }));
      return;
    }

    setEnregistrementEnCours(vente.id);
    try {
      await enregistrerRemboursement(vente.id, montant, modePaiement);
      setMontantsParVente((prev) => ({ ...prev, [vente.id]: '' }));
      setModesParVente((prev) => ({ ...prev, [vente.id]: '' }));
      await chargerHistorique();
      onRemboursementEnregistre?.();
    } catch (err) {
      const message = getErrorCode(err) === CODE_PALIER_INSUFFISANT
        ? CODE_PALIER_INSUFFISANT
        : getErrorMessage(err, "Erreur lors de l'enregistrement du remboursement.");
      setErreursParVente((prev) => ({ ...prev, [vente.id]: message }));
    } finally {
      setEnregistrementEnCours(null);
    }
  };

  const ouvrirCorrection = (groupe) => {
    setCorrectionOuverte(groupe.original.id);
    setFormCorrection({ nouveauMontant: String(groupe.montantEffectif), motif: '' });
    setErreurCorrection('');
  };

  const fermerCorrection = () => {
    setCorrectionOuverte(null);
    setFormCorrection(CORRECTION_VIDE);
    setErreurCorrection('');
  };

  const handleSubmitCorrection = async (vente, groupe) => {
    const nouveauMontant = Number(formCorrection.nouveauMontant);
    const motif = formCorrection.motif.trim();

    // Validation frontend en miroir de corriger_remboursement() (backend) :
    // le total remboursé doit rester entre 0 et la dette initiale de la
    // vente (montant net - acompte).
    if (formCorrection.nouveauMontant === '' || Number.isNaN(nouveauMontant) || nouveauMontant < 0) {
      setErreurCorrection('Le nouveau montant doit être positif ou nul.');
      return;
    }
    if (!motif) {
      setErreurCorrection('Le motif de la correction est obligatoire.');
      return;
    }
    const ecart = arrondirCentimes(nouveauMontant - groupe.montantEffectif);
    if (ecart === 0) {
      setErreurCorrection('Le nouveau montant est identique au montant actuel.');
      return;
    }
    const detteInitiale = arrondirCentimes(Number(vente.montant_net) - Number(vente.montant_paye));
    const totalRembourse = vente.remboursements.reduce((total, r) => total + Number(r.montant), 0);
    if (arrondirCentimes(totalRembourse + ecart) > detteInitiale) {
      setErreurCorrection(
        `Cette correction ferait dépasser le montant dû (dette initiale : ${formatCurrency(detteInitiale, devise)}).`,
      );
      return;
    }

    setCorrectionEnCours(true);
    try {
      await corrigerRemboursement(groupe.original.id, nouveauMontant, motif);
      fermerCorrection();
      await chargerHistorique();
      onRemboursementEnregistre?.();
    } catch (err) {
      setErreurCorrection(getErrorMessage(err, 'Erreur lors de la correction du remboursement.'));
    } finally {
      setCorrectionEnCours(false);
    }
  };

  const peutCorriger = (vente) => estProprietaire && !modeSupport && !premiumRefuse && vente.statut !== 'ANNULEE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-slate-900">{client.nom}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {client.telephone && (
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400" /> {client.telephone}</p>
              )}
              {client.adresse && (
                <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-400" /> {client.adresse}</p>
              )}
              {client.plafond_credit != null && (
                <p>Plafond de crédit : {formatCurrency(client.plafond_credit, devise)}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Historique des ventes à crédit
        </h4>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Chargement...</p>
        ) : erreur ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {erreur}
          </div>
        ) : ventes.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Aucune vente à crédit pour ce client.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {ventes.map((vente) => {
              // Annuler ne change que le statut : montant_du et statut_paiement
              // gardent leurs valeurs d'avant, sans être dus. Statut absent
              // (backend antérieur) : affichage d'avant, jamais d'annulation
              // déduite d'un autre champ.
              const estAnnulee = vente.statut === 'ANNULEE';
              return (
              <li key={vente.id} className={`rounded-lg border border-slate-200 p-4 ${estAnnulee ? 'bg-slate-50/70' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{vente.numero}</p>
                    <p className="text-xs text-slate-500">{formatDate(vente.date_vente)}</p>
                  </div>
                  {estAnnulee ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">Annulée</span>
                  ) : (
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      STATUT_PAIEMENT_BADGES[vente.statut_paiement] || 'bg-slate-100 text-slate-700'
                    }`}>
                      {STATUT_PAIEMENT_LABELS[vente.statut_paiement] || vente.statut_paiement}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-slate-500">Net</p>
                    <p className="font-medium text-slate-900">{formatCurrency(vente.montant_net, devise)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Payé</p>
                    <p className="font-medium text-slate-900">{formatCurrency(vente.montant_paye, devise)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Dû</p>
                    {estAnnulee ? (
                      <p className="font-medium text-slate-400">—</p>
                    ) : (
                      <p className="font-medium text-red-700">{formatCurrency(vente.montant_du, devise)}</p>
                    )}
                  </div>
                </div>
                {estAnnulee && (
                  <p className="mt-2 text-xs text-slate-500">Vente annulée : le client ne doit rien sur cette vente.</p>
                )}

                {vente.remboursements.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Remboursements</p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-700">
                      {grouperRemboursements(vente.remboursements).map((groupe) => (
                        <li key={groupe.original.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              {formatDate(groupe.original.date_remboursement)} · {groupe.original.enregistre_par_nom}
                              {' · '}{libelleModePaiement(groupe.original.mode_paiement)}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className={`font-medium ${groupe.corrections.length > 0 ? 'text-slate-400 line-through' : ''}`}>
                                {formatCurrency(groupe.original.montant, devise)}
                              </span>
                              {groupe.corrections.length > 0 && (
                                <span className="font-medium">{formatCurrency(groupe.montantEffectif, devise)}</span>
                              )}
                              {peutCorriger(vente) && correctionOuverte !== groupe.original.id && (
                                <button
                                  type="button"
                                  onClick={() => ouvrirCorrection(groupe)}
                                  className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  Corriger
                                </button>
                              )}
                            </span>
                          </div>

                          {groupe.corrections.length > 0 && (
                            <ul className="mt-1 space-y-1 border-l-2 border-amber-200 pl-3">
                              {groupe.corrections.map((c) => (
                                <li key={c.id} className="text-xs text-slate-600">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                        Correction
                                      </span>
                                      <span className="truncate">{formatDate(c.date_remboursement)} · {c.enregistre_par_nom}</span>
                                    </span>
                                    <span className="shrink-0 font-medium">{formatEcart(c.montant, devise)}</span>
                                  </div>
                                  {c.motif_correction && (
                                    <p className="mt-0.5 italic text-slate-500">Motif : {c.motif_correction}</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {correctionOuverte === groupe.original.id && (
                            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700" htmlFor={`correction-montant-${groupe.original.id}`}>
                                  Nouveau montant
                                </label>
                                <input
                                  id={`correction-montant-${groupe.original.id}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={formCorrection.nouveauMontant}
                                  onChange={(e) => {
                                    setFormCorrection((prev) => ({ ...prev, nouveauMontant: e.target.value }));
                                    setErreurCorrection('');
                                  }}
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700" htmlFor={`correction-motif-${groupe.original.id}`}>
                                  Motif de la correction
                                </label>
                                <input
                                  id={`correction-motif-${groupe.original.id}`}
                                  type="text"
                                  value={formCorrection.motif}
                                  onChange={(e) => {
                                    setFormCorrection((prev) => ({ ...prev, motif: e.target.value }));
                                    setErreurCorrection('');
                                  }}
                                  placeholder="Ex. : erreur de saisie"
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              {erreurCorrection && <p className="text-xs text-red-700">{erreurCorrection}</p>}
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={fermerCorrection}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSubmitCorrection(vente, groupe)}
                                  disabled={correctionEnCours}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {correctionEnCours ? '...' : 'Valider la correction'}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Number(vente.montant_du) > 0 && !estAnnulee && !modeSupport && premiumRefuse && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <PremiumRequisBanner onNaviguerVersAbonnement={onNaviguerVersAbonnement} />
                  </div>
                )}

                {Number(vente.montant_du) > 0 && !estAnnulee && !modeSupport && !premiumRefuse && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <label className="block text-xs font-medium text-slate-700" htmlFor={`remboursement-${vente.id}`}>
                      Enregistrer un remboursement
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2 sm:flex-nowrap">
                      <input
                        id={`remboursement-${vente.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={montantsParVente[vente.id] || ''}
                        onChange={(e) => handleMontantChange(vente.id, e.target.value)}
                        placeholder="Montant"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <select
                        aria-label="Mode de paiement du remboursement"
                        value={modesParVente[vente.id] || ''}
                        onChange={(e) => handleModeChange(vente.id, e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-40 sm:flex-none"
                      >
                        <option value="">Mode...</option>
                        {MODES_PAIEMENT.map((mode) => (
                          <option key={mode.valeur} value={mode.valeur}>{mode.libelle}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleSubmitRemboursement(vente)}
                        disabled={enregistrementEnCours === vente.id}
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {enregistrementEnCours === vente.id ? '...' : 'Enregistrer'}
                      </button>
                    </div>
                    {erreursParVente[vente.id] && (
                      erreursParVente[vente.id] === CODE_PALIER_INSUFFISANT ? (
                        <div className="mt-2">
                          <PremiumRequisBanner onNaviguerVersAbonnement={onNaviguerVersAbonnement} />
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-red-700">{erreursParVente[vente.id]}</p>
                      )
                    )}
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Clients({ onNaviguerVersAbonnement }) {
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const { parametres, aAccesPremium, utilisateur } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const estProprietaire = Boolean(utilisateur?.est_proprietaire);
  // Tant que le palier n'est pas confirmé à false, on n'empêche rien
  // (cf. SettingsContext : null pendant le chargement, jamais bloquant).
  const premiumRefuse = aAccesPremium === false;

  const [clients, setClients] = useState([]);
  const [dettesParClientId, setDettesParClientId] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [recherche, setRecherche] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [showAjoutModal, setShowAjoutModal] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreurAjout, setErreurAjout] = useState('');

  const [clientSelectionne, setClientSelectionne] = useState(null);

  const updateForm = (champ, valeur) => setForm((prev) => ({ ...prev, [champ]: valeur }));

  const fetchClients = async () => {
    setLoading(true);
    setErreurChargement('');
    try {
      const [listeClients, listeAvecDette] = await Promise.all([
        listerClients(),
        listerClientsAvecDette(),
      ]);
      setClients(listeClients);
      setDettesParClientId(new Map(listeAvecDette.map((c) => [
        c.id, { total: c.dette_totale, plusAncienneDette: c.plus_ancienne_dette },
      ])));
    } catch (err) {
      console.error("Erreur chargement clients", err);
      setErreurChargement("Impossible de charger les clients. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadClients = async () => {
      await fetchClients();
    };

    void loadClients();
  }, [modeSupport, boutiqueId]);

  const clientsFiltres = clients.filter((c) =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.telephone || '').includes(recherche)
  );

  const ouvrirAjout = () => {
    setForm(FORM_VIDE);
    setErreurAjout('');
    setShowAjoutModal(true);
  };

  const fermerAjout = () => {
    setShowAjoutModal(false);
    setForm(FORM_VIDE);
    setErreurAjout('');
  };

  const handleSubmitAjout = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    // Défense en profondeur en plus du `required` HTML (qui n'empêche pas
    // un téléphone composé uniquement d'espaces), même règle que
    // ClientSerializer.validate_telephone côté backend.
    if (!form.telephone.trim()) {
      alert("Le téléphone est obligatoire.");
      return;
    }
    setErreurAjout('');
    setIsSaving(true);
    try {
      await creerClient({
        nom: form.nom,
        telephone: form.telephone,
        adresse: form.adresse,
        plafond_credit: form.plafond_credit === '' ? null : form.plafond_credit,
      });
      fermerAjout();
      fetchClients();
    } catch (err) {
      if (getErrorCode(err) === CODE_PALIER_INSUFFISANT) {
        setErreurAjout(CODE_PALIER_INSUFFISANT);
      } else {
        alert(getErrorMessage(err, "Erreur lors de la création du client."));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des clients...</div>;

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={fetchClients} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-[1280px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Clients</h2>
            <p className="mt-2 text-sm text-slate-600">Gérez vos clients et leurs ventes à crédit.</p>
          </div>
          <button
            onClick={ouvrirAjout}
            disabled={modeSupport || premiumRefuse}
            title={
              modeSupport
                ? "Action désactivée en Vue Support (lecture seule)"
                : premiumRefuse
                  ? "La gestion des clients à crédit fait partie du palier Premium."
                  : undefined
            }
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto ${
              modeSupport || premiumRefuse ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <Plus className="h-5 w-5" /> Ajouter un client
          </button>
        </div>

        <div className="relative mt-5 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client par nom ou téléphone..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </section>

      {clients.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
          <p className="font-medium text-gray-800">Aucun client enregistré.</p>
          <p className="mt-1 text-sm text-gray-500">Ajoutez un client pour lui proposer une vente à crédit.</p>
          {!modeSupport && (
            premiumRefuse ? (
              <div className="mt-4 mx-auto max-w-sm">
                <PremiumRequisBanner onNaviguerVersAbonnement={onNaviguerVersAbonnement} />
              </div>
            ) : (
              <button
                type="button"
                onClick={ouvrirAjout}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <Plus className="w-5 h-5" /> Ajouter un client
              </button>
            )
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${
          clientsFiltres.length === 1
            ? 'mx-auto max-w-[30rem]'
            : clientsFiltres.length === 2
              ? 'mx-auto max-w-[56rem] md:grid-cols-2'
              : 'md:grid-cols-2 xl:grid-cols-3'
        }`}>
          {clientsFiltres.map((c) => {
            const infoDette = dettesParClientId.get(c.id);
            const detteTotale = Number(infoDette?.total || 0);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setClientSelectionne(c)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <Users className="h-5 w-5" />
                    </div>
                    <h3 className="truncate font-semibold text-slate-900">{c.nom}</h3>
                  </div>
                  {detteTotale > 0 && (
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${couleurBadgeDette(infoDette?.plusAncienneDette)}`}>
                      Doit {formatCurrency(detteTotale, devise)}
                    </span>
                  )}
                </div>
                <div className="mt-4 space-y-2 pl-14 text-sm text-slate-600">
                  {c.telephone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" /> {c.telephone}
                    </p>
                  )}
                  {c.adresse && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> {c.adresse}
                    </p>
                  )}
                  {!c.telephone && !c.adresse && (
                    <p className="italic text-slate-400">Aucune coordonnée renseignée</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {clientsFiltres.length === 0 && recherche !== '' && clients.length > 0 && (
        <p className="text-center text-gray-500 py-8">
          Aucun client ne correspond à "{recherche}".
        </p>
      )}

      {/* Modal d'ajout de client */}
      {showAjoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-[30rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 className="mb-5 text-xl font-semibold text-slate-900">Ajouter un nouveau client</h3>
            {erreurAjout === CODE_PALIER_INSUFFISANT && (
              <div className="mb-5">
                <PremiumRequisBanner onNaviguerVersAbonnement={onNaviguerVersAbonnement} />
              </div>
            )}
            <form onSubmit={handleSubmitAjout} className="space-y-5">
              <div>
                <label htmlFor="client-nom" className="block text-sm font-medium text-slate-700">Nom du client</label>
                <input
                  id="client-nom"
                  type="text"
                  value={form.nom}
                  onChange={(e) => updateForm('nom', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label htmlFor="client-telephone" className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input
                  id="client-telephone"
                  type="text"
                  value={form.telephone}
                  onChange={(e) => updateForm('telephone', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label htmlFor="client-adresse" className="block text-sm font-medium text-slate-700">Adresse (optionnel)</label>
                <textarea
                  id="client-adresse"
                  value={form.adresse}
                  onChange={(e) => updateForm('adresse', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  rows="2"
                />
              </div>
              <div>
                <label htmlFor="client-plafond" className="block text-sm font-medium text-slate-700">Plafond de crédit (optionnel)</label>
                <input
                  id="client-plafond"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.plafond_credit}
                  onChange={(e) => updateForm('plafond_credit', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={fermerAjout}
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
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fiche détaillée du client */}
      {clientSelectionne && (
        <FicheClient
          client={clientSelectionne}
          devise={devise}
          modeSupport={modeSupport}
          premiumRefuse={premiumRefuse}
          estProprietaire={estProprietaire}
          onClose={() => setClientSelectionne(null)}
          onRemboursementEnregistre={fetchClients}
          onNaviguerVersAbonnement={onNaviguerVersAbonnement}
        />
      )}
    </div>
  );
}
