import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerVentesEnAttente: vi.fn(),
  synchroniserVentesEnAttente: vi.fn(),
}));

vi.mock('./offlineQueue', () => ({
  listerVentesEnAttente: mocks.listerVentesEnAttente,
}));

vi.mock('./syncEngine', () => ({
  synchroniserVentesEnAttente: mocks.synchroniserVentesEnAttente,
}));

import { confirmerDeconnexion } from './deconnexion';

describe('confirmerDeconnexion (isolation hors ligne)', () => {
  beforeEach(() => {
    mocks.listerVentesEnAttente.mockReset();
    mocks.synchroniserVentesEnAttente.mockReset().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('en ligne : tente d’abord l’envoi ; plus rien en file, déconnexion sans question', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    expect(await confirmerDeconnexion()).toBe(true);

    expect(mocks.synchroniserVentesEnAttente).toHaveBeenCalledTimes(1);
    expect(mocks.synchroniserVentesEnAttente.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.listerVentesEnAttente.mock.invocationCallOrder[0]);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('il reste des ventes : avertissement, et la réponse décide', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mocks.listerVentesEnAttente.mockResolvedValue([{ cle_idempotence: 'a' }, { cle_idempotence: 'b' }]);

    expect(await confirmerDeconnexion()).toBe(false);
    window.confirm.mockReturnValue(true);
    expect(await confirmerDeconnexion()).toBe(true);

    expect(window.confirm).toHaveBeenCalledWith(
      '2 ventes non envoyées restent sur cet appareil. Elles ne seront pas effacées et partiront à la prochaine '
      + 'connexion du compte qui les a faites. Se déconnecter quand même ?'
    );
  });

  it('hors ligne : aucun envoi tenté, avertissement s’il reste une vente', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.listerVentesEnAttente.mockResolvedValue([{ cle_idempotence: 'a' }]);

    await confirmerDeconnexion();

    expect(mocks.synchroniserVentesEnAttente).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^1 vente non envoyée reste sur cet appareil/));
  });

  it('file illisible : avertissement prudent plutôt qu’une déconnexion silencieuse', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.listerVentesEnAttente.mockRejectedValue(new Error('IndexedDB indisponible'));

    expect(await confirmerDeconnexion()).toBe(false);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Impossible de vérifier/));
  });
});
