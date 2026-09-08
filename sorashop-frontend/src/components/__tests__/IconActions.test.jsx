import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { delete: mocks.delete, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: { est_proprietaire: true },
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Expenses from '../Expenses';
import Products from '../Products';

describe('actions iconiques accessibles', () => {
  beforeEach(() => {
    mocks.delete.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nomme explicitement Modifier et Supprimer un produit, sans retirer sa confirmation', async () => {
    mocks.getAll.mockImplementation((endpoint) => {
      if (endpoint === 'produits/') {
        return Promise.resolve([{
          id: 1,
          nom: 'Savon',
          prix_achat: '100',
          prix_unitaire: '150',
          prix_douzaine: '1800',
          quantite_en_stock: 5,
          stock_minimum: 1,
        }]);
      }
      return Promise.resolve([]);
    });
    const user = userEvent.setup();

    render(<Products />);

    expect(await screen.findByRole('button', { name: 'Modifier le produit Savon' })).toBeInTheDocument();
    const supprimer = screen.getByRole('button', { name: 'Supprimer le produit Savon' });
    await user.click(supprimer);

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('nomme explicitement l’annulation d’une dépense et conserve sa confirmation', async () => {
    mocks.getAll.mockResolvedValue([{
      id: 1,
      titre: 'Loyer',
      categorie: 'LOYER',
      montant: '50000',
      date_depense: '2026-01-01',
      statut: 'VALIDEE',
    }]);
    const user = userEvent.setup();

    render(<Expenses />);

    const annuler = await screen.findByRole('button', { name: 'Annuler la dépense Loyer' });
    await user.click(annuler);

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
