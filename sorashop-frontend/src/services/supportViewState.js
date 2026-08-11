// Petit état singleton, en dehors de React, pour que l'intercepteur axios
// (qui tourne hors du cycle de rendu) puisse lire l'id de boutique de la
// Vue Support en cours de manière synchrone, à chaque requête sortante.
let boutiqueId = null;

export function setSupportBoutiqueId(id) {
  boutiqueId = id;
}

export function getSupportBoutiqueId() {
  return boutiqueId;
}
