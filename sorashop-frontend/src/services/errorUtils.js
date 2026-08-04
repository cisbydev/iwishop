// Extrait un message d'erreur lisible à partir d'une réponse Axios/DRF.
// DRF peut renvoyer les erreurs sous plusieurs formes :
// - {"detail": "message"}
// - {"champ": ["message1", "message2"]}
// - {"non_field_errors": ["message"]}
// - une simple chaîne de caractères
export function getErrorMessage(err, fallback = "Une erreur est survenue.") {
  const data = err?.response?.data;

  if (!data) return fallback;

  if (typeof data === 'string') return data;

  if (data.detail) return data.detail;

  if (Array.isArray(data.non_field_errors)) {
    return data.non_field_errors.join(' ');
  }

  // Cas général : {"champ": ["erreur1", "erreur2"], "autre_champ": [...]}
  const messages = [];
  for (const [champ, valeur] of Object.entries(data)) {
    const texte = Array.isArray(valeur) ? valeur.join(' ') : String(valeur);
    messages.push(`${champ} : ${texte}`);
  }

  return messages.length > 0 ? messages.join('\n') : fallback;
}
