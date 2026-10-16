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

let contexteCourant = null;

// Copie du contexte de la session en cours, recopiée par SettingsContext à
// chaque chargement de accounts/me/, lue hors de React par syncEngine. En
// mémoire seulement (décision du 2026-10-16 : sans réseau, une app
// rechargée affiche de toute façon l'écran de connexion).
export function definirContexteSession(contexte) {
  contexteCourant = contexte;
}

export function lireContexteSession() {
  return contexteCourant;
}

// Vente créée avant le marquage (2026-10-16), ou par un ancien frontend.
export function estVenteSansMarque(vente) {
  return vente.utilisateur_id == null || vente.boutique_id == null;
}

export function estVenteDuContexte(vente, contexte) {
  return Boolean(contexte)
    && vente.utilisateur_id === contexte.utilisateur_id
    && vente.boutique_id === contexte.boutique_id;
}
