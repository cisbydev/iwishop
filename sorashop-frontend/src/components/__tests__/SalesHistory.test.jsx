import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  utilisateur: { est_proprietaire: false },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import SalesHistory from '../SalesHistory';

function vente(id) {
  return {
    id,
    date_vente: '2026-01-01T10:00:00Z',
    lignes: [{ produit_nom: `Produit ${id}`, quantite: 1, unite_nom: 'Unité', prix_applique: '1000' }],
    remise: '0',
    montant_net: '1000',
  };
}

function pageDeVentes({ count, next, previous, results }) {
  return { data: { count, next, previous, results } };
}

describe('SalesHistory', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.utilisateur = { est_proprietaire: false };
  });

  it('charge seulement la page 1 et affiche ses results', async () => {
    mocks.get.mockResolvedValue(pageDeVentes({
      count: 120,
      next: 'http://api.test/ventes/?page=2',
      previous: null,
      results: [vente(1), vente(2)],
    }));

    render(<SalesHistory />);

    expect(await screen.findByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('120 ventes')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('ventes/', { params: { page: 1 } });
    expect(mocks.getAll).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });

  it('demande une page à la fois avec Suivant puis Précédent', async () => {
    mocks.get
      .mockResolvedValueOnce(pageDeVentes({
        count: 120,
        next: 'http://api.test/ventes/?page=2',
        previous: null,
        results: [vente(1)],
      }))
      .mockResolvedValueOnce(pageDeVentes({
        count: 120,
        next: 'http://api.test/ventes/?page=3',
        previous: 'http://api.test/ventes/?page=1',
        results: [vente(51)],
      }))
      .mockResolvedValueOnce(pageDeVentes({
        count: 120,
        next: 'http://api.test/ventes/?page=2',
        previous: null,
        results: [vente(1)],
      }));
    const user = userEvent.setup();

    render(<SalesHistory />);
    await screen.findByText('#1');

    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('#51')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenNthCalledWith(2, 'ventes/', { params: { page: 2 } });

    await user.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(await screen.findByText('#1')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenNthCalledWith(3, 'ventes/', { params: { page: 1 } });
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it('désactive Suivant à la dernière page', async () => {
    mocks.get.mockResolvedValue(pageDeVentes({
      count: 51,
      next: null,
      previous: 'http://api.test/ventes/?page=1',
      results: [vente(51)],
    }));

    render(<SalesHistory />);

    expect(await screen.findByText('#51')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });

  it("n'affiche pas la section d'export du rapport détaillé pour un employé", async () => {
    mocks.get.mockResolvedValue(pageDeVentes({ count: 0, next: null, previous: null, results: [] }));

    render(<SalesHistory />);
    await screen.findByText('Aucune vente enregistrée.');

    expect(screen.queryByText('Rapport détaillé des ventes (export)')).not.toBeInTheDocument();
  });

  it('le propriétaire peut exporter le rapport détaillé, qui appelle bien reports/ventes-detaillees/export-pdf/', async () => {
    mocks.utilisateur = { est_proprietaire: true };
    mocks.get.mockImplementation((url) => {
      if (url === 'ventes/') {
        return Promise.resolve(pageDeVentes({ count: 0, next: null, previous: null, results: [] }));
      }
      return Promise.resolve({ data: new Blob(['contenu-pdf']) });
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();

    render(<SalesHistory />);
    await screen.findByText('Aucune vente enregistrée.');

    await user.click(screen.getByRole('button', { name: 'Exporter en PDF' }));

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith(
        expect.stringContaining('reports/ventes-detaillees/export-pdf/'),
        { responseType: 'blob' },
      );
    });
  });
});
