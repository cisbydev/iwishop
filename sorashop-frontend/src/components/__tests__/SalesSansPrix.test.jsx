import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
  sauvegarderCatalogue: vi.fn(),
  chargerCatalogueCache: vi.fn(),
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

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: { id: 7, username: 'awa', boutique_id: 3, boutique_nom: 'Boutique test', est_proprietaire: true },
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Sales from '../Sales';

const PRODUITS = [{ id: 1, nom: 'Savon', quantite_en_stock: 10 }];
const UNITES = [{ id: 1, facteur_conversion: '1' }, { id: 2, facteur_conversion: '12' }];
const SANS_AUCUN_PRIX = [
  { produit: 1, unite: 1, unite_nom: 'Unité', prix: '0.00' },
  { produit: 1, unite: 2, unite_nom: 'Douzaine', prix: '0.00' },
];

function configurerReponsesReseau(prix) {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'produits/') return Promise.resolve(PRODUITS);
    if (endpoint === 'produits/prix/') return Promise.resolve(prix);
    if (endpoint === 'produits/unites-vente/') return Promise.resolve(UNITES);
    return Promise.resolve([]);
  });
}

function verifierAucunPrix() {
  expect(screen.getByText('Aucun prix configuré pour ce produit.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Ajouter au panier/ })).toBeDisabled();
}

// Plan du 2026-10-28 : un prix à 0 veut dire « pas de prix », et le serveur
// refuse la vente. L'écran ne propose donc pas ces unités.
describe('Sales - unités sans prix de vente', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.sauvegarderCatalogue.mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('une unité à prix 0 n’est pas proposée, les autres restent', async () => {
    configurerReponsesReseau([
      { produit: 1, unite: 1, unite_nom: 'Unité', prix: '0.00' },
      { produit: 1, unite: 2, unite_nom: 'Douzaine', prix: '1200.00' },
    ]);

    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');

    expect(screen.getByRole('option', { name: /Douzaine/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Unité/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter au panier/ })).toBeEnabled();
  });

  it('aucune unité avec un prix : « Aucun prix configuré », bouton grisé', async () => {
    configurerReponsesReseau(SANS_AUCUN_PRIX);

    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');

    verifierAucunPrix();
  });

  it('prix absent (champ manquant) : même traitement qu’un prix à 0', async () => {
    configurerReponsesReseau([{ produit: 1, unite: 1, unite_nom: 'Unité' }]);

    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');

    verifierAucunPrix();
  });

  it('catalogue hors ligne : les prix à 0 du cache ne sont pas proposés non plus', async () => {
    mocks.getAll.mockRejectedValue(new Error('Network Error'));
    mocks.chargerCatalogueCache.mockResolvedValue({
      produits: PRODUITS, prix: SANS_AUCUN_PRIX, unites: UNITES, derniere_maj: '2026-10-28T08:00:00.000Z',
    });

    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');
    expect(await screen.findByRole('status')).toHaveTextContent('Catalogue hors ligne');

    verifierAucunPrix();
  });

  it('vente refusée par le serveur (prix passé à 0 entre-temps) : son message est affiché tel quel, panier gardé', async () => {
    const message = "'Savon' n'a pas de prix de vente en 'Unité'. Renseignez-le dans Produits avant de le vendre.";
    configurerReponsesReseau([{ produit: 1, unite: 1, unite_nom: 'Unité', prix: '100.00' }]);
    mocks.post.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 400'), {
      response: { status: 400, data: [message] },
    }));
    const user = userEvent.setup({ delay: null });

    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');
    await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
    await user.type(screen.getByPlaceholderText('0'), '100');
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(message));
    expect(mocks.ajouterVenteEnAttente).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Valider la Vente' })).toBeEnabled();
  });
});
