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

  // DRF renvoie un tableau JSON brut (sans clé) quand une ValidationError
  // est levée avec une simple chaîne, ex: raise ValidationError("message")
  if (Array.isArray(data)) {
    return data.join(' ') || fallback;
  }

  // Cas général : {"champ": ["erreur1", "erreur2"], "autre_champ": [...]}
  const messages = [];
  for (const [champ, valeur] of Object.entries(data)) {
    const texte = Array.isArray(valeur) ? valeur.join(' ') : String(valeur);
    messages.push(`${champ} : ${texte}`);
  }

  return messages.length > 0 ? messages.join('\n') : fallback;
}

// Code machine-readable optionnel à côté du detail (ex. { detail: "...",
// code: "..." }) - jamais besoin de parser le texte français du detail
// pour distinguer un refus précis des autres 403/400 possibles.
export function getErrorCode(err) {
  return err?.response?.data?.code;
}

// Refus d'une écriture après l'expiration de l'abonnement (_verifier_acces
// côté serveur). Un ancien backend renvoie le même texte sans ce code :
// l'écran garde alors son alert() d'avant.
export const CODE_ABONNEMENT_EXPIRE = 'ABONNEMENT_EXPIRE';
export const EVENEMENT_ABONNEMENT_EXPIRE = 'iwishop:abonnement-expire';

export function estAbonnementExpire(err) {
  return err?.response?.status === 403 && getErrorCode(err) === CODE_ABONNEMENT_EXPIRE;
}

// Remplace alert(getErrorMessage(...)) dans les écrans : le refus après
// l'expiration est signalé à RefusAbonnementExpire (monté une seule fois
// dans App.jsx, message dans la page avec « Renouveler »), toute autre
// erreur reste dans l'alert() d'avant.
export function alerterErreur(err, fallback) {
  if (estAbonnementExpire(err)) {
    window.dispatchEvent(new Event(EVENEMENT_ABONNEMENT_EXPIRE));
    return;
  }
  alert(getErrorMessage(err, fallback));
}
