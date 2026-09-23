import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerMesBoutiques: vi.fn(),
}));

vi.mock('../../services/boutiques', () => ({
  listerMesBoutiques: mocks.listerMesBoutiques,
}));

import { BoutiqueActiveProvider } from '../../context/BoutiqueActiveContext';
import { NavigationPanneauProvider } from '../../context/NavigationPanneauContext';
import NavigationTablette from '../NavigationTablette';
import NavigationMobile from '../NavigationMobile';

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
const PRIORITAIRES_MOBILE = ['Tableau de Bord', 'Ventes', 'Produits & Stocks'];

function renderNavigation(props = {}) {
  return render(
    <BoutiqueActiveProvider>
      <NavigationPanneauProvider activeTab="dashboard" onSelect={vi.fn()} onLogout={vi.fn()} {...props}>
        <NavigationTablette />
        <NavigationMobile />
      </NavigationPanneauProvider>
    </BoutiqueActiveProvider>
  );
}

describe('Navigation (tablette + mobile, panneau Plus partagé)', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.listerMesBoutiques.mockReset();
    mocks.listerMesBoutiques.mockResolvedValue([{ id: 1, nom: 'Boutique Unique', est_proprietaire: true }]);
  });

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

  it('sélectionner une section dans le panneau "Plus" la transmet et ferme le panneau (état partagé)', async () => {
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

  it('un seul panneau "Plus" est jamais ouvert à la fois entre tablette et mobile', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const navTablette = screen.getByRole('navigation', { name: 'Navigation tablette' });
    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });

    await user.click(within(navTablette).getByRole('button', { name: 'Plus' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
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

  it("n'affiche pas la ligne Boutique dans le panneau \"Plus\" avec une seule boutique", async () => {
    const user = userEvent.setup();
    renderNavigation();

    await waitFor(() => expect(mocks.listerMesBoutiques).toHaveBeenCalled());
    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));

    expect(within(screen.getByRole('dialog')).queryByText(/Boutique :/)).not.toBeInTheDocument();
  });

  it("affiche la ligne Boutique dans le panneau \"Plus\" avec deux boutiques et permet d'en changer", async () => {
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
    renderNavigation();

    const navMobile = screen.getByRole('navigation', { name: 'Navigation mobile' });
    await user.click(within(navMobile).getByRole('button', { name: 'Plus' }));
    const panneau = screen.getByRole('dialog');

    const ligne = await within(panneau).findByRole('button', { name: /Boutique : Boutique A/ });
    await user.click(ligne);
    await user.click(within(panneau).getByRole('button', { name: 'Boutique B' }));

    expect(localStorage.getItem('boutique_active_id')).toBe('2');
    expect(reload).toHaveBeenCalledOnce();
  });
});
