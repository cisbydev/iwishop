import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NavigationCompacte from '../NavigationCompacte';

const TOUS_LES_MODULES = [
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

const PRIORITAIRES_TABLETTE = ['Tableau de Bord', 'Ventes', 'Produits & Stocks', 'Stock', 'Achats', 'Historique'];
const PRIORITAIRES_MOBILE = ['Tableau de Bord', 'Ventes', 'Produits & Stocks', 'Historique'];

function renderNavigation(props = {}) {
  return render(
    <NavigationCompacte activeTab="dashboard" onSelect={vi.fn()} onLogout={vi.fn()} {...props} />
  );
}

describe('NavigationCompacte', () => {
  it('affiche directement les sections prioritaires, sans passer par "Plus"', () => {
    renderNavigation();

    const navTablette = screen.getByRole('navigation', { name: 'Navigation tablette' });
    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });

    PRIORITAIRES_TABLETTE.forEach((label) => {
      expect(within(navTablette).getByRole('button', { name: label })).toBeInTheDocument();
    });
    PRIORITAIRES_MOBILE.forEach((label) => {
      expect(within(navMobile).getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('rend le reste des sections accessible via "Plus" côté tablette', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const navTablette = screen.getByRole('navigation', { name: 'Navigation tablette' });
    await user.click(within(navTablette).getByRole('button', { name: 'Plus' }));

    const panneau = screen.getByRole('dialog');
    TOUS_LES_MODULES.filter((label) => !PRIORITAIRES_TABLETTE.includes(label)).forEach((label) => {
      expect(within(panneau).getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('rend le reste des sections accessible via "Plus" côté mobile', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));

    const panneau = screen.getByRole('dialog');
    TOUS_LES_MODULES.filter((label) => !PRIORITAIRES_MOBILE.includes(label)).forEach((label) => {
      expect(within(panneau).getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it("ne perd aucune section (prioritaires + panneau Plus = tous les modules) et ne fait fuiter aucun lien Employés", async () => {
    const user = userEvent.setup();
    renderNavigation();

    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));
    const panneau = screen.getByRole('dialog');

    const sectionsVisibles = new Set([
      ...PRIORITAIRES_MOBILE,
      ...TOUS_LES_MODULES.filter((label) => within(panneau).queryByRole('button', { name: label })),
    ]);

    expect([...sectionsVisibles].sort()).toEqual([...TOUS_LES_MODULES].sort());
    expect(screen.queryByRole('button', { name: 'Employés' })).not.toBeInTheDocument();
  });

  it('sélectionner une section dans le panneau "Plus" la transmet et ferme le panneau', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderNavigation({ onSelect });

    const navTablette = screen.getByRole('navigation', { name: 'Navigation tablette' });
    await user.click(within(navTablette).getByRole('button', { name: 'Plus' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Paramètres' }));

    expect(onSelect).toHaveBeenCalledWith('settings');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la déconnexion depuis le panneau "Plus" fonctionne et referme le panneau', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderNavigation({ onLogout });

    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }));

    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la touche Échap referme le panneau "Plus"', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const navTablette = screen.getByRole('navigation', { name: 'Navigation tablette' });
    await user.click(within(navTablette).getByRole('button', { name: 'Plus' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
