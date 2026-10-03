import api, { getAll } from './api';

export async function listerFournisseursAvecDette() {
  return getAll('fournisseurs/avec_dette/');
}

// Total dû à tous les fournisseurs de la boutique, calculé par le backend
// (8 bis) : { dette_totale, nombre_fournisseurs }.
export async function obtenirDetteTotaleFournisseurs() {
  const response = await api.get('fournisseurs/dette_totale/');
  return response.data;
}

// Achats créés à crédit (annulés compris), avec leurs paiements groupés par
// le backend : montant_effectif et total_paiements y sont déjà calculés.
export async function obtenirHistoriqueFournisseur(id) {
  const response = await api.get(`fournisseurs/${id}/historique/`);
  return response.data;
}

export async function enregistrerPaiementFournisseur(achatId, montant, modePaiement) {
  const response = await api.post('achats/paiements/', {
    achat: achatId,
    montant,
    mode_paiement: modePaiement,
  });
  return response.data;
}

// nouveauMontant = le montant que ce paiement aurait dû avoir (pas l'écart) :
// le backend crée une ligne de correction et renvoie aussi
// total_paiements/montant_du/statut_paiement de l'achat.
export async function corrigerPaiementFournisseur(paiementId, nouveauMontant, motif) {
  const response = await api.post(`achats/paiements/${paiementId}/corriger/`, {
    nouveau_montant: nouveauMontant,
    motif,
  });
  return response.data;
}
