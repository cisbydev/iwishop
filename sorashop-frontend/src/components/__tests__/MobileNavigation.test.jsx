import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import MobileNavigation from '../MobileNavigation';

const MODULES_AUTORISES = [
  'Tableau de Bord',
  'Produits & Stocks',
  'Catégories',
  'Stock',
  'Fournisseurs',
  'Achats',
  'Dépenses',
  'Rapports',
  'Paramètres',
  'Ventes',
  'Historique',
];

function renderNavigation(props = {}) {
  return render(
    <MobileNavigation
      activeTab="dashboard"
      onSelect={vi.fn()}
      onLogout={vi.fn()}
      {...props}
    />
  );
}

describe('MobileNavigation', () => {
  it('est fermée au départ et garde le bouton accessible', () => {
    renderNavigation();

    const button = screen.getByRole('button', { name: 'Ouvrir le menu de navigation' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Navigation mobile' })).not.toBeInTheDocument();
  });

  it('s’ouvre puis se ferme avec le même bouton', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu de navigation' }));
    expect(screen.getByRole('navigation', { name: 'Navigation mobile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer le menu de navigation' })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Fermer le menu de navigation' }));
    expect(screen.queryByRole('navigation', { name: 'Navigation mobile' })).not.toBeInTheDocument();
  });

  it('conserve les modules principaux autorisés sans ajouter de lien propriétaire', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu de navigation' }));
    const menu = screen.getByRole('navigation', { name: 'Navigation mobile' });

    MODULES_AUTORISES.forEach((label) => {
      expect(within(menu).getByRole('button', { name: label })).toBeInTheDocument();
    });
    expect(within(menu).queryByRole('button', { name: 'Employés' })).not.toBeInTheDocument();
  });

  it('sélectionne un module, ferme le menu et garde la déconnexion accessible', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onLogout = vi.fn();
    renderNavigation({ onSelect, onLogout });

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu de navigation' }));
    await user.click(screen.getByRole('button', { name: 'Ventes' }));

    expect(onSelect).toHaveBeenCalledWith('sales');
    expect(screen.queryByRole('navigation', { name: 'Navigation mobile' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu de navigation' }));
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('navigation', { name: 'Navigation mobile' })).not.toBeInTheDocument();
  });
});
