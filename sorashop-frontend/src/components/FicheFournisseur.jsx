import { useEffect, useState } from 'react';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency, formatDate } from '../utils/formatters';
import { MODES_PAIEMENT, libelleModePaiement } from '../utils/modesPaiement';
import {
  obtenirHistoriqueFournisseur,
  enregistrerPaiementFournisseur,
  corrigerPaiementFournisseur,
} from '../services/fournisseurs';
import { Phone, X } from 'lucide-react';

const CORRECTION_VIDE = { nouveauMontant: '', motif: '' };

// Statut de paiement d'un achat à crédit, tel que renvoyé par l'API.
const STATUT_PAIEMENT_LABELS = {
  en_attente: 'En attente',
  partiel: 'Partiel',
  paye: 'Soldé',
};

const STATUT_PAIEMENT_BADGES = {
  en_attente: 'bg-red-100 text-red-800',
  partiel: 'bg-yellow-100 text-yellow-800',
  paye: 'bg-green-100 text-green-800',
};

// Affichage seul (même rendu que dans Clients.jsx, D8) : l'écart vient de
// l'API, il n'est pas calculé ici.
function formatEcart(montant, devise) {
  const valeur = Number(montant);
  return `${valeur > 0 ? '+' : ''}${formatCurrency(valeur, devise)}`;
}

