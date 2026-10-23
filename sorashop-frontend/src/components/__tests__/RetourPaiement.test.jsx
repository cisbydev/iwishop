import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get },
}));

import RetourPaiement from '../RetourPaiement';

const PAIEMENT_STORAGE_KEY = 'iwishop_paiement_abonnement_id';

function definirUrl(url) {
  window.history.pushState({}, '', url);
}

describe('RetourPaiement', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    sessionStorage.clear();
    definirUrl('/');
  });

  it('garde un paiement EN_ATTENTE en cours sans afficher de faux succès', async () => {
    definirUrl('/?paiement_id=12');
    mocks.get.mockResolvedValue({ data: { statut: 'EN_ATTENTE' } });

    render(<RetourPaiement />);

    expect(await screen.findByRole('heading', { name: 'Paiement en cours de confirmation' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Abonnement confirmé' })).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('tenants/paiements-abonnement/12/');
  });

  it('affiche la confirmation seulement pour un paiement CONFIRME', async () => {
    sessionStorage.setItem(PAIEMENT_STORAGE_KEY, '13');
    mocks.get.mockResolvedValue({ data: { statut: 'CONFIRME' } });

    render(<RetourPaiement />);

    expect(await screen.findByRole('heading', { name: 'Abonnement confirmé' })).toBeInTheDocument();
    expect(sessionStorage.getItem(PAIEMENT_STORAGE_KEY)).toBeNull();
  });

  it('affiche l’échec pour un paiement ECHEC', async () => {
    definirUrl('/?paiement_id=14');
    mocks.get.mockResolvedValue({ data: { statut: 'ECHEC' } });

    render(<RetourPaiement />);

    expect(await screen.findByRole('heading', { name: 'Paiement non confirmé' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Abonnement confirmé' })).not.toBeInTheDocument();
  });

  it('rejette une URL sans paiement_id sans appeler l’API', async () => {
    render(<RetourPaiement />);

    expect(await screen.findByRole('heading', { name: 'Paiement introuvable' })).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Abonnement confirmé' })).not.toBeInTheDocument();
  });

  it('après 12 vérifications encore EN_ATTENTE, invite à réessayer en vouvoyant', async () => {
    vi.useFakeTimers();
    try {
      definirUrl('/?paiement_id=15');
      mocks.get.mockResolvedValue({ data: { statut: 'EN_ATTENTE' } });

      const { container } = render(<RetourPaiement />);
      // 12 vérifications, espacées de 5 s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12 * 5000);
      });

      expect(screen.getByRole('heading', { name: 'Confirmation toujours en cours' })).toBeInTheDocument();
      expect(screen.getByText(
        "Le paiement n'est pas encore confirmé. Réessayez cette page dans quelques instants."
      )).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\b(tu|ta|ton|tes|toi|réessaie)\b/i);
      expect(mocks.get).toHaveBeenCalledTimes(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejette un paiement_id invalide sans appeler l’API', async () => {
    definirUrl('/?paiement_id=invalide');

    render(<RetourPaiement />);

    expect(await screen.findByRole('heading', { name: 'Paiement introuvable' })).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
