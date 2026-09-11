import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerVentesEnAttente: vi.fn(),
  synchroniserVentesEnAttente: vi.fn(),
}));

vi.mock('../../services/offlineQueue', () => ({
  listerVentesEnAttente: mocks.listerVentesEnAttente,
  EVENEMENT_FILE_ATTENTE_MODIFIEE: 'sorashop:file-attente-ventes-modifiee',
  STATUT_ECHEC_AUTH: 'ECHEC_AUTH',
}));

vi.mock('../../services/syncEngine', () => ({
  synchroniserVentesEnAttente: mocks.synchroniserVentesEnAttente,
}));

import VentesEnAttenteBanner from '../VentesEnAttenteBanner';

describe('VentesEnAttenteBanner', () => {
  beforeEach(() => {
    mocks.listerVentesEnAttente.mockReset();
    mocks.synchroniserVentesEnAttente.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("n'affiche rien quand la file d'attente est vide", async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    render(<VentesEnAttenteBanner />);

    await waitFor(() => expect(mocks.listerVentesEnAttente).toHaveBeenCalled());
    expect(screen.queryByTestId('ventes-en-attente-banner')).not.toBeInTheDocument();
  });

  it('affiche le nombre de ventes en attente', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([
      { cle_idempotence: 'a', statut: 'EN_ATTENTE' },
      { cle_idempotence: 'b', statut: 'EN_ATTENTE' },
    ]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/2 ventes en attente de synchronisation/)).toBeInTheDocument();
  });

  it('invite explicitement à se reconnecter si une vente est en ECHEC_AUTH', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([
      { cle_idempotence: 'a', statut: 'ECHEC_AUTH' },
    ]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/Reconnectez-vous pour reprendre l’envoi/)).toBeInTheDocument();
  });

  it('déclenche une synchronisation manuelle au clic sur le bouton', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([
      { cle_idempotence: 'a', statut: 'EN_ATTENTE' },
    ]);
    mocks.synchroniserVentesEnAttente.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<VentesEnAttenteBanner />);
    await screen.findByTestId('ventes-en-attente-banner');

    await user.click(screen.getByRole('button', { name: /Réessayer maintenant/ }));

    expect(mocks.synchroniserVentesEnAttente).toHaveBeenCalledTimes(1);
  });

  it('se met à jour automatiquement quand la file change (évènement DOM)', async () => {
    mocks.listerVentesEnAttente.mockResolvedValueOnce([
      { cle_idempotence: 'a', statut: 'EN_ATTENTE' },
    ]);

    render(<VentesEnAttenteBanner />);
    expect(await screen.findByText(/1 vente en attente/)).toBeInTheDocument();

    mocks.listerVentesEnAttente.mockResolvedValueOnce([]);
    window.dispatchEvent(new Event('sorashop:file-attente-ventes-modifiee'));

    await waitFor(() => {
      expect(screen.queryByTestId('ventes-en-attente-banner')).not.toBeInTheDocument();
    });
  });
});
