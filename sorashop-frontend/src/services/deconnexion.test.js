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

import {
  confirmerDeconnexion,
  deconnexionVolontaire,
  MESSAGE_DECONNEXION_SANS_RESEAU,
  MESSAGE_DECONNEXION_SERVEUR_EN_ERREUR,
} from './deconnexion';

describe('confirmerDeconnexion (isolation hors ligne)', () => {
  beforeEach(() => {
    mocks.listerVentesEnAttente.mockReset();
    mocks.synchroniserVentesEnAttente.mockReset().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
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

  it('hors ligne : refus immédiat, sans envoi ni avertissement des ventes', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.listerVentesEnAttente.mockResolvedValue([{ cle_idempotence: 'a' }]);
    window.confirm.mockReturnValue(true);

    expect(await confirmerDeconnexion()).toBe(false);

    expect(window.alert).toHaveBeenCalledWith(
      'Pas de connexion : impossible de vous déconnecter en sécurité. Réessayez quand le réseau revient.'
    );
    expect(mocks.synchroniserVentesEnAttente).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('file illisible : avertissement prudent plutôt qu’une déconnexion silencieuse', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mocks.listerVentesEnAttente.mockRejectedValue(new Error('IndexedDB indisponible'));

    expect(await confirmerDeconnexion()).toBe(false);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Impossible de vérifier/));
  });
});

describe('deconnexionVolontaire (déconnexion refusée sans réseau)', () => {
  beforeEach(() => {
    mocks.listerVentesEnAttente.mockReset().mockResolvedValue([]);
    mocks.synchroniserVentesEnAttente.mockReset().mockResolvedValue(undefined);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('token/logout/ en échec (navigator.onLine vrai à tort) : refus, message, vue support gardée', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('Network Error'));
    const quitterVueSupport = vi.fn();

    expect(await deconnexionVolontaire({ logout, quitterVueSupport })).toBe(false);

    expect(logout).toHaveBeenCalledOnce();
    expect(window.alert).toHaveBeenCalledWith(MESSAGE_DECONNEXION_SANS_RESEAU);
    expect(quitterVueSupport).not.toHaveBeenCalled();
  });

  it('5xx sur token/logout/ : refus avec le message du serveur, vue support gardée', async () => {
    const erreur = Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } });
    const logout = vi.fn().mockRejectedValue(erreur);
    const quitterVueSupport = vi.fn();

    expect(await deconnexionVolontaire({ logout, quitterVueSupport })).toBe(false);

    expect(window.alert).toHaveBeenCalledWith(MESSAGE_DECONNEXION_SERVEUR_EN_ERREUR);
    expect(window.alert).toHaveBeenCalledTimes(1);
    expect(MESSAGE_DECONNEXION_SERVEUR_EN_ERREUR).toBe('Le serveur ne répond pas correctement. Réessayez dans un instant.');
    expect(quitterVueSupport).not.toHaveBeenCalled();
  });

  it('serveur joint : déconnexion, puis sortie de la vue support, sans message', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const quitterVueSupport = vi.fn();

    expect(await deconnexionVolontaire({ logout, quitterVueSupport })).toBe(true);

    expect(quitterVueSupport).toHaveBeenCalledOnce();
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(quitterVueSupport.mock.invocationCallOrder[0]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('hors ligne : token/logout/ n’est même pas tenté', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const logout = vi.fn();
    const quitterVueSupport = vi.fn();

    expect(await deconnexionVolontaire({ logout, quitterVueSupport })).toBe(false);

    expect(logout).not.toHaveBeenCalled();
    expect(quitterVueSupport).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(MESSAGE_DECONNEXION_SANS_RESEAU);
  });

  it('avertissement des ventes refusé : rien n’est tenté', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([{ cle_idempotence: 'a' }]);
    window.confirm.mockReturnValue(false);
    const logout = vi.fn();

    expect(await deconnexionVolontaire({ logout, quitterVueSupport: vi.fn() })).toBe(false);

    expect(logout).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });
});
