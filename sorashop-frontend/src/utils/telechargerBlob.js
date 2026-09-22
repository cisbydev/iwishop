// Déclenche le téléchargement d'un blob déjà récupéré (ex. réponse Axios en
// responseType: 'blob') via un lien temporaire - partagé par tous les
// boutons d'export (Reports.jsx, SalesHistory.jsx). L'appel réseau lui-même
// (avec l'en-tête JWT) reste à la charge de l'appelant : un <a href> direct
// vers l'URL de l'API ne fonctionnerait pas, l'endpoint étant protégé.
export function telechargerBlob(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}
