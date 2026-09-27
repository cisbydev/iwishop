// Miroir de Vente.MODES_PAIEMENT (backend), réutilisé par les remboursements
// et le journal de caisse.
export const MODES_PAIEMENT = [
  { valeur: 'ESPECES', libelle: 'Espèces' },
  { valeur: 'MOBILE_MONEY', libelle: 'Mobile Money' },
  { valeur: 'CARTE', libelle: 'Carte bancaire' },
  { valeur: 'AUTRE', libelle: 'Autre' },
];

// null/absent = remboursement enregistré avant l'ajout du mode : jamais
// supposé en espèces.
export function libelleModePaiement(valeur) {
  if (!valeur) return 'Non précisé';
  return MODES_PAIEMENT.find((mode) => mode.valeur === valeur)?.libelle || valeur;
}
