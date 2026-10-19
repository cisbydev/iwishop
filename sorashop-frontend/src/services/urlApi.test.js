import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculerUrlApi, resoudreUrlLogo } from './urlApi';
// Chargé une fois ici, hors de tout test : le premier test de branchement ne
// paie plus la transformation à froid d'api.js et de ses dépendances.
// Pourquoi (2026-10-19, PC chargé, passage de 101 s juste après un échec de
// démarrage du worker) : les deux tests de branchement ont échoué une fois,
// requêtes en trop dans la liste. Cause probable, non prouvée (sortie non
// gardée) : l'import à froid dépassait le délai de 5 s du premier test, qui
// se terminait ensuite pendant le second. Mesuré : 410 à 1 554 ms sans cet
// import, 11 à 34 ms avec ; délai inchangé.
import './api';

// Seul le réseau d'axios est remplacé, pour lire l'adresse réellement
// utilisée par api.js.
const reseau = vi.hoisted(() => ({ requetes: [] }));

vi.mock('axios', async (importOriginal) => {
  const module = await importOriginal();
  module.default.defaults.adapter = async (config) => {
    reseau.requetes.push(config);
    const data = config.url === 'csrf/' ? { csrfToken: 'jeton-csrf' } : { access: 'jeton' };
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  return module;
});

const LOCALE = 'http://127.0.0.1:8001/api/';
const AVEC_SLASH = { VITE_API_URL: 'https://api.exemple.test/api/' };
const SANS_SLASH = { VITE_API_URL: 'https://api.exemple.test/api' };
const ABSENTE = {};
const VIDE = { VITE_API_URL: '' };

describe('calculerUrlApi : valeurs écrites en clair', () => {
  it.each([
    ['définie', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['définie sans / final', SANS_SLASH, 'https://api.exemple.test/api'],
    ['absente', ABSENTE, LOCALE],
    ['vide', VIDE, LOCALE],
  ])('VITE_API_URL %s', (_, env, attendue) => {
    expect(calculerUrlApi(env)).toBe(attendue);
  });
});

describe('resoudreUrlLogo : valeurs écrites en clair', () => {
  it.each([
    [null, AVEC_SLASH, null],
    [undefined, AVEC_SLASH, null],
    ['', AVEC_SLASH, null],
    ['https://r2.exemple.test/logos/x.png?signature=1', AVEC_SLASH, 'https://r2.exemple.test/logos/x.png?signature=1'],
    ['/media/logos/x.png', AVEC_SLASH, 'https://api.exemple.test/media/logos/x.png'],
    ['logos/x.png', AVEC_SLASH, 'https://api.exemple.test/logos/x.png'],
    ['/media/logos/x.png', SANS_SLASH, 'https://api.exemple.test/media/logos/x.png'],
    ['/media/logos/x.png', ABSENTE, 'http://127.0.0.1:8001/media/logos/x.png'],
  ])('logo %j, VITE_API_URL %j', (logo, env, attendue) => {
    expect(resoudreUrlLogo(logo, calculerUrlApi(env))).toBe(attendue);
  });
});

// Preuve du refactor (commit 1 du chantier « nom de domaine ») : copie exacte
// de l'ancien calcul (api.js, App.jsx, Settings.jsx), seule la source de
// l'environnement est passée en paramètre. Au commit 2, le comportement
// changera exprès sur <app>.iwishop.app : retirer alors cette copie et ce
// bloc, et garder les valeurs écrites en clair ci-dessus.
function ancienneUrlApi(env) {
  const API_URL = env.VITE_API_URL || 'http://127.0.0.1:8001/api/';
  return API_URL;
}

function ancienneUrlLogo(logo, env) {
  const API_URL = env.VITE_API_URL || 'http://127.0.0.1:8001/api/';
  const SERVER_BASE_URL = API_URL.replace(/api\/?$/, '');
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  return `${SERVER_BASE_URL}${logo.startsWith('/') ? logo.slice(1) : logo}`;
}

describe('mêmes valeurs que l’ancien calcul', () => {
  const environnements = [AVEC_SLASH, SANS_SLASH, ABSENTE, VIDE];
  const logos = [
    null,
    undefined,
    '',
    'https://r2.exemple.test/logos/x.png?signature=1',
    'http://127.0.0.1:8001/media/logos/x.png',
    '/media/logos/x.png',
    'logos/x.png',
  ];

  it.each(environnements)('adresse de l’API, VITE_API_URL %j', (env) => {
    expect(calculerUrlApi(env)).toBe(ancienneUrlApi(env));
  });

  it.each(environnements)('URL des logos, VITE_API_URL %j', (env) => {
    for (const logo of logos) {
      expect(resoudreUrlLogo(logo, calculerUrlApi(env))).toBe(ancienneUrlLogo(logo, env));
    }
  });
});

describe('branchement sur import.meta.env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Vitest lit le .env local, absent en CI : la variable est fixée ici, puis
  // les modules sont rechargés (l'adresse est calculée à l'import).
  it.each([
    ['définie', 'https://api.exemple.test/api/', 'https://api.exemple.test/api/', 'https://api.exemple.test/media/logos/x.png'],
    ['absente', undefined, LOCALE, 'http://127.0.0.1:8001/media/logos/x.png'],
  ])('VITE_API_URL %s : API_URL, logo par défaut, api et authClient d’api.js', async (_, valeur, attendue, logoAttendu) => {
    vi.stubEnv('VITE_API_URL', valeur);
    // Le .env local vaut l'adresse par défaut : sans ce contrôle, « absente »
    // passerait même si la variable n'était pas retirée.
    expect(import.meta.env.VITE_API_URL).toBe(valeur);
    vi.resetModules();
    const urlApi = await import('./urlApi');
    const api = await import('./api');
    reseau.requetes.length = 0;

    expect(urlApi.API_URL).toBe(attendue);
    expect(urlApi.resoudreUrlLogo('/media/logos/x.png')).toBe(logoAttendu);

    await api.default.get('produits/');
    expect(await api.bootstrapAuthentication()).toBe(true);
    expect(reseau.requetes.map((r) => [r.url, r.baseURL])).toEqual([
      ['produits/', attendue],
      ['csrf/', attendue],
      ['token/refresh/', attendue],
    ]);
  });
});
