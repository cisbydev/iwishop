import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Isolation hors ligne (plan validé le 2026-10-16) : non-régression du
// constat du même jour, inversé. Vraie IndexedDB en mémoire
// (fake-indexeddb), modules rechargés à chaque test (connexion mémorisée),
// vrai module api.js ; seul le réseau d'axios est remplacé, pour lire les
// requêtes réellement envoyées.

const reseau = vi.hoisted(() => ({ requetes: [], refuser: null }));

vi.mock('axios', async (importOriginal) => {
  const module = await importOriginal();
  module.default.defaults.adapter = async (config) => {
    reseau.requetes.push(config);
    const refus = reseau.refuser?.(config);
    if (refus === 'reseau') {
      // Hors ligne ou erreur réseau : axios rejette sans réponse.
      throw Object.assign(new Error('Network Error'), { config, code: 'ERR_NETWORK' });
    }
    if (refus) {
      const status = refus === true ? 401 : refus;
      throw Object.assign(new Error(`Request failed with status code ${status}`), {
        config, response: { status, data: {}, headers: {}, config },
      });
    }
    const data = config.url === 'csrf/' ? { csrfToken: 'jeton-csrf' } : { id: 1 };
    return { data, status: 201, statusText: 'Created', headers: {}, config };
  };
  return module;
});

let api;
let catalogueCache;
let offlineQueue;
let contexteSession;
let syncEngine;
let boutiqueActive;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
  localStorage.clear();
  reseau.requetes.length = 0;
  reseau.refuser = null;
  api = await import('./api');
  catalogueCache = await import('./catalogueCache');
  offlineQueue = await import('./offlineQueue');
  contexteSession = await import('./contexteSession');
  syncEngine = await import('./syncEngine');
  boutiqueActive = await import('./boutiqueActiveState');
});

const X_BOUTIQUE_1 = { utilisateur_id: 7, utilisateur_nom: 'x', boutique_id: 1, boutique_nom: 'Boutique 1' };
const X_BOUTIQUE_2 = { ...X_BOUTIQUE_1, boutique_id: 2, boutique_nom: 'Boutique 2' };
const Y_BOUTIQUE_1 = { ...X_BOUTIQUE_1, utilisateur_id: 8, utilisateur_nom: 'y' };

const CATALOGUE_1 = {
  produits: [{ id: 10, nom: 'Savon (boutique 1)', prix_achat: '100' }],
  prix: [],
  unites: [],
};

describe('Catalogue hors ligne : rangé par utilisateur et par boutique', () => {
  it('le catalogue de (X, boutique 1) n’est rendu ni à (X, boutique 2) ni à (Y, boutique 1)', async () => {
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);

    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_2)).toBeNull();
    expect(await catalogueCache.chargerCatalogueCache(Y_BOUTIQUE_1)).toBeNull();
    const relu = await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1);
    expect(relu.produits[0].nom).toBe('Savon (boutique 1)');
    expect(relu).toMatchObject({ utilisateur_id: 7, boutique_id: 1 });
  });

  it('sans contexte : rien n’est sauvegardé ni relu', async () => {
    await expect(catalogueCache.sauvegarderCatalogue(CATALOGUE_1, null)).rejects.toThrow('Contexte de session inconnu');

    expect(await catalogueCache.chargerCatalogueCache(null)).toBeNull();
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).toBeNull();
  });

  it('l’ancienne entrée sans marque est supprimée à la première sauvegarde', async () => {
    // Base telle que l'ancien code la laissait : une seule entrée, clé 'catalogue'.
    const db = await openDB('sorashop-offline-catalogue', 1, {
      upgrade(base) { base.createObjectStore('catalogue_cache'); },
    });
    await db.put('catalogue_cache', { ...CATALOGUE_1, derniere_maj: '2026-10-01T00:00:00.000Z' }, 'catalogue');
    db.close();

    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);

    const relue = await openDB('sorashop-offline-catalogue', 1);
    expect(await relue.getAllKeys('catalogue_cache')).toEqual(['7:1']);
    relue.close();
  });
});

