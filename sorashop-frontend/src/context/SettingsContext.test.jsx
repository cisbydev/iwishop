import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  synchroniserVentesEnAttente: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: { get: mocks.get },
}));

vi.mock('../services/syncEngine', () => ({
  synchroniserVentesEnAttente: mocks.synchroniserVentesEnAttente,
}));

import { SettingsProvider } from './SettingsContext';
import { definirContexteSession, lireContexteSession } from '../services/contexteSession';

describe('SettingsProvider : contexte de session (isolation hors ligne)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.synchroniserVentesEnAttente.mockReset().mockResolvedValue(undefined);
    definirContexteSession(null);
  });

  it('recopie le contexte de accounts/me/ pour la synchronisation, puis la relance', async () => {
    mocks.get.mockImplementation((url) => Promise.resolve({
      data: url === 'accounts/me/'
        ? { id: 7, username: 'awa', boutique_id: 3, boutique_nom: 'Boutique test', est_proprietaire: true }
        : {},
    }));

    render(<SettingsProvider><span /></SettingsProvider>);

    await waitFor(() => expect(mocks.synchroniserVentesEnAttente).toHaveBeenCalledTimes(1));
    expect(lireContexteSession()).toEqual({
      utilisateur_id: 7, utilisateur_nom: 'awa', boutique_id: 3, boutique_nom: 'Boutique test',
    });
  });

  it('accounts/me/ en échec : contexte inchangé, aucune synchronisation lancée', async () => {
    mocks.get.mockRejectedValue(new Error('Network Error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SettingsProvider><span /></SettingsProvider>);

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('accounts/me/'));
    expect(lireContexteSession()).toBeNull();
    expect(mocks.synchroniserVentesEnAttente).not.toHaveBeenCalled();
  });
});
