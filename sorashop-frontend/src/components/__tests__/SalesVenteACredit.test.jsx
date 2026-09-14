import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
  sauvegarderCatalogue: vi.fn(),
  chargerCatalogueCache: vi.fn(),
  listerClients: vi.fn(),
  creerClient: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../services/offlineQueue', () => ({
  ajouterVenteEnAttente: mocks.ajouterVenteEnAttente,
}));

vi.mock('../../services/catalogueCache', () => ({
  sauvegarderCatalogue: mocks.sauvegarderCatalogue,
  chargerCatalogueCache: mocks.chargerCatalogueCache,
}));

vi.mock('../../services/clients', () => ({
  listerClients: mocks.listerClients,
  creerClient: mocks.creerClient,
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

import Sales from '../Sales';

const PRODUITS = [{ id: 1, nom: 'Savon', quantite_en_stock: 10 }];
const PRIX = [{ produit: 1, unite: 1, unite_nom: 'Unité', prix: '100' }];
const UNITES = [{ id: 1, facteur_conversion: '1' }];

function configurerCatalogue() {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'produits/') return Promise.resolve(PRODUITS);
    if (endpoint === 'produits/prix/') return Promise.resolve(PRIX);
    if (endpoint === 'produits/unites-vente/') return Promise.resolve(UNITES);
    return Promise.resolve([]);
  });
}

async function ajouterUnArticleAuPanier(user) {
  await screen.findByText('Savon (Stock : 10)');
  await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
}

describe('Sales - vente à crédit (V2 étape 5)', () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset();
    mocks.sauvegarderCatalogue.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue(null);
    mocks.listerClients.mockReset().mockResolvedValue([
      { id: 1, nom: 'Aïcha', telephone: '70000001' },
      { id: 2, nom: 'Boubacar', telephone: '70000002' },
    ]);
    mocks.creerClient.mockReset();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    configurerCatalogue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('vente comptant normale : payload inchangé, sans client_credit (non-régression)', async () => {
    mocks.post.mockResolvedValue({ data: { id: 1 } });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.type(screen.getByLabelText('Montant payé par le client :'), '100');
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await screen.findByText(/Vente enregistrée avec succès/);
    expect(mocks.post).toHaveBeenCalledWith('ventes/', expect.objectContaining({
      montant_paye: 100,
      remise: 0,
    }));
    const payloadEnvoye = mocks.post.mock.calls[0][1];
    expect(payloadEnvoye).not.toHaveProperty('client_credit');
    expect(mocks.listerClients).not.toHaveBeenCalled();
  });

  it("activer la vente à crédit sans sélectionner de client bloque la soumission", async () => {
    mocks.post.mockResolvedValue({ data: { id: 1 } });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Sélectionnez un client'));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('vente à crédit avec acompte : le payload contient client_credit et le bon montant_paye', async () => {
    mocks.post.mockResolvedValue({ data: { id: 1 } });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await screen.findByText('Aïcha', { exact: false });
    await user.click(screen.getByText(/Aïcha/));
    await user.type(screen.getByLabelText('Acompte (optionnel)'), '40');

    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await screen.findByText(/Vente enregistrée avec succès/);
    expect(mocks.post).toHaveBeenCalledWith('ventes/', expect.objectContaining({
      client_credit: 1,
      montant_paye: 40,
    }));
  });

  it("créer un nouveau client à la volée depuis le formulaire fonctionne", async () => {
    mocks.creerClient.mockResolvedValue({ id: 99, nom: 'Nouveau Client', telephone: '70999999' });
    mocks.post.mockResolvedValue({ data: { id: 2 } });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await user.click(screen.getByRole('button', { name: '+ Nouveau client' }));
    await user.type(screen.getByLabelText('Nom'), 'Nouveau Client');
    await user.type(screen.getByLabelText('Téléphone'), '70999999');

    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await screen.findByText(/Vente enregistrée avec succès/);
    expect(mocks.creerClient).toHaveBeenCalledWith({ nom: 'Nouveau Client', telephone: '70999999' });
    expect(mocks.post).toHaveBeenCalledWith('ventes/', expect.objectContaining({
      client_credit: 99,
    }));
  });

  it("affiche l'avertissement de plafond de crédit renvoyé par l'API sans bloquer", async () => {
    mocks.post.mockResolvedValue({ data: { id: 1, avertissement: 'Plafond de crédit dépassé pour ce client.' } });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await screen.findByText('Aïcha', { exact: false });
    await user.click(screen.getByText(/Aïcha/));
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByText('Plafond de crédit dépassé pour ce client.')).toBeInTheDocument();
    expect(await screen.findByText(/Vente enregistrée avec succès/)).toBeInTheDocument();
  });

  it("affiche le blocage Premium (pas le message d'erreur générique) si la création échoue avec code PALIER_INSUFFISANT, sans vider le panier", async () => {
    mocks.post.mockRejectedValue({
      response: { status: 403, data: { detail: 'Fonctionnalité réservée au palier Premium.', code: 'PALIER_INSUFFISANT' } },
    });
    const user = userEvent.setup();

    render(<Sales />);
    await ajouterUnArticleAuPanier(user);

    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await screen.findByText('Aïcha', { exact: false });
    await user.click(screen.getByText(/Aïcha/));
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByText(/palier Premium/)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    // Rien de saisi n'est perdu : la ligne ajoutée au panier reste visible.
    expect(screen.getByText('Savon')).toBeInTheDocument();
  });
});