describe('File des ventes hors ligne : chaque vente porte sa marque', () => {
  it('la vente garde l’utilisateur et la boutique de sa création', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente({ montant_paye: 150, lignes: [] }, X_BOUTIQUE_1);

    expect(entree).toMatchObject({ utilisateur_id: 7, utilisateur_nom: 'x', boutique_id: 1, boutique_nom: 'Boutique 1' });
    expect((await offlineQueue.listerVentesEnAttente())[0]).toMatchObject({ utilisateur_id: 7, boutique_id: 1 });
  });

  it('sans marque : refusée, rien en file', async () => {
    await expect(offlineQueue.ajouterVenteEnAttente({ montant_paye: 150, lignes: [] }))
      .rejects.toThrow('Contexte de session inconnu');

    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(0);
  });
});

describe('Synchronisation : seules les ventes du compte en cours partent', () => {
  // Payload tel que Sales.jsx le construit (marque attendue comprise).
  const venteDe = (marque) => ({
    montant_paye: 150,
    lignes: [{ produit: 10, quantite: 1 }],
    utilisateur_attendu: marque.utilisateur_id,
    boutique_attendue: marque.boutique_id,
  });
  const envoisDeVentes = () => reseau.requetes.filter((r) => r.url === 'ventes/');

  it('la vente de (X, boutique 1) ne part pas avec le compte (Y, boutique 2) ; elle part au retour de (X, boutique 1)', async () => {
    const Y_BOUTIQUE_2 = { utilisateur_id: 8, utilisateur_nom: 'y', boutique_id: 2, boutique_nom: 'Boutique 2' };
    await offlineQueue.ajouterVenteEnAttente(venteDe(X_BOUTIQUE_1), X_BOUTIQUE_1);

    // Y connecté, boutique 2.
    boutiqueActive.setBoutiqueActiveId(2);
    api.setAccessToken('jeton-de-Y');
    contexteSession.definirContexteSession(Y_BOUTIQUE_2);
    await syncEngine.synchroniserVentesEnAttente();

    expect(envoisDeVentes()).toHaveLength(0);
    expect(await offlineQueue.listerVentesEnAttente()).toMatchObject([{ statut: 'EN_ATTENTE', utilisateur_id: 7 }]);

    // X revient, boutique 1.
    boutiqueActive.setBoutiqueActiveId(1);
    api.setAccessToken('jeton-de-X');
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    await syncEngine.synchroniserVentesEnAttente();

    const [envoi] = envoisDeVentes();
    expect(envoi.headers['X-Boutique-Active']).toBe('1');
    expect(envoi.headers.Authorization).toBe('Bearer jeton-de-X');
    expect(JSON.parse(envoi.data)).toMatchObject({ utilisateur_attendu: 7, boutique_attendue: 1 });
    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(0);
  });

  it('une vente sans marque ne part jamais automatiquement', async () => {
    const db = await openDB('sorashop-offline', 1, {
      upgrade(base) { base.createObjectStore('ventes_en_attente', { keyPath: 'cle_idempotence' }); },
    });
    await db.add('ventes_en_attente', {
      cle_idempotence: 'ancienne', payload: { montant_paye: 150, lignes: [] },
      horodatage_client: '2026-10-10T09:00:00.000Z', statut: 'EN_ATTENTE', tentatives: 0,
    });
    db.close();
    contexteSession.definirContexteSession(X_BOUTIQUE_1);

    await syncEngine.synchroniserVentesEnAttente();

    expect(envoisDeVentes()).toHaveLength(0);
    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(1);
  });
});