// Fiche d'un fournisseur : ses achats à crédit, leurs paiements et
// corrections. Aucun montant calculé (CLAUDE.md, D8) : montant_effectif,
// total_paiements et montant_du viennent de l'API ; les bornes (montant dû,
// montant identique...) sont vérifiées par le serveur, dont le message est
// affiché tel quel.
export default function FicheFournisseur({ fournisseur, dette, devise, modeSupport, estProprietaire, onClose, onPaiementEnregistre }) {
  const [achats, setAchats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [montantsParAchat, setMontantsParAchat] = useState({});
  const [modesParAchat, setModesParAchat] = useState({});
  const [erreursParAchat, setErreursParAchat] = useState({});
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(null);
  // Une seule correction ouverte à la fois (id du paiement d'origine).
  const [correctionOuverte, setCorrectionOuverte] = useState(null);
  const [formCorrection, setFormCorrection] = useState(CORRECTION_VIDE);
  const [erreurCorrection, setErreurCorrection] = useState('');
  const [correctionEnCours, setCorrectionEnCours] = useState(false);

  const chargerHistorique = async () => {
    setLoading(true);
    setErreur('');
    try {
      const data = await obtenirHistoriqueFournisseur(fournisseur.id);
      setAchats(data);
    } catch (err) {
      console.error("Erreur chargement historique fournisseur", err);
      setErreur("Impossible de charger l'historique de ce fournisseur.");
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
  }, [fournisseur.id]);

  const handleMontantChange = (achatId, valeur) => {
    setMontantsParAchat((prev) => ({ ...prev, [achatId]: valeur }));
    setErreursParAchat((prev) => ({ ...prev, [achatId]: '' }));
  };

  const handleModeChange = (achatId, valeur) => {
    setModesParAchat((prev) => ({ ...prev, [achatId]: valeur }));
    setErreursParAchat((prev) => ({ ...prev, [achatId]: '' }));
  };

  const handleSubmitPaiement = async (achat) => {
    const montantSaisi = montantsParAchat[achat.id] || '';
    const modePaiement = modesParAchat[achat.id] || '';

    // Saisie complète seulement : le plafond (montant dû) est vérifié par
    // le serveur, sous verrou.
    if (!(parseFloat(montantSaisi) > 0)) {
      setErreursParAchat((prev) => ({ ...prev, [achat.id]: 'Le montant doit être strictement positif.' }));
      return;
    }
    // Obligatoire ici (journal de caisse par mode), alors que l'API
    // l'accepte absent.
    if (!modePaiement) {
      setErreursParAchat((prev) => ({ ...prev, [achat.id]: 'Choisissez le mode de paiement.' }));
      return;
    }

    setEnregistrementEnCours(achat.id);
    try {
      await enregistrerPaiementFournisseur(achat.id, montantSaisi, modePaiement);
      setMontantsParAchat((prev) => ({ ...prev, [achat.id]: '' }));
      setModesParAchat((prev) => ({ ...prev, [achat.id]: '' }));
      await chargerHistorique();
      onPaiementEnregistre?.();
    } catch (err) {
      setErreursParAchat((prev) => ({
        ...prev,
        [achat.id]: getErrorMessage(err, "Erreur lors de l'enregistrement du paiement."),
      }));
    } finally {
      setEnregistrementEnCours(null);
    }
  };

  const ouvrirCorrection = (paiement) => {
    setCorrectionOuverte(paiement.id);
    // Montant effectif de l'API, tel quel.
    setFormCorrection({ nouveauMontant: String(paiement.montant_effectif), motif: '' });
    setErreurCorrection('');
  };

  const fermerCorrection = () => {
    setCorrectionOuverte(null);
    setFormCorrection(CORRECTION_VIDE);
    setErreurCorrection('');
  };

  const handleSubmitCorrection = async (paiement) => {
    const motif = formCorrection.motif.trim();

    if (formCorrection.nouveauMontant === '' || !(parseFloat(formCorrection.nouveauMontant) >= 0)) {
      setErreurCorrection('Le nouveau montant doit être positif ou nul.');
      return;
    }
    if (!motif) {
      setErreurCorrection('Le motif de la correction est obligatoire.');
      return;
    }

    setCorrectionEnCours(true);
    try {
      await corrigerPaiementFournisseur(paiement.id, formCorrection.nouveauMontant, motif);
      fermerCorrection();
      await chargerHistorique();
      onPaiementEnregistre?.();
    } catch (err) {
      setErreurCorrection(getErrorMessage(err, 'Erreur lors de la correction du paiement.'));
    } finally {
      setCorrectionEnCours(false);
    }
  };

  // D3 : corriger est réservé au propriétaire ; jamais sur un achat annulé.
  const peutCorriger = (achat) => estProprietaire === true && !modeSupport && achat.statut !== 'ANNULE';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Dettes et paiements : ${fournisseur.nom}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
    >
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-slate-900">{fournisseur.nom}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {fournisseur.telephone && (
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400" /> {fournisseur.telephone}</p>
              )}
              {dette && (
                <p>Dette en cours : <span className="font-semibold text-red-700">{formatCurrency(dette.total, devise)}</span></p>
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
          Historique des achats à crédit
        </h4>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Chargement...</p>
        ) : erreur ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {erreur}
          </div>
        ) : achats.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Aucun achat à crédit chez ce fournisseur.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {achats.map((achat) => {
              const estAnnule = achat.statut === 'ANNULE';
              return (
                <li key={achat.id} aria-label={`Achat #${achat.id}`} className={`rounded-lg border border-slate-200 p-4 ${estAnnule ? 'bg-slate-50/70' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">Achat #{achat.id}</p>
                      <p className="text-xs text-slate-500">{formatDate(achat.date_achat)}</p>
                    </div>
                    {estAnnule ? (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">Annulé</span>
                    ) : achat.statut_paiement && (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        STATUT_PAIEMENT_BADGES[achat.statut_paiement] || 'bg-slate-100 text-slate-700'
                      }`}>
                        {STATUT_PAIEMENT_LABELS[achat.statut_paiement] || achat.statut_paiement}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-slate-500">Total</p>
                      <p className={`font-medium text-slate-900 ${estAnnule ? 'line-through' : ''}`}>{formatCurrency(achat.montant_total, devise)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Payé à l'achat</p>
                      <p className="font-medium text-slate-900">{formatCurrency(achat.montant_paye, devise)}</p>
                      {Number(achat.montant_paye) > 0 && (
                        <p className="text-xs text-slate-500">{libelleModePaiement(achat.mode_paiement)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-500">Reste dû</p>
                      <p className="font-medium text-red-700">{formatCurrency(achat.montant_du, devise)}</p>
                    </div>
                  </div>

                  {achat.paiements?.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Paiements
                        {achat.total_paiements != null && <> · total {formatCurrency(achat.total_paiements, devise)}</>}
                      </p>
                      <ul className="mt-2 space-y-2 text-sm text-slate-700">
                        {achat.paiements.map((paiement) => {
                          const corrections = paiement.corrections || [];
                          return (
                            <li key={paiement.id}>
                              {/* Retour à la ligne plutôt que texte tronqué : « Enregistré par »
                                  reste lisible à 375 px (D3). */}
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                <span className="min-w-0">
                                  {formatDate(paiement.date_paiement)} · {paiement.enregistre_par_nom}
                                  {' · '}{libelleModePaiement(paiement.mode_paiement)}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className={`font-medium ${corrections.length > 0 ? 'text-slate-400 line-through' : ''}`}>
                                    {formatCurrency(paiement.montant, devise)}
                                  </span>
                                  {corrections.length > 0 && (
                                    <span className="font-medium">{formatCurrency(paiement.montant_effectif, devise)}</span>
                                  )}
                                  {peutCorriger(achat) && correctionOuverte !== paiement.id && (
                                    <button
                                      type="button"
                                      onClick={() => ouvrirCorrection(paiement)}
                                      className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                    >
                                      Corriger
                                    </button>
                                  )}
                                </span>
                              </div>

                              {corrections.length > 0 && (
                                <ul className="mt-1 space-y-1 border-l-2 border-amber-200 pl-3">
                                  {corrections.map((c) => (
                                    <li key={c.id} className="text-xs text-slate-600">
                                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                            Correction
                                          </span>
                                          <span>{formatDate(c.date_paiement)} · {c.enregistre_par_nom}</span>
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

                              {correctionOuverte === paiement.id && (
                                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700" htmlFor={`correction-montant-${paiement.id}`}>
                                      Nouveau montant
                                    </label>
                                    <input
                                      id={`correction-montant-${paiement.id}`}
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
                                    <label className="block text-xs font-medium text-slate-700" htmlFor={`correction-motif-${paiement.id}`}>
                                      Motif de la correction
                                    </label>
                                    <input
                                      id={`correction-motif-${paiement.id}`}
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
                                      onClick={() => handleSubmitCorrection(paiement)}
                                      disabled={correctionEnCours}
                                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {correctionEnCours ? '...' : 'Valider la correction'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* D3 : enregistrer un paiement est permis à l'employé aussi. */}
                  {!estAnnule && Number(achat.montant_du) > 0 && !modeSupport && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <label className="block text-xs font-medium text-slate-700" htmlFor={`paiement-${achat.id}`}>
                        Enregistrer un paiement
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2 sm:flex-nowrap">
                        <input
                          id={`paiement-${achat.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={montantsParAchat[achat.id] || ''}
                          onChange={(e) => handleMontantChange(achat.id, e.target.value)}
                          placeholder="Montant"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <select
                          aria-label="Mode de paiement"
                          value={modesParAchat[achat.id] || ''}
                          onChange={(e) => handleModeChange(achat.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-40 sm:flex-none"
                        >
                          <option value="">Mode...</option>
                          {MODES_PAIEMENT.map((mode) => (
                            <option key={mode.valeur} value={mode.valeur}>{mode.libelle}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSubmitPaiement(achat)}
                          disabled={enregistrementEnCours === achat.id}
                          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {enregistrementEnCours === achat.id ? '...' : 'Enregistrer'}
                        </button>
                      </div>
                      {erreursParAchat[achat.id] && (
                        <p className="mt-1 text-xs text-red-700">{erreursParAchat[achat.id]}</p>
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
