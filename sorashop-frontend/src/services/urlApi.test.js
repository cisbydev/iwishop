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

  it.each([
    ['gestion.iwishop.app', AVEC_SLASH, 'https://api.iwishop.app/api/'],
    ['gestion.iwishop.app', ABSENTE, 'https://api.iwishop.app/api/'],
    ['gestion.iwishop.app', VIDE, 'https://api.iwishop.app/api/'],
    ['iwishop.vercel.app', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['iwishop.vercel.app', ABSENTE, LOCALE],
    ['127.0.0.1', ABSENTE, LOCALE],
    ['localhost', AVEC_SLASH, 'https://api.exemple.test/api/'],
    // Noms proches : seule l'adresse exacte de l'app passe par api.iwishop.app.
    ['iwishop.app', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['api.iwishop.app', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['xgestion.iwishop.app', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['gestion.iwishop.app.exemple.test', AVEC_SLASH, 'https://api.exemple.test/api/'],
    ['', AVEC_SLASH, 'https://api.exemple.test/api/'],
    [undefined, AVEC_SLASH, 'https://api.exemple.test/api/'],
  ])('page sur %j, VITE_API_URL %j', (nomHote, env, attendue) => {
    expect(calculerUrlApi(env, nomHote)).toBe(attendue);
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

  it.each([
    ['/media/logos/x.png', 'https://api.iwishop.app/media/logos/x.png'],
    ['logos/x.png', 'https://api.iwishop.app/logos/x.png'],
    ['https://r2.exemple.test/logos/x.png?signature=1', 'https://r2.exemple.test/logos/x.png?signature=1'],
    [null, null],
  ])('page sur gestion.iwishop.app, logo %j', (logo, attendue) => {
    expect(resoudreUrlLogo(logo, calculerUrlApi(AVEC_SLASH, 'gestion.iwishop.app'))).toBe(attendue);
  });
});

describe('branchement sur import.meta.env et l’adresse de la page', () => {
  // Adresse de la page dans jsdom (instance exposée par Vitest), remise après
  // chaque test.
  const ADRESSE_INITIALE = window.location.href;

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.jsdom.reconfigure({ url: ADRESSE_INITIALE });
  });

  // Vitest lit le .env local, absent en CI : la variable est fixée ici, puis
  // les modules sont rechargés (l'adresse est calculée à l'import).
  it.each([
    ['localhost', 'définie', 'https://api.exemple.test/api/', 'https://api.exemple.test/api/', 'https://api.exemple.test/media/logos/x.png'],
    ['localhost', 'absente', undefined, LOCALE, 'http://127.0.0.1:8001/media/logos/x.png'],
    ['iwishop.vercel.app', 'définie', 'https://api.exemple.test/api/', 'https://api.exemple.test/api/', 'https://api.exemple.test/media/logos/x.png'],
    ['gestion.iwishop.app', 'définie', 'https://api.exemple.test/api/', 'https://api.iwishop.app/api/', 'https://api.iwishop.app/media/logos/x.png'],
    ['gestion.iwishop.app', 'absente', undefined, 'https://api.iwishop.app/api/', 'https://api.iwishop.app/media/logos/x.png'],
  ])('page sur %s, VITE_API_URL %s : API_URL, logo par défaut, api et authClient d’api.js', async (nomHote, _, valeur, attendue, logoAttendu) => {
    globalThis.jsdom.reconfigure({ url: `https://${nomHote}/` });
    expect(window.location.hostname).toBe(nomHote);
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
