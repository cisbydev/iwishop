import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get },
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: { username: 'Aminata' },
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Dashboard from '../Dashboard';

describe('Dashboard', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('affiche les KPI réels et déclenche la navigation existante vers une nouvelle vente', async () => {
    mocks.get.mockResolvedValue({
      data: {
        chiffre_affaires_jour: 15000,
        chiffre_affaires_mois: 120000,
        nombre_ventes_jour: 4,
        benefice_jour: 7500,
        benefice_mois: 60000,
        produits_rupture_count: 1,
        produits_stock_faible_count: 2,
        meilleurs_produits: [],
        derniers_mouvements: [],
      },
    });
    const onNouvelleVente = vi.fn();
    const user = userEvent.setup();

    render(<Dashboard onNouvelleVente={onNouvelleVente} />);

    expect(await screen.findByText(/15\s000 FCFA/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bonjour, Aminata/ })).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('dashboard/kpis/');

    await user.click(screen.getByRole('button', { name: 'Créer une nouvelle vente' }));

    expect(onNouvelleVente).toHaveBeenCalledTimes(1);
  });
});
