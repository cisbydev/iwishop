// Petit état singleton, en dehors de React, pour que l'intercepteur axios
// (qui tourne hors du cycle de rendu) puisse lire l'id de la boutique
// active de manière synchrone, à chaque requête sortante. Persisté dans
// localStorage (contrairement à supportViewState.js) : la boutique choisie
// doit survivre à un rechargement de page, un login n'étant pas requis à
// nouveau (cf. changerBoutique côté BoutiqueActiveContext).
const STORAGE_KEY = 'boutique_active_id';

export function getBoutiqueActiveId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setBoutiqueActiveId(id) {
  try {
    if (id === null || id === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // Stockage indisponible (navigation privée, quota dépassé...) : le
    // header ne sera simplement pas envoyé, boutique_de() retombe sur son
    // fallback côté backend.
  }
}
