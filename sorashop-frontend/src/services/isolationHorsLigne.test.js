import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Isolation hors ligne (plan validé le 2026-10-16) : non-régression du
// constat du même jour, inversé. Vraie IndexedDB en mémoire
// (fake-indexeddb), modules rechargés à chaque test (connexion mémorisée).

let catalogueCache;
let offlineQueue;
let contexteSession;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
  catalogueCache = await import('./catalogueCache');
  offlineQueue = await import('./offlineQueue');
  contexteSession = await import('./contexteSession');
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