describe('Envoi confirmé d’une vente sans marque', () => {
  async function ajouterVenteSansMarque() {
    const db = await openDB('sorashop-offline', 1, {
      upgrade(base) { base.createObjectStore('ventes_en_attente', { keyPath: 'cle_idempotence' }); },
    });
    await db.add('ventes_en_attente', {
      cle_idempotence: 'ancienne', payload: { montant_paye: 150, lignes: [] },
      horodatage_client: '2026-10-10T09:00:00.000Z', statut: 'ECHEC_AUTRE', tentatives: 2,
    });
    db.close();
  }

  it('marquée avec le compte qui l’envoie (entrée et payload), remise EN_ATTENTE, puis partie', async () => {
    await ajouterVenteSansMarque();
    contexteSession.definirContexteSession(X_BOUTIQUE_1);

    await offlineQueue.marquerVente('ancienne', X_BOUTIQUE_1);
    const [marquee] = await offlineQueue.listerVentesEnAttente();
    expect(marquee).toMatchObject({
      utilisateur_id: 7, utilisateur_nom: 'x', boutique_id: 1, boutique_nom: 'Boutique 1', statut: 'EN_ATTENTE',
      payload: { utilisateur_attendu: 7, boutique_attendue: 1 },
    });
    await syncEngine.synchroniserVentesEnAttente();

    expect(reseau.requetes.filter((r) => r.url === 'ventes/')).toHaveLength(1);
  });

  it('une vente déjà marquée n’est jamais réattribuée', async () => {
    const Y_BOUTIQUE_1 = { ...X_BOUTIQUE_1, utilisateur_id: 8, utilisateur_nom: 'y' };
    const entree = await offlineQueue.ajouterVenteEnAttente({ montant_paye: 150, lignes: [] }, X_BOUTIQUE_1);

    await expect(offlineQueue.marquerVente(entree.cle_idempotence, Y_BOUTIQUE_1)).rejects.toThrow('jamais réattribuée');

    expect((await offlineQueue.listerVentesEnAttente())[0]).toMatchObject({ utilisateur_id: 7, utilisateur_nom: 'x' });
  });
});

