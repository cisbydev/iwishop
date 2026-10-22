// Liens et contacts de la landing : écrits ici seulement. Les pages HTML y
// font référence par {{cle}}, remplacé au build (voir vite.config.js) ; les
// tests vérifient qu'aucune de ces valeurs n'est recopiée ailleurs.
const WHATSAPP_NUMERO = '22372458164';
const WHATSAPP_TEXTE = 'Bonjour, je souhaite en savoir plus sur iwiShop.';

export const SITE = {
  urlSite: 'https://iwishop.app',
  urlConnexion: 'https://gestion.iwishop.app',
  urlDemandeAcces: 'https://gestion.iwishop.app/demande-acces',
  urlWhatsApp: `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_TEXTE)}`,
  emailContact: 'contact@iwishop.app',
};

// Valeurs qui ne doivent apparaître dans aucun fichier source hors de
// celui-ci (contrôlé par tests/site.test.mjs).
export const VALEURS_UNIQUES = [WHATSAPP_NUMERO, 'gestion.iwishop.app', 'wa.me', SITE.emailContact];
