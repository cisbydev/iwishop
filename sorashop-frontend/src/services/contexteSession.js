// Isolation hors ligne (plan validé le 2026-10-16) : l'utilisateur et la
// boutique de la session en cours, tirés de accounts/me/. Chaque vente mise
// en file et chaque catalogue sauvegardé en portent la marque, pour ne
// jamais être relus ou rejoués par un autre compte ou une autre boutique.

// Null si la réponse ne permet pas de marquer : utilisateur pas encore
// chargé, ou backend sans boutique_id (pas encore déployé).
export function contexteSessionDepuisMe(me) {
  if (!me || me.id == null || me.boutique_id == null) return null;
  return {
    utilisateur_id: me.id,
    utilisateur_nom: me.username,
    boutique_id: me.boutique_id,
    boutique_nom: me.boutique_nom,
  };
}
