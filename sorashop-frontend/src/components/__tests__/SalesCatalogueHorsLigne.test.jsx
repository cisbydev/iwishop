import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
  sauvegarderCatalogue: vi.fn(),
  chargerCatalogueCache: vi.fn(),
  utilisateur: null,
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
    utilisateur: mocks.utilisateur,
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Sales from '../Sales';

const AWA = { id: 7, username: 'awa', boutique_id: 3, boutique_nom: 'Boutique test', est_proprietaire: true };
const CONTEXTE_AWA = { utilisateur_id: 7, utilisateur_nom: 'awa', boutique_id: 3, boutique_nom: 'Boutique test' };

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
    mocks.utilisateur = AWA;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sauvegarde silencieusement le catalogue après un chargement réseau réussi, marqué avec l’utilisateur et la boutique', async () => {
    configurerReponsesReseau();

    render(<Sales />);

    await screen.findByText('Savon (Stock : 10)');
    // Sauvegarde faite par un effet, après l'affichage du catalogue.
    await waitFor(() => expect(mocks.sauvegarderCatalogue).toHaveBeenCalledWith(
      { produits: PRODUITS, prix: PRIX, unites: UNITES }, CONTEXTE_AWA
    ));
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
    expect(mocks.chargerCatalogueCache).toHaveBeenCalledWith(CONTEXTE_AWA);
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

describe('Sales - marque utilisateur et boutique (isolation hors ligne)', () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset().mockResolvedValue({ cle_idempotence: 'uuid-1' });
    mocks.sauvegarderCatalogue.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue(null);
    mocks.utilisateur = AWA;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function preparerVente(user) {
    render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');
    await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
    await user.type(screen.getByPlaceholderText('0'), '100');
  }

  it('contexte connu après le catalogue (chargements en parallèle) : catalogue sauvegardé dès l’arrivée du contexte', async () => {
    configurerReponsesReseau();
    mocks.utilisateur = null;

    const { rerender } = render(<Sales />);
    await screen.findByText('Savon (Stock : 10)');
    expect(mocks.sauvegarderCatalogue).not.toHaveBeenCalled();

    mocks.utilisateur = AWA;
    rerender(<Sales />);

    await waitFor(() => expect(mocks.sauvegarderCatalogue).toHaveBeenCalledWith(
      { produits: PRODUITS, prix: PRIX, unites: UNITES }, CONTEXTE_AWA
    ));
  });

  it('hors ligne, contexte arrivé après le premier échec : « Réessayer » relit le cache de ce contexte', async () => {
    configurerReponsesReseau({ echec: new Error('Network Error') });
    mocks.utilisateur = null;
    mocks.chargerCatalogueCache.mockImplementation((contexte) => Promise.resolve(
      contexte ? { produits: PRODUITS, prix: PRIX, unites: UNITES, derniere_maj: '2026-09-10T08:30:00.000Z' } : null
    ));
    const user = userEvent.setup({ delay: null });

    const { rerender } = render(<Sales />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les données de vente');
    mocks.utilisateur = AWA;
    rerender(<Sales />);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Savon (Stock : 10)')).toBeInTheDocument();
    expect(mocks.chargerCatalogueCache).toHaveBeenLastCalledWith(CONTEXTE_AWA);
  });

  it('backend sans boutique_id : ni sauvegarde ni lecture du catalogue hors ligne', async () => {
    mocks.utilisateur = { id: 7, username: 'awa', boutique_nom: 'Boutique test', est_proprietaire: true };
    configurerReponsesReseau({ echec: new Error('Network Error') });
    mocks.chargerCatalogueCache.mockImplementation((contexte) => Promise.resolve(contexte ? { produits: PRODUITS } : null));

    render(<Sales />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les données de vente');
    expect(mocks.chargerCatalogueCache).toHaveBeenCalledWith(null);
    expect(mocks.sauvegarderCatalogue).not.toHaveBeenCalled();
  });

  it('vente hors ligne sans contexte : refusée, rien en file, panier intact', async () => {
    configurerReponsesReseau();
    mocks.utilisateur = { id: 7, username: 'awa', est_proprietaire: true }; // pas de boutique_id
    mocks.post.mockRejectedValueOnce(new Error('Network Error'));
    const user = userEvent.setup({ delay: null });

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'Vente non enregistrée. Reconnectez-vous en ligne avant de vendre hors ligne.'
    ));
    expect(mocks.ajouterVenteEnAttente).not.toHaveBeenCalled();
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('utilisateur_attendu');
    expect(screen.getByRole('button', { name: 'Valider la Vente' })).toBeEnabled();
  });

  it('vente hors ligne avec contexte : mise en file avec la marque, attendus dans le payload', async () => {
    configurerReponsesReseau();
    mocks.post.mockRejectedValueOnce(new Error('Network Error'));
    const user = userEvent.setup({ delay: null });

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await waitFor(() => expect(mocks.ajouterVenteEnAttente).toHaveBeenCalledTimes(1));
    const [payload, marque] = mocks.ajouterVenteEnAttente.mock.calls[0];
    expect(marque).toEqual(CONTEXTE_AWA);
    expect(payload).toMatchObject({ utilisateur_attendu: 7, boutique_attendue: 3 });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('vente en ligne refusée en 409 VENTE_AUTRE_COMPTE : message dans la page, panier gardé, jamais mise en file', async () => {
    configurerReponsesReseau();
    mocks.post.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 409'), {
      response: { status: 409, data: {
        detail: 'Cette vente a été faite avec un autre compte ou une autre boutique.', code: 'VENTE_AUTRE_COMPTE',
      } },
    }));
    const user = userEvent.setup({ delay: null });

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette vente correspond à une autre boutique ou un autre compte. Rechargez la page.'
    );
    expect(window.alert).not.toHaveBeenCalled();
    expect(mocks.ajouterVenteEnAttente).not.toHaveBeenCalled();
    // Panier gardé : la vente peut être revalidée après rechargement.
    expect(screen.getByRole('button', { name: 'Valider la Vente' })).toBeEnabled();
  });

  it('un autre 409 (sans ce code) garde l’alert() d’avant', async () => {
    configurerReponsesReseau();
    mocks.post.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 409'), {
      response: { status: 409, data: { detail: 'Conflit.' } },
    }));
    const user = userEvent.setup({ delay: null });

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Conflit.'));
    expect(screen.queryByText(/Rechargez la page/)).not.toBeInTheDocument();
  });
});
