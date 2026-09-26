import api, { getAll } from './api';

export async function listerClients() {
  return getAll('ventes/clients/');
}

export async function listerClientsAvecDette() {
  return getAll('ventes/clients/avec_dette/');
}

export async function obtenirHistoriqueClient(id) {
  const response = await api.get(`ventes/clients/${id}/historique/`);
  return response.data;
}

export async function creerClient(data) {
  const response = await api.post('ventes/clients/', data);
  return response.data;
}

export async function enregistrerRemboursement(venteId, montant) {
  const response = await api.post('ventes/remboursements/', { vente: venteId, montant });
  return response.data;
}

// nouveauMontant = le montant que ce remboursement aurait dû avoir (pas
// l'écart) : le backend crée une ligne de correction et renvoie aussi
// total_rembourse/montant_du/statut_paiement de la vente.
export async function corrigerRemboursement(remboursementId, nouveauMontant, motif) {
  const response = await api.post(`ventes/remboursements/${remboursementId}/corriger/`, {
    nouveau_montant: nouveauMontant,
    motif,
  });
  return response.data;
}
