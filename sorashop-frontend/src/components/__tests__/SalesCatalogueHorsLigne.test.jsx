import { render, screen } from '@testing-library/react';
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

function configurerReponsesReseau({ produits = PRODUITS, prix = PRIX, unites = UNITES, echec = null } = {}) {
  mocks.getAll.mockImplementation((endpoint) => {
    if (echec) return Promise.reject(echec);
    if (endpoint === 'produits/') return Promise.resolve(produits);
    if (endpoint === 'produits/prix/') return Promise.resolve(prix);
    if (endpoint === 'produits/unites-vente/') return Promise.resolve(unites);
    return Promise.resolve([]);
  });
}

describe('Sales - cache du catalogue hors ligne (PWA Niveau 2, étape 4)', () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset();
    mocks.sauvegarderCatalogue.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sauvegarde silencieusement le catalogue après un chargement réseau réussi', async () => {
    configurerReponsesReseau();

    render(<Sales />);

    await screen.findByText('Savon (Stock : 10)');
    expect(mocks.sauvegarderCatalogue).toHaveBeenCalledWith({ produits: PRODUITS, prix: PRIX, unites: UNITES });
    expect(screen.queryByText(/Catalogue hors ligne/)).not.toBeInTheDocument();
  });

  it("utilise le catalogue en cache et affiche un bandeau permanent en cas de panne réseau", async () => {
    configurerReponsesReseau({ echec: new Error('Network Error') });
    mocks.chargerCatalogueCache.mockResolvedValue({
      produits: PRODUITS,
      prix: PRIX,
      unites: UNITES,
      derniere_maj: '2026-09-10T08:30:00.000Z',
    });

    render(<Sales />);

    // Le catalogue en cache reste utilisable normalement (pas d'écran bloquant).
    await screen.findByText('Savon (Stock : 10)');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const bandeau = await screen.findByRole('status');
    expect(bandeau).toHaveTextContent('Catalogue hors ligne');
    expect(bandeau).toHaveTextContent('Le stock affiché peut être dépassé');
    // La date du cache est bien formatée et visible (10/09/2026, cf. formatDateTime).
    expect(bandeau).toHaveTextContent('10/09/2026');
  });

  it("garde le message d'erreur bloquant actuel si la panne réseau survient sans aucun cache disponible", async () => {
    configurerReponsesReseau({ echec: new Error('Network Error') });
    mocks.chargerCatalogueCache.mockResolvedValue(null);

    render(<Sales />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les données de vente');
    expect(screen.queryByText(/Catalogue hors ligne/)).not.toBeInTheDocument();
  });

  it("garde le message d'erreur bloquant si l'échec n'est pas réseau (erreur serveur), même avec un cache disponible", async () => {
    // Une vraie erreur serveur (réponse reçue) n'est pas une "panne réseau" :
    // le repli sur cache ne doit se déclencher QUE sur une absence totale de
    // réponse, jamais sur un 4xx/5xx qui indique un serveur bien joignable.
    configurerReponsesReseau({ echec: { response: { status: 500 } } });
    mocks.chargerCatalogueCache.mockResolvedValue({
      produits: PRODUITS,
      prix: PRIX,
      unites: UNITES,
      derniere_maj: '2026-09-10T08:30:00.000Z',
    });

    render(<Sales />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les données de vente');
    expect(screen.queryByText(/Catalogue hors ligne/)).not.toBeInTheDocument();
    expect(mocks.chargerCatalogueCache).not.toHaveBeenCalled();
  });

  it('le bandeau reste affiché en permanence tant que les données viennent du cache, pas seulement au chargement', async () => {
    configurerReponsesReseau({ echec: new Error('Network Error') });
    mocks.chargerCatalogueCache.mockResolvedValue({
      produits: PRODUITS,
      prix: PRIX,
      unites: UNITES,
      derniere_maj: '2026-09-10T08:30:00.000Z',
    });
    const user = userEvent.setup();

    render(<Sales />);
    await screen.findByRole('status');

    // Une interaction normale sur l'écran (ajout au panier) ne doit pas
    // faire disparaître le bandeau - contrairement à venteEnAttenteMessage
    // (qui s'auto-efface), celui-ci n'a aucune minuterie de disparition.
    await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));

    expect(screen.getByRole('status')).toHaveTextContent('Catalogue hors ligne');
  });
});
