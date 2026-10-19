// Adresse de l'API et URL des logos, calculées ici seulement (avant : trois
// copies identiques dans api.js, App.jsx et Settings.jsx).

const URL_API_LOCALE = 'http://127.0.0.1:8001/api/';

export function calculerUrlApi(env) {
  return env.VITE_API_URL || URL_API_LOCALE;
}

export const API_URL = calculerUrlApi(import.meta.env);

// Un logo en chemin relatif est servi par le serveur : on retire le "/api/"
// de l'adresse de l'API pour obtenir son URL complète.
export function resoudreUrlLogo(logo, urlApi = API_URL) {
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  const urlServeur = urlApi.replace(/api\/?$/, '');
  return `${urlServeur}${logo.startsWith('/') ? logo.slice(1) : logo}`;
}