describe('Déconnexion volontaire (AuthContext.logout)', () => {
  it('efface les catalogues, la boutique active et le contexte ; garde la file des ventes', async () => {
    const { AuthProvider, useAuth } = await import('../context/AuthContext');
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_2);
    await offlineQueue.ajouterVenteEnAttente({ montant_paye: 150, lignes: [] }, X_BOUTIQUE_1);
    boutiqueActive.setBoutiqueActiveId(1);
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.logout());

    expect(reseau.requetes.some((r) => r.url === 'token/logout/')).toBe(true);
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).toBeNull();
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_2)).toBeNull();
    expect(boutiqueActive.getBoutiqueActiveId()).toBeNull();
    expect(contexteSession.lireContexteSession()).toBeNull();
    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(1);
  });

  it.each([
    ['hors ligne (csrf/ sans réponse)', (config) => (config.url === 'csrf/' ? 'reseau' : false)],
    ['erreur réseau sur token/logout/', (config) => (config.url === 'token/logout/' ? 'reseau' : false)],
    // 5xx : souvent Render qui sort de veille ; le cookie existe peut-être encore.
    ['erreur 500 sur token/logout/', (config) => (config.url === 'token/logout/' ? 500 : false)],
  ])('aucune réponse ou 5xx (%s) : déconnexion refusée, rien n’est effacé, session ouverte', async (_cas, refuser) => {
    const { AuthProvider, useAuth } = await import('../context/AuthContext');
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);
    boutiqueActive.setBoutiqueActiveId(1);
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    api.setAccessToken('jeton-de-X');
    reseau.refuser = refuser;

    await act(async () => {
      await expect(result.current.logout()).rejects.toBeTruthy();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).not.toBeNull();
    expect(boutiqueActive.getBoutiqueActiveId()).toBe('1');
    expect(contexteSession.lireContexteSession()).toEqual(X_BOUTIQUE_1);
    reseau.refuser = null;
    await api.default.get('ventes/');
    expect(reseau.requetes.at(-1).headers.Authorization).toBe('Bearer jeton-de-X');
  });

  it.each([
    // Safari (iPhone) bloque les cookies tiers : csrf/ répond 200 sans
    // pouvoir poser son cookie, puis token/logout/ répond 403 (prod, 2026-10-19).
    ['403 sur token/logout/ (cookies tiers bloqués)', 403],
    ['401 sur token/logout/', 401],
  ])('réponse 4xx (%s) : déconnexion sur l’appareil, tout est effacé', async (_cas, status) => {
    const { AuthProvider, useAuth } = await import('../context/AuthContext');
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);
    await offlineQueue.ajouterVenteEnAttente({ montant_paye: 150, lignes: [] }, X_BOUTIQUE_1);
    boutiqueActive.setBoutiqueActiveId(1);
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    api.setAccessToken('jeton-de-X');
    reseau.refuser = (config) => (config.url === 'token/logout/' ? status : false);

    await act(() => result.current.logout());

    expect(reseau.requetes.filter((r) => r.url === 'token/logout/')).toHaveLength(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).toBeNull();
    expect(boutiqueActive.getBoutiqueActiveId()).toBeNull();
    expect(contexteSession.lireContexteSession()).toBeNull();
    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(1);
    reseau.refuser = null;
    await api.default.get('ventes/');
    expect(reseau.requetes.at(-1).headers.Authorization).toBeUndefined();
  });

  it('après un changement de mot de passe (cookie déjà révoqué) : effacement même sans réponse', async () => {
    const { AuthProvider, useAuth } = await import('../context/AuthContext');
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);
    boutiqueActive.setBoutiqueActiveId(1);
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    api.setAccessToken('jeton-de-X');
    reseau.refuser = (config) => (config.url === 'token/logout/' ? 'reseau' : false);

    await act(() => result.current.logout({ cookieDejaRevoque: true }));

    expect(result.current.isAuthenticated).toBe(false);
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).toBeNull();
    expect(boutiqueActive.getBoutiqueActiveId()).toBeNull();
    expect(contexteSession.lireContexteSession()).toBeNull();
    reseau.refuser = null;
    await api.default.get('ventes/');
    expect(reseau.requetes.at(-1).headers.Authorization).toBeUndefined();
  });

  it('session expirée (refus du rafraîchissement) : rien n’est effacé', async () => {
    const { AuthProvider, useAuth } = await import('../context/AuthContext');
    await catalogueCache.sauvegarderCatalogue(CATALOGUE_1, X_BOUTIQUE_1);
    boutiqueActive.setBoutiqueActiveId(1);
    contexteSession.definirContexteSession(X_BOUTIQUE_1);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    reseau.refuser = (config) => config.url === 'token/refresh/' || config.url === 'ventes/';

    await act(async () => {
      await expect(api.default.get('ventes/')).rejects.toBeTruthy();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(await catalogueCache.chargerCatalogueCache(X_BOUTIQUE_1)).not.toBeNull();
    expect(boutiqueActive.getBoutiqueActiveId()).toBe('1');
    expect(contexteSession.lireContexteSession()).toEqual(X_BOUTIQUE_1);
  });
});

describe('Contexte de session tiré de accounts/me/', () => {
  it('rend la marque quand l’utilisateur et la boutique sont connus', () => {
    expect(contexteSession.contexteSessionDepuisMe({ id: 7, username: 'x', boutique_id: 1, boutique_nom: 'Boutique 1' }))
      .toEqual(X_BOUTIQUE_1);
  });

  it('null sans utilisateur chargé, ou sans boutique_id (backend pas encore déployé)', () => {
    expect(contexteSession.contexteSessionDepuisMe(null)).toBeNull();
    expect(contexteSession.contexteSessionDepuisMe({ id: 7, username: 'x', boutique_nom: 'Boutique 1' })).toBeNull();
  });
});
