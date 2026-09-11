import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../services/offlineQueue', () => ({
  ajouterVenteEnAttente: mocks.ajouterVenteEnAttente,
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

import Categories from '../Categories';
import Sales from '../Sales';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function configureSalesCatalogue() {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'produits/') {
      return Promise.resolve([{ id: 1, nom: 'Savon', quantite_en_stock: 10 }]);
    }
    if (endpoint === 'produits/prix/') {
      return Promise.resolve([{ produit: 1, unite: 1, unite_nom: 'Unité', prix: '100' }]);
    }
    if (endpoint === 'produits/unites-vente/') {
      return Promise.resolve([{ id: 1, facteur_conversion: '1' }]);
    }
    return Promise.resolve([]);
  });
}

async function preparerVente(user) {
  render(<Sales />);
  await screen.findByText('Savon (Stock : 10)');
  await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
  await user.type(screen.getByPlaceholderText('0'), '100');
}

describe('états de soumission', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('protège la validation d’une vente pendant une requête en cours', async () => {
    const request = deferred();
    configureSalesCatalogue();
    mocks.post.mockReturnValue(request.promise);
    const user = userEvent.setup();

    await preparerVente(user);
    const button = screen.getByRole('button', { name: 'Valider la Vente' });

    await user.click(button);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Validation...' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Validation...' }));
    expect(mocks.post).toHaveBeenCalledTimes(1);

    request.resolve({ data: {} });
    expect(await screen.findByText(/Vente enregistrée avec succès/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider la Vente' })).toBeDisabled();
  });

  it('réactive la validation de vente après une vraie erreur serveur et permet une nouvelle tentative', async () => {
    // Erreur de validation réelle (le serveur a répondu, ex: 400) - distincte
    // d'une panne réseau : ce chemin ne doit PAS mettre la vente en file
    // d'attente hors ligne, il reste identique au comportement historique.
    configureSalesCatalogue();
    mocks.post
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: 'Stock insuffisant.' } } })
      .mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByRole('button', { name: 'Valider la Vente' })).toBeEnabled();
    expect(mocks.ajouterVenteEnAttente).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Vente enregistrée avec succès/)).toBeInTheDocument();
  });

  it('met la vente en file d’attente hors ligne (PWA Niveau 2) sur une vraie panne réseau, sans bloquer l’utilisateur', async () => {
    // Panne réseau réelle (axios ne reçoit aucune réponse serveur) : la
    // vente ne doit jamais être perdue ni présentée comme une erreur - elle
    // est mise en file d'attente locale et l'utilisateur voit une
    // confirmation, pas un blocage.
    configureSalesCatalogue();
    mocks.post.mockRejectedValueOnce(new Error('Network Error'));
    mocks.ajouterVenteEnAttente.mockResolvedValueOnce({ cle_idempotence: 'uuid-1' });
    const user = userEvent.setup();

    await preparerVente(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(mocks.ajouterVenteEnAttente).toHaveBeenCalledTimes(1);
    expect(mocks.ajouterVenteEnAttente).toHaveBeenCalledWith({
      remise: 0,
      montant_paye: 100,
      mode_paiement: 'ESPECES',
      lignes: [{ produit: 1, unite: 1, quantite: 1, prix_applique: 100 }],
    });
    expect(
      await screen.findByText(/Vente enregistrée - sera envoyée dès que la connexion revient/)
    ).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    // Le panier est vidé comme pour une vente réussie en ligne (même
    // comportement de fin de soumission) : le bouton redevient disabled
    // faute d'articles, pas parce que la soumission serait bloquée.
    expect(screen.getByRole('button', { name: 'Valider la Vente' })).toBeDisabled();
  });

  it('désactive l’enregistrement d’une catégorie modale pendant sa soumission', async () => {
    const request = deferred();
    mocks.getAll.mockResolvedValue([]);
    mocks.post.mockReturnValue(request.promise);
    const user = userEvent.setup();

    render(<Categories />);
    await screen.findByText(/Aucune catégorie enregistrée/);
    const actionsAjout = screen.getAllByRole('button', { name: /Ajouter une catégorie/ });
    expect(actionsAjout).toHaveLength(2);
    await user.click(actionsAjout[1]);
    expect(screen.getByRole('heading', { name: 'Ajouter une nouvelle catégorie' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Robes/), 'Hygiène');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enregistrement...' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Enregistrement...' }));
    expect(mocks.post).toHaveBeenCalledTimes(1);

    request.resolve({ data: {} });
    expect(await screen.findByText(/Aucune catégorie enregistrée/)).toBeInTheDocument();
  });

  it('préserve l’état d’erreur plutôt que l’état vide après un échec de chargement', async () => {
    mocks.getAll.mockRejectedValue(new Error('API indisponible'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Categories />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aucune catégorie enregistrée.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une catégorie' })).not.toBeInTheDocument();
  });
});
