import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  ajouterVenteEnAttente: vi.fn(),
  sauvegarderCatalogue: vi.fn(),
  chargerCatalogueCache: vi.fn(),
  listerClients: vi.fn(),
  creerClient: vi.fn(),
  utilisateur: null,
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

vi.mock('../../services/clients', () => ({
  listerClients: mocks.listerClients,
  creerClient: mocks.creerClient,
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
import RefusAbonnementExpire from '../RefusAbonnementExpire';
import { alerterErreur } from '../../services/errorUtils';

const DETAIL = 'Abonnement expiré. Merci de renouveler votre abonnement.';
const MESSAGE_PROPRIETAIRE = "Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée.";
const MESSAGE_EMPLOYE = 'Abonnement expiré : prévenez le propriétaire de la boutique.';

function refus(data) {
  return Object.assign(new Error('Request failed with status code 403'), {
    response: { status: 403, data },
  });
}

const REFUS_EXPIRE = () => refus({ detail: DETAIL, code: 'ABONNEMENT_EXPIRE' });
const REFUS_ANCIEN_BACKEND = () => refus({ detail: DETAIL });

function configurerApi() {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'produits/') return Promise.resolve([{ id: 1, nom: 'Savon', quantite_en_stock: 10 }]);
    if (endpoint === 'produits/prix/') return Promise.resolve([{ produit: 1, unite: 1, unite_nom: 'Unité', prix: '100' }]);
    if (endpoint === 'produits/unites-vente/') return Promise.resolve([{ id: 1, facteur_conversion: '1' }]);
    if (endpoint === 'tenants/formules-abonnement/') {
      return Promise.resolve([{ id: 2, nom: '1 MOIS', duree_jours: 30, prix: '15000' }]);
    }
    return Promise.resolve([]);
  });
  mocks.get.mockImplementation((endpoint) => {
    if (endpoint === 'tenants/mon-abonnement/') {
      return Promise.resolve({
        data: { a_abonnement: true, statut: 'ACTIF', abonnement_valide: false, date_fin: '2026-10-01' },
      });
    }
    return Promise.reject(new Error(`GET inattendu : ${endpoint}`));
  });
}

// Comme dans App.jsx : l'écran, puis le message monté une seule fois après lui.
function rendreVentes() {
  return render(
    <>
      <Sales />
      <RefusAbonnementExpire />
    </>
  );
}

async function preparerVenteComptant(user) {
  await screen.findByText('Savon (Stock : 10)');
  await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
  await user.type(screen.getByLabelText('Montant payé par le client :'), '100');
}

function panierContientSavon() {
  return within(screen.getByRole('table')).queryByText('Savon') !== null;
}

describe('RefusAbonnementExpire, écran Ventes', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    mocks.ajouterVenteEnAttente.mockReset();
    mocks.sauvegarderCatalogue.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue(null);
    mocks.listerClients.mockReset().mockResolvedValue([]);
    mocks.creerClient.mockReset();
    mocks.utilisateur = { est_proprietaire: true };
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    configurerApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propriétaire : refus dans la page avec « Renouveler », sans alert(), panier et montant conservés', async () => {
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendreVentes();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await preparerVenteComptant(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(within(message).getByRole('button', { name: 'Renouveler' })).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(panierContientSavon()).toBe(true);
    expect(screen.getByLabelText('Montant payé par le client :')).toHaveValue(100);
  });

  it("« Renouveler » ouvre Mon abonnement par-dessus l'écran ; à la fermeture, le panier est intact", async () => {
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendreVentes();
    await preparerVenteComptant(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));
    await user.click(await screen.findByRole('button', { name: 'Renouveler' }));

    const fenetre = await screen.findByRole('dialog', { name: 'Mon abonnement' });
    expect(await within(fenetre).findByText('Expiré')).toBeInTheDocument();
    expect(within(fenetre).getByText('1 MOIS')).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: 'Choisir cette formule' })).toBeInTheDocument();
    // L'écran Ventes reste monté sous la fenêtre.
    expect(panierContientSavon()).toBe(true);

    await user.click(within(fenetre).getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(panierContientSavon()).toBe(true);
    expect(screen.getByLabelText('Montant payé par le client :')).toHaveValue(100);
  });

  it('vente à crédit, nouveau client refusé : message dans la page, saisie conservée, vente jamais envoyée', async () => {
    mocks.creerClient.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendreVentes();
    await screen.findByText('Savon (Stock : 10)');
    await user.click(screen.getByRole('button', { name: /Ajouter au panier/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Vente à crédit' }));
    await user.click(await screen.findByRole('button', { name: '+ Nouveau client' }));
    await user.type(screen.getByLabelText('Nom'), 'Awa');
    await user.type(screen.getByLabelText('Téléphone'), '70000003');
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(window.alert).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(panierContientSavon()).toBe(true);
    expect(screen.getByLabelText('Nom')).toHaveValue('Awa');
    expect(screen.getByLabelText('Téléphone')).toHaveValue('70000003');
  });

  it("employé : « prévenez le propriétaire », sans bouton « Renouveler »", async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendreVentes();
    await preparerVenteComptant(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent(MESSAGE_EMPLOYE);
    expect(message).not.toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(screen.queryByRole('button', { name: 'Renouveler' })).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("ancien backend (même texte, sans code) : alert() d'avant, aucun message dans la page", async () => {
    mocks.post.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const user = userEvent.setup();

    rendreVentes();
    await preparerVenteComptant(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    await vi.waitFor(() => expect(window.alert).toHaveBeenCalledWith(DETAIL));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(panierContientSavon()).toBe(true);
  });

  it('le message se ferme, et revient au refus suivant', async () => {
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendreVentes();
    await preparerVenteComptant(user);
    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));
    await user.click(await screen.findByRole('button', { name: 'Fermer le message' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Valider la Vente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });
});

describe('RefusAbonnementExpire seul', () => {
  beforeEach(() => {
    mocks.utilisateur = { est_proprietaire: true };
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('utilisateur pas encore chargé : texte du propriétaire, sans bouton ni texte employé', async () => {
    mocks.utilisateur = null;
    render(<RefusAbonnementExpire />);

    act(() => {
      alerterErreur(REFUS_EXPIRE(), 'Erreur.');
    });

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(message).not.toHaveTextContent(MESSAGE_EMPLOYE);
    expect(screen.queryByRole('button', { name: 'Renouveler' })).not.toBeInTheDocument();
  });

  it('deux refus presque en même temps : un seul message', async () => {
    render(<RefusAbonnementExpire />);

    // Deux requêtes refusées dans le même tour (ex. deux écritures parties
    // ensemble), puis une troisième juste après.
    act(() => {
      alerterErreur(REFUS_EXPIRE(), 'Erreur.');
      alerterErreur(REFUS_EXPIRE(), 'Erreur.');
    });
    act(() => {
      alerterErreur(REFUS_EXPIRE(), 'Erreur.');
    });

    await screen.findByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Renouveler' })).toHaveLength(1);
    expect(window.alert).not.toHaveBeenCalled();
  });
});
