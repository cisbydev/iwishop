import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
  sauvegarderCatalogue: vi.fn(),
  chargerCatalogueCache: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../services/offlineQueue', () => ({
  ajouterVenteEnAttente: mocks.ajouterVenteEnAttente,
}));

vi.mock('../../services/catalogueCache', () => ({
  sauvegarderCatalogue: mocks.sauvegarderCatalogue,
  chargerCatalogueCache: mocks.chargerCatalogueCache,
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

const LIGNES = [{ produit: 1, unite: 1, quantite: 1, prix_applique: 100 }];

function configurerCatalogue() {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'produits/') return Promise.resolve([{ id: 1, nom: 'Savon', quantite_en_stock: 10 }]);
    if (endpoint === 'produits/prix/') return Promise.resolve([{ produit: 1, unite: 1, unite_nom: 'Unité', prix: '100' }]);
    if (endpoint === 'produits/unites-vente/') return Promise.resolve([{ id: 1, facteur_conversion: '1' }]);
    return Promise.resolve([]);
  });
}

async function preparerVente(user, { facture }) {
  render(<Sales />);
  await screen.findByText('Savon (Stock : 10)');
  await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
  await user.type(screen.getByPlaceholderText('0'), '100');
  if (facture) await user.click(screen.getByRole('checkbox', { name: 'Facture' }));
}

describe('Sales : case « Facture »', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset();
    mocks.sauvegarderCatalogue.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue(null);
    configurerCatalogue();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('case décochée par défaut : aucune demande de facture envoyée', async () => {
    mocks.post.mockResolvedValue({ data: { id: 9, facture: null } });
    const user = userEvent.setup();

    await preparerVente(user, { facture: false });
    expect(screen.getByRole('checkbox', { name: 'Facture' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await screen.findByText(/Vente enregistrée avec succès/);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('demander_facture');
    expect(screen.queryByText('Facture émise pour cette vente.')).not.toBeInTheDocument();
  });

  it('case cochée : facture demandée, numéro et boutons affichés, case remise à zéro', async () => {
    mocks.post.mockResolvedValue({
      data: { id: 9, facture: { id: 5, numero: 'F-2026-0005', date_emission: '2026-10-15T12:00:00Z', est_annulee: false } },
    });
    const user = userEvent.setup();

    await preparerVente(user, { facture: true });
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByText('Facture émise pour cette vente.')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('ventes/', {
      remise: 0, montant_paye: 100, mode_paiement: 'ESPECES', lignes: LIGNES, demander_facture: true,
    });
    expect(screen.getByText('F-2026-0005')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger la facture F-2026-0005' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Partager la facture F-2026-0005' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Facture' })).not.toBeChecked();
  });

  it("backend pas encore déployé (champ facture absent) : vente enregistrée, avertissement vers l'historique", async () => {
    mocks.post.mockResolvedValue({ data: { id: 9 } });
    const user = userEvent.setup();

    await preparerVente(user, { facture: true });
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByText(/Vente enregistrée avec succès/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "La facture n'a pas été émise : créez-la depuis l'historique des ventes."
    );
    expect(screen.queryByText('Facture émise pour cette vente.')).not.toBeInTheDocument();
  });

  it('hors ligne, case cochée : la demande part dans la file, numéro attribué à la synchronisation', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Network Error'));
    mocks.ajouterVenteEnAttente.mockResolvedValueOnce({ cle_idempotence: 'uuid-1' });
    const user = userEvent.setup();

    await preparerVente(user, { facture: true });
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(
      await screen.findByText(/Numéro de facture attribué à la synchronisation/)
    ).toBeInTheDocument();
    expect(mocks.ajouterVenteEnAttente).toHaveBeenCalledWith({
      remise: 0, montant_paye: 100, mode_paiement: 'ESPECES', lignes: LIGNES, demander_facture: true,
    });
    expect(screen.getByRole('checkbox', { name: 'Facture' })).not.toBeChecked();
  });

  it('hors ligne, case décochée : message habituel, sans mention de facture', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Network Error'));
    mocks.ajouterVenteEnAttente.mockResolvedValueOnce({ cle_idempotence: 'uuid-1' });
    const user = userEvent.setup();

    await preparerVente(user, { facture: false });
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByText('Vente enregistrée - sera envoyée dès que la connexion revient.')).toBeInTheDocument();
    expect(screen.queryByText(/Numéro de facture/)).not.toBeInTheDocument();
  });
});
