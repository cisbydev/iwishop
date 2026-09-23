import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  utilisateur: { est_proprietaire: true },
  modeSupport: false,
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: mocks.modeSupport, boutiqueId: null }),
}));

import SalesHistory from '../SalesHistory';
import Purchases from '../Purchases';

function vente(id, statut = 'VALIDEE') {
  return {
    id,
    statut,
    date_vente: '2026-01-01T10:00:00Z',
    lignes: [{ produit_nom: `Produit ${id}`, quantite: 1, unite_nom: 'Unité', prix_applique: '1000' }],
    remise: '0',
    montant_net: '1000',
  };
}

function pageDeVentes(results) {
  return { data: { count: results.length, next: null, previous: null, results } };
}

function achat(id, statut = 'VALIDE') {
  return {
    id,
    statut,
    fournisseur_nom: 'Grossiste',
    date_achat: '2026-01-01T10:00:00Z',
    lignes: [{ produit_nom: 'Riz', quantite: 2, unite_nom: 'Sac', prix_unitaire_achat: '5000' }],
    montant_total: '10000',
  };
}

function mockerDonneesAchats(achats) {
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(endpoint === 'achats/' ? achats : []));
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.getAll.mockReset();
  mocks.post.mockReset();
  mocks.utilisateur = { est_proprietaire: true };
  mocks.modeSupport = false;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Annulation depuis l’historique des ventes', () => {
  it('le propriétaire annule une vente après confirmation, puis la liste est rechargée', async () => {
    mocks.get
      .mockResolvedValueOnce(pageDeVentes([vente(12)]))
      .mockResolvedValueOnce(pageDeVentes([vente(12, 'ANNULEE')]));
    mocks.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la vente #12' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith('ventes/12/annuler/');
    expect(await screen.findByText('Annulée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler la vente #12' })).not.toBeInTheDocument();
  });

  it("n'appelle pas le backend si la confirmation est refusée", async () => {
    window.confirm.mockReturnValue(false);
    mocks.get.mockResolvedValue(pageDeVentes([vente(12)]));
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la vente #12' }));

    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('affiche tel quel le message backend pour une vente à crédit déjà remboursée', async () => {
    const message = "Impossible d'annuler une vente à crédit ayant déjà reçu un remboursement.";
    mocks.get.mockResolvedValue(pageDeVentes([vente(12)]));
    mocks.post.mockRejectedValue({ response: { status: 400, data: [message] } });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la vente #12' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(message));
  });

  it("n'affiche aucun bouton d'annulation pour un employé", async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mocks.get.mockResolvedValue(pageDeVentes([vente(12)]));

    render(<SalesHistory />);

    expect(await screen.findByText('#12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler la vente/ })).not.toBeInTheDocument();
  });

  it('désactive le bouton en Vue Support', async () => {
    mocks.modeSupport = true;
    mocks.get.mockResolvedValue(pageDeVentes([vente(12)]));

    render(<SalesHistory />);

    expect(await screen.findByRole('button', { name: 'Annuler la vente #12' })).toBeDisabled();
  });

  it('grise une vente déjà annulée, affiche le badge et aucun bouton ; #id ne ressemble plus à un lien', async () => {
    mocks.get.mockResolvedValue(pageDeVentes([vente(12, 'ANNULEE'), vente(13)]));

    render(<SalesHistory />);

    const cellule = (await screen.findByText('Annulée')).closest('td');
    expect(cellule).toHaveTextContent('#12');
    expect(cellule.closest('tr')).toHaveClass('opacity-75');
    expect(screen.queryByRole('button', { name: 'Annuler la vente #12' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la vente #13' })).toBeInTheDocument();
    expect(cellule).not.toHaveClass('text-blue-600');
  });
});

describe('Annulation depuis l’historique des achats', () => {
  it('le propriétaire annule un achat après confirmation, puis la liste est rechargée', async () => {
    mockerDonneesAchats([achat(7)]);
    mocks.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<Purchases />);
    const bouton = await screen.findByRole('button', { name: "Annuler l'achat #7" });
    mockerDonneesAchats([achat(7, 'ANNULE')]);
    await user.click(bouton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith('achats/7/annuler/');
    expect(await screen.findByText('Annulé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Annuler l'achat #7" })).not.toBeInTheDocument();
  });

  it('affiche tel quel le message backend quand le stock a déjà été revendu', async () => {
    const message = "Impossible d'annuler cet achat : le stock de 'Riz' (1) est inférieur à la quantité à retirer (2).";
    mockerDonneesAchats([achat(7)]);
    mocks.post.mockRejectedValue({ response: { status: 400, data: [message] } });
    const user = userEvent.setup();

    render(<Purchases />);
    await user.click(await screen.findByRole('button', { name: "Annuler l'achat #7" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(message));
  });

  it("n'affiche aucun bouton d'annulation pour un employé", async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mockerDonneesAchats([achat(7)]);

    render(<Purchases />);

    expect(await screen.findByText('#7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler l'achat/ })).not.toBeInTheDocument();
  });

  it('désactive le bouton en Vue Support', async () => {
    mocks.modeSupport = true;
    mockerDonneesAchats([achat(7)]);

    render(<Purchases />);

    expect(await screen.findByRole('button', { name: "Annuler l'achat #7" })).toBeDisabled();
  });

  it('grise un achat déjà annulé avec le badge et sans bouton', async () => {
    mockerDonneesAchats([achat(7, 'ANNULE')]);

    render(<Purchases />);

    const ligne = (await screen.findByText('Annulé')).closest('tr');
    expect(ligne).toHaveClass('opacity-75');
    expect(within(ligne).queryByRole('button')).not.toBeInTheDocument();
  });
});
