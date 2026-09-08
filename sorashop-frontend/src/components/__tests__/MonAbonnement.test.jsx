import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get },
  getAll: mocks.getAll,
}));

import MonAbonnement from '../MonAbonnement';

const abonnementActif = {
  a_abonnement: true,
  statut: 'ACTIF',
  abonnement_valide: true,
  date_fin: '2026-12-31',
};

describe('MonAbonnement', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche les données chargées avec succès', async () => {
    mocks.get.mockResolvedValue({ data: abonnementActif });
    mocks.getAll.mockResolvedValue([{ id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' }]);

    render(<MonAbonnement />);

    expect(await screen.findByText(/Actif jusqu/)).toBeInTheDocument();
    expect(screen.getByText('Mensuel')).toBeInTheDocument();
  });

  it('affiche l’état vide uniquement lorsqu’aucune formule n’est renvoyée', async () => {
    mocks.get.mockResolvedValue({ data: { a_abonnement: false } });
    mocks.getAll.mockResolvedValue([]);

    render(<MonAbonnement />);

    expect(await screen.findByText(/Aucune formule disponible/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche une erreur de chargement au lieu de l’état vide', async () => {
    mocks.get.mockRejectedValue(new Error('Network error'));
    mocks.getAll.mockResolvedValue([]);

    render(<MonAbonnement />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger l'abonnement/);
    expect(screen.queryByText(/Aucune formule disponible/)).not.toBeInTheDocument();
  });

  it('relance le chargement et masque l’erreur après une nouvelle réponse valide', async () => {
    mocks.get
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: abonnementActif });
    mocks.getAll.mockResolvedValue([{ id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' }]);
    const user = userEvent.setup();

    render(<MonAbonnement />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Mensuel')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
