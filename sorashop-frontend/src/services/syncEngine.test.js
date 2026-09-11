import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  listerVentesEnAttente: vi.fn(),
  supprimerVenteEnAttente: vi.fn(),
  marquerStatut: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { post: mocks.post },
}));

vi.mock('./offlineQueue', () => ({
  listerVentesEnAttente: mocks.listerVentesEnAttente,
  supprimerVenteEnAttente: mocks.supprimerVenteEnAttente,
  marquerStatut: mocks.marquerStatut,
  STATUT_EN_ATTENTE: 'EN_ATTENTE',
  STATUT_ECHEC_AUTH: 'ECHEC_AUTH',
  STATUT_ECHEC_AUTRE: 'ECHEC_AUTRE',
}));

import { synchroniserVentesEnAttente } from './syncEngine';

function venteEnAttente(overrides = {}) {
  return {
    cle_idempotence: 'cle-1',
    payload: { montant_paye: 500, lignes: [] },
    horodatage_client: '2026-09-11T10:00:00.000Z',
    statut: 'EN_ATTENTE',
    tentatives: 0,
    ...overrides,
  };
}

describe('syncEngine', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.listerVentesEnAttente.mockReset();
    mocks.supprimerVenteEnAttente.mockReset();
    mocks.marquerStatut.mockReset();
  });

  it('supprime une vente de la file une fois synchronisée avec succès', async () => {
    const vente = venteEnAttente();
    mocks.listerVentesEnAttente.mockResolvedValue([vente]);
    mocks.post.mockResolvedValue({ data: { id: 42 } });

    await synchroniserVentesEnAttente();

    expect(mocks.post).toHaveBeenCalledWith('ventes/', {
      ...vente.payload,
      cle_idempotence: vente.cle_idempotence,
      horodatage_client: vente.horodatage_client,
      synchronisation_differee: true,
    });
    expect(mocks.supprimerVenteEnAttente).toHaveBeenCalledWith('cle-1');
    expect(mocks.marquerStatut).not.toHaveBeenCalled();
  });

  it('laisse la vente EN_ATTENTE (avec tentative incrémentée) sur un échec réseau', async () => {
    const vente = venteEnAttente();
    mocks.listerVentesEnAttente.mockResolvedValue([vente]);
    // Erreur réseau axios typique : pas de `.response` du tout.
    mocks.post.mockRejectedValue(new Error('Network Error'));

    await synchroniserVentesEnAttente();

    expect(mocks.supprimerVenteEnAttente).not.toHaveBeenCalled();
    expect(mocks.marquerStatut).toHaveBeenCalledWith('cle-1', 'EN_ATTENTE', { incrementerTentatives: true });
  });

  it('marque ECHEC_AUTH et arrête la boucle sur un 401 définitif', async () => {
    const venteA = venteEnAttente({ cle_idempotence: 'cle-a' });
    const venteB = venteEnAttente({ cle_idempotence: 'cle-b' });
    mocks.listerVentesEnAttente.mockResolvedValue([venteA, venteB]);
    mocks.post.mockRejectedValue({ response: { status: 401 } });

    await synchroniserVentesEnAttente();

    expect(mocks.marquerStatut).toHaveBeenCalledTimes(1);
    expect(mocks.marquerStatut).toHaveBeenCalledWith('cle-a', 'ECHEC_AUTH');
    // La boucle s'arrête : la seconde vente n'est même pas tentée.
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.supprimerVenteEnAttente).not.toHaveBeenCalled();
  });

  it('marque ECHEC_AUTRE sur un 4xx inattendu sans supprimer la vente, et continue les suivantes', async () => {
    const venteA = venteEnAttente({ cle_idempotence: 'cle-a' });
    const venteB = venteEnAttente({ cle_idempotence: 'cle-b' });
    mocks.listerVentesEnAttente.mockResolvedValue([venteA, venteB]);
    mocks.post
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Stock insuffisant' } } })
      .mockResolvedValueOnce({ data: { id: 1 } });

    await synchroniserVentesEnAttente();

    expect(mocks.marquerStatut).toHaveBeenCalledWith('cle-a', 'ECHEC_AUTRE');
    expect(mocks.supprimerVenteEnAttente).toHaveBeenCalledWith('cle-b');
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it('retente aussi les ventes en statut ECHEC_AUTRE (pas seulement EN_ATTENTE)', async () => {
    const vente = venteEnAttente({ statut: 'ECHEC_AUTRE' });
    mocks.listerVentesEnAttente.mockResolvedValue([vente]);
    mocks.post.mockResolvedValue({ data: { id: 1 } });

    await synchroniserVentesEnAttente();

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.supprimerVenteEnAttente).toHaveBeenCalledWith('cle-1');
  });

  it('ne retente pas une vente déjà en ECHEC_AUTH tant qu’elle n’a pas été retirée de la file', async () => {
    const vente = venteEnAttente({ statut: 'ECHEC_AUTH' });
    mocks.listerVentesEnAttente.mockResolvedValue([vente]);

    await synchroniserVentesEnAttente();

    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('demarrerSynchronisationAutomatique', () => {
  // demarrerSynchronisationAutomatique() mémorise au niveau du module qu'il a
  // déjà été appelé (idempotence) : un rechargement frais du module est donc
  // nécessaire à chaque test pour rejouer le comportement de "démarrage".
  let syncEngineFrais;

  beforeEach(async () => {
    mocks.post.mockReset();
    mocks.listerVentesEnAttente.mockReset();
    mocks.supprimerVenteEnAttente.mockReset();
    mocks.marquerStatut.mockReset();
    vi.resetModules();
    syncEngineFrais = await import('./syncEngine');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synchronise immédiatement si le navigateur est déjà en ligne au démarrage', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    syncEngineFrais.demarrerSynchronisationAutomatique();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.listerVentesEnAttente).toHaveBeenCalledTimes(1);
  });

  it('ne synchronise pas immédiatement si le navigateur est hors ligne au démarrage', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    syncEngineFrais.demarrerSynchronisationAutomatique();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.listerVentesEnAttente).not.toHaveBeenCalled();
  });

  it('synchronise malgré tout au retour de l’évènement online, même après le démarrage hors ligne', async () => {
    // N'utilise pas un vrai window.dispatchEvent('online') : les tests
    // précédents laissent chacun un vrai écouteur attaché à `window` (un
    // module rechargé via vi.resetModules() n'a aucun moyen de retirer
    // l'écouteur d'une instance précédente) - un dispatchEvent réel
    // déclencherait donc aussi leurs écouteurs et fausserait le compte
    // d'appels. On capture directement le gestionnaire enregistré par
    // CETTE instance et on l'invoque nous-mêmes.
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.listerVentesEnAttente.mockResolvedValue([]);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    syncEngineFrais.demarrerSynchronisationAutomatique();
    await Promise.resolve();
    expect(mocks.listerVentesEnAttente).not.toHaveBeenCalled();

    const appelOnline = addEventListenerSpy.mock.calls.find(([evenement]) => evenement === 'online');
    expect(appelOnline).toBeTruthy();
    appelOnline[1]();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.listerVentesEnAttente).toHaveBeenCalledTimes(1);
  });

  it('ne s’enregistre qu’une seule fois même appelé plusieurs fois (idempotent)', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    syncEngineFrais.demarrerSynchronisationAutomatique();
    syncEngineFrais.demarrerSynchronisationAutomatique();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.listerVentesEnAttente).toHaveBeenCalledTimes(1);
  });
});
