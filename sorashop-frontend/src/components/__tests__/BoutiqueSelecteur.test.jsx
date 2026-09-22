import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerMesBoutiques: vi.fn(),
}));

vi.mock('../../services/boutiques', () => ({
  listerMesBoutiques: mocks.listerMesBoutiques,
}));

// api.js et boutiqueActiveState.js restent réels (non mockés) : c'est
// justement l'intercepteur axios réel qu'on veut vérifier ci-dessous.
import api from '../../services/api';
import { BoutiqueActiveProvider } from '../../context/BoutiqueActiveContext';
import BoutiqueSelecteur from '../BoutiqueSelecteur';

// Construit une config de requête sortante via le VRAI intercepteur axios
// (pas d'appel réseau), pour vérifier les headers qu'il attache réellement
// à chaque requête suivante.
function requeteSortante() {
  const intercepteur = api.interceptors.request.handlers.find((h) => h.fulfilled).fulfilled;
  return intercepteur({ headers: {} });
}

describe('BoutiqueSelecteur', () => {
  beforeEach(() => {
    mocks.listerMesBoutiques.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("n'affiche aucun sélecteur pour un utilisateur avec une seule boutique", async () => {
    mocks.listerMesBoutiques.mockResolvedValue([
      { id: 1, nom: 'Boutique Unique', est_proprietaire: true },
    ]);

    render(
      <BoutiqueActiveProvider>
        <BoutiqueSelecteur />
      </BoutiqueActiveProvider>
    );

    await waitFor(() => expect(mocks.listerMesBoutiques).toHaveBeenCalled());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('affiche un sélecteur avec chaque boutique quand il y en a plusieurs', async () => {
    mocks.listerMesBoutiques.mockResolvedValue([
      { id: 1, nom: 'Boutique A', est_proprietaire: true },
      { id: 2, nom: 'Boutique B', est_proprietaire: false },
    ]);

    render(
      <BoutiqueActiveProvider>
        <BoutiqueSelecteur />
      </BoutiqueActiveProvider>
    );

    expect(await screen.findByRole('combobox', { name: 'Boutique active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Boutique A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Boutique B' })).toBeInTheDocument();
  });

  it('changer de boutique met à jour l’en-tête X-Boutique-Active des requêtes suivantes', async () => {
    mocks.listerMesBoutiques.mockResolvedValue([
      { id: 1, nom: 'Boutique A', est_proprietaire: true },
      { id: 2, nom: 'Boutique B', est_proprietaire: false },
    ]);
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    const user = userEvent.setup();

    render(
      <BoutiqueActiveProvider>
        <BoutiqueSelecteur />
      </BoutiqueActiveProvider>
    );

    const select = await screen.findByRole('combobox', { name: 'Boutique active' });
    expect(requeteSortante().headers['X-Boutique-Active']).toBe('1');

    await user.selectOptions(select, '2');

    expect(requeteSortante().headers['X-Boutique-Active']).toBe('2');
    expect(reload).toHaveBeenCalledOnce();
  });
});
