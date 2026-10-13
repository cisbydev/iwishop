import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  refetchParametres: vi.fn(),
  utilisateur: { est_proprietaire: true },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put, patch: mocks.patch, delete: mocks.delete },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: mocks.utilisateur,
    refetchParametres: mocks.refetchParametres,
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Expenses from '../Expenses';
import Stock from '../Stock';
import Products from '../Products';
import Categories from '../Categories';
import UnitesVente from '../UnitesVente';
import Settings from '../Settings';
import Employees from '../Employees';
import Assistant from '../Assistant';
import RefusAbonnementExpire from '../RefusAbonnementExpire';

const DETAIL = 'Abonnement expiré. Merci de renouveler votre abonnement.';
const MESSAGE_PROPRIETAIRE = "Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée.";

const refus = (data, status = 403) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data },
});
const REFUS_EXPIRE = () => refus({ detail: DETAIL, code: 'ABONNEMENT_EXPIRE' });
const REFUS_ANCIEN_BACKEND = () => refus({ detail: DETAIL });

// Comme dans App.jsx : l'écran, puis le message monté une seule fois après lui.
function rendre(ecran) {
  return render(
    <>
      {ecran}
      <RefusAbonnementExpire />
    </>
  );
}

// paste plutôt que type : même leçon que Clients.test.jsx. saisir pour un
// champ vide, coller pour un champ prérempli (vidé d'abord).
async function saisir(user, champ, texte) {
  await user.click(champ);
  await user.paste(texte);
}

async function coller(user, champ, texte) {
  await user.clear(champ);
  await saisir(user, champ, texte);
}

const appelsGetAll = (endpoint) => mocks.getAll.mock.calls.filter(([e]) => e === endpoint).length;

async function messageEnHaut() {
  expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
  expect(window.alert).not.toHaveBeenCalled();
}

// Mon abonnement, ouvert par « Renouveler » (cf. le commit 4).
function configurerMonAbonnement(getAllEcran) {
  mocks.getAll.mockImplementation((endpoint) => (endpoint === 'tenants/formules-abonnement/'
    ? Promise.resolve([{ id: 2, nom: '1 MOIS', duree_jours: 30, prix: '15000' }])
    : getAllEcran(endpoint)));
  mocks.get.mockResolvedValue({
    data: { a_abonnement: true, statut: 'ACTIF', abonnement_valide: false, date_fin: '2026-10-01' },
  });
}

// « Renouveler » ouvre Mon abonnement après `fenetre` dans le DOM (même
// couche z-50 : elle passe devant) ; on la ferme et on rend la main.
async function renouvelerDevant(user, fenetre) {
  await user.click(await screen.findByRole('button', { name: 'Renouveler' }));
  const abonnement = await screen.findByRole('dialog', { name: 'Mon abonnement' });
  expect(await within(abonnement).findByText('Expiré')).toBeInTheDocument();
  expect(fenetre.compareDocumentPosition(abonnement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.click(within(abonnement).getByRole('button', { name: 'Fermer' }));
  expect(screen.queryByRole('dialog', { name: 'Mon abonnement' })).not.toBeInTheDocument();
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
  mocks.utilisateur = { est_proprietaire: true };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dépenses : création et annulation refusées après l’expiration', () => {
  it('création : message en haut, sans alert(), fenêtre et saisie conservées, bouton revenu à son état normal', async () => {
    mocks.getAll.mockResolvedValue([]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Expenses />);
    await user.click((await screen.findAllByRole('button', { name: /Ajouter une dépense/ }))[0]);
    const fenetre = screen.getByRole('heading', { name: 'Ajouter une nouvelle dépense' }).closest('.fixed');
    await saisir(user, within(fenetre).getByPlaceholderText('Ex: Loyer boutique - Août'), 'Loyer');
    await saisir(user, within(fenetre).getByRole('spinbutton'), '50000');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer' }));

    await messageEnHaut();
    expect(within(fenetre).getByPlaceholderText('Ex: Loyer boutique - Août')).toHaveValue('Loyer');
    expect(within(fenetre).getByRole('spinbutton')).toHaveValue(50000);
    expect(within(fenetre).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(appelsGetAll('depenses/')).toBe(1);
  });

  it('annulation : message en haut, sans alert(), liste non rechargée, bouton revenu à son état normal', async () => {
    mocks.getAll.mockResolvedValue([{
      id: 1, titre: 'Loyer', categorie: 'LOYER', montant: '50000', date_depense: '2026-01-01', statut: 'VALIDEE',
    }]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Expenses />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la dépense Loyer' }));

    await messageEnHaut();
    expect(appelsGetAll('depenses/')).toBe(1);
    expect(screen.getByRole('button', { name: 'Annuler la dépense Loyer' })).toBeEnabled();
  });
});

describe('Stock : mouvement refusé après l’expiration', () => {
  it('message en haut, sans alert(), saisie conservée, bouton revenu à son état normal', async () => {
    mocks.getAll.mockImplementation((endpoint) => Promise.resolve(
      endpoint === 'produits/' ? [{ id: 1, nom: 'Savon', quantite_en_stock: 5 }] : []
    ));
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Stock />);
    const enregistrer = await screen.findByRole('button', { name: 'Enregistrer le mouvement' });
    await saisir(user, screen.getByRole('spinbutton'), '12');
    await saisir(user, screen.getByPlaceholderText('Ex: Réception fournisseur, casse, comptage...'), 'Réception');
    await user.click(enregistrer);

    await messageEnHaut();
    expect(screen.getByRole('spinbutton')).toHaveValue(12);
    expect(screen.getByPlaceholderText('Ex: Réception fournisseur, casse, comptage...')).toHaveValue('Réception');
    expect(screen.getByRole('button', { name: 'Enregistrer le mouvement' })).toBeEnabled();
    expect(appelsGetAll('produits/')).toBe(1);
  });
});

describe('Produits : modification et suppression refusées après l’expiration', () => {
  const produits = (endpoint) => Promise.resolve(endpoint === 'produits/' ? [{
    id: 1, nom: 'Savon', categorie: null, prix_achat: '100', prix_unitaire: '150', prix_douzaine: '1800',
    quantite_en_stock: 5, stock_minimum: 1,
  }] : []);

  async function modifier(user) {
    rendre(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Modifier le produit Savon' }));
    const fenetre = screen.getByRole('heading', { name: 'Modifier le produit' }).closest('.fixed');
    await coller(user, within(fenetre).getAllByRole('textbox')[0], 'Savon de Marseille');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }));
    return fenetre;
  }

  it('modification : message en haut, sans alert(), fenêtre et saisie conservées, prix jamais envoyés, bouton normal', async () => {
    mocks.getAll.mockImplementation(produits);
    mocks.put.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    const fenetre = await modifier(user);

    await messageEnHaut();
    expect(within(fenetre).getAllByRole('textbox')[0]).toHaveValue('Savon de Marseille');
    expect(within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' })).toBeEnabled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('« Renouveler » ouvre Mon abonnement devant la fenêtre produit ; à la fermeture, saisie intacte', async () => {
    configurerMonAbonnement(produits);
    mocks.put.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    const fenetre = await modifier(user);
    await renouvelerDevant(user, fenetre);

    expect(within(fenetre).getAllByRole('textbox')[0]).toHaveValue('Savon de Marseille');
  });

  it('suppression : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockImplementation(produits);
    mocks.delete.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer le produit Savon' }));

    await messageEnHaut();
    expect(mocks.delete).toHaveBeenCalledWith('produits/1/');
    expect(appelsGetAll('produits/')).toBe(1);
  });
});

describe('Catégories : création et suppression refusées après l’expiration', () => {
  it('création : message en haut, sans alert(), fenêtre et saisie conservées, bouton revenu à son état normal', async () => {
    mocks.getAll.mockResolvedValue([]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Categories />);
    await screen.findByText(/Aucune catégorie enregistrée/);
    await user.click(screen.getAllByRole('button', { name: /Ajouter une catégorie/ })[0]);
    await saisir(user, screen.getByPlaceholderText(/Robes/), 'Hygiène');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await messageEnHaut();
    expect(screen.getByPlaceholderText(/Robes/)).toHaveValue('Hygiène');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(appelsGetAll('categories/')).toBe(1);
  });

  it('suppression : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockResolvedValue([{ id: 3, nom: 'Hygiène', description: '' }]);
    mocks.delete.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Categories />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer la catégorie Hygiène' }));

    await messageEnHaut();
    expect(appelsGetAll('categories/')).toBe(1);
  });
});

describe('Unités de vente : création, suppression et suppression forcée refusées après l’expiration', () => {
  const unites = [{ id: 20, nom: 'Sac 25kg', facteur_conversion: '25.000', est_systeme: false }];

  it('création : message en haut, sans alert(), fenêtre et saisie conservées', async () => {
    mocks.getAll.mockResolvedValue([]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<UnitesVente />);
    await user.click(await screen.findByRole('button', { name: /Ajouter une unité/ }));
    await saisir(user, screen.getByPlaceholderText('Ex: Kg, Sac 25kg, Carton...'), 'Carton');
    await saisir(user, screen.getByPlaceholderText('Ex: 25 pour un sac de 25kg'), '12');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await messageEnHaut();
    expect(screen.getByPlaceholderText('Ex: Kg, Sac 25kg, Carton...')).toHaveValue('Carton');
    expect(screen.getByPlaceholderText('Ex: 25 pour un sac de 25kg')).toHaveValue(12);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(appelsGetAll('produits/unites-vente/')).toBe(1);
  });

  it('suppression : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockResolvedValue(unites);
    mocks.delete.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<UnitesVente />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));

    await messageEnHaut();
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(appelsGetAll('produits/unites-vente/')).toBe(1);
  });

  it('suppression forcée (prix liés, puis refus) : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockResolvedValue(unites);
    mocks.delete
      .mockRejectedValueOnce(refus({ detail: 'Unité utilisée.', nb_produit_prix_lies: 2 }, 400))
      .mockRejectedValueOnce(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<UnitesVente />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));

    await messageEnHaut();
    expect(mocks.delete).toHaveBeenLastCalledWith('produits/unites-vente/20/?force=true');
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(appelsGetAll('produits/unites-vente/')).toBe(1);
  });
});

describe('Paramètres : boutique refusée après l’expiration', () => {
  it('message en haut, sans alert(), saisie conservée, bouton revenu à son état normal', async () => {
    mocks.get.mockResolvedValue({ data: { nom_boutique: 'Boutique Awa', devise: 'FCFA', tva: '0.00', seuil_dette_retard_jours: 7 } });
    mocks.patch.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Settings />);
    const enregistrer = await screen.findByRole('button', { name: 'Enregistrer les paramètres' });
    const nom = screen.getAllByRole('textbox')[0];
    expect(nom).toHaveValue('Boutique Awa');
    await coller(user, nom, 'Boutique Awa et Fils');
    await user.click(enregistrer);

    await messageEnHaut();
    expect(nom).toHaveValue('Boutique Awa et Fils');
    expect(screen.getByRole('button', { name: 'Enregistrer les paramètres' })).toBeEnabled();
    expect(mocks.refetchParametres).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe('Employés : création, désactivation et réactivation refusées après l’expiration', () => {
  it('création : message en haut, sans alert(), fenêtre et saisie conservées', async () => {
    mocks.getAll.mockResolvedValue([]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    const { container } = rendre(<Employees />);
    await user.click(await screen.findByRole('button', { name: /Ajouter un employé/ }));
    const identifiant = screen.getAllByRole('textbox')[0];
    const motDePasse = container.querySelector('input[type="password"]');
    await saisir(user, identifiant, 'moussa');
    await saisir(user, motDePasse, 'secret-123');
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }));

    await messageEnHaut();
    expect(identifiant).toHaveValue('moussa');
    expect(motDePasse).toHaveValue('secret-123');
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeEnabled();
    expect(appelsGetAll('accounts/employes/')).toBe(1);
  });

  it('désactivation : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockResolvedValue([{ id: 8, username: 'moussa', first_name: '', last_name: '', is_active: true }]);
    mocks.delete.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Employees />);
    await user.click(await screen.findByRole('button', { name: 'Désactiver' }));

    await messageEnHaut();
    expect(mocks.delete).toHaveBeenCalledWith('accounts/employes/8/');
    expect(appelsGetAll('accounts/employes/')).toBe(1);
  });

  it('réactivation : message en haut, sans alert(), liste non rechargée', async () => {
    mocks.getAll.mockResolvedValue([{ id: 8, username: 'moussa', first_name: '', last_name: '', is_active: false }]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Employees />);
    await user.click(await screen.findByRole('button', { name: 'Réactiver' }));

    await messageEnHaut();
    expect(mocks.post).toHaveBeenCalledWith('accounts/employes/8/reactiver/');
    expect(appelsGetAll('accounts/employes/')).toBe(1);
  });
});

describe('Panneau d’Iwi : question refusée après l’expiration', () => {
  async function poser(user) {
    rendre(<Assistant />);
    await user.click(screen.getByRole('button', { name: "Ouvrir Iwi, l'assistant IA" }));
    await saisir(user, screen.getByLabelText('Votre question'), "Qui me doit de l'argent ?");
    await user.click(screen.getByRole('button', { name: 'Envoyer la question' }));
    return screen.getByRole('dialog', { name: "Iwi, l'assistant IA" });
  }

  it('un seul message (en haut), aucune erreur dans le panneau, question conservée, bouton normal', async () => {
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    const panneau = await poser(user);

    await messageEnHaut();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(panneau).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Votre question')).toHaveValue("Qui me doit de l'argent ?");
    expect(screen.getByRole('button', { name: 'Envoyer la question' })).toBeEnabled();
    expect(screen.queryByText('Iwi réfléchit...')).not.toBeInTheDocument();
  });

  it('« Renouveler » ouvre Mon abonnement devant le panneau ; à la fermeture, question intacte', async () => {
    configurerMonAbonnement(() => Promise.resolve([]));
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    const panneau = await poser(user);
    await renouvelerDevant(user, panneau);

    expect(screen.getByRole('dialog', { name: "Iwi, l'assistant IA" })).toBeInTheDocument();
    expect(screen.getByLabelText('Votre question')).toHaveValue("Qui me doit de l'argent ?");
  });

  it('quota atteint (429) : toujours le message du quota dans le panneau, aucun message en haut', async () => {
    mocks.post.mockRejectedValue(refus({}, 429));
    const user = userEvent.setup({ delay: null });

    const panneau = await poser(user);

    expect(await within(panneau).findByRole('alert')).toHaveTextContent(/limite quotidienne/i);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('ancien backend (même texte, sans code) : erreur dans le panneau, aucun message en haut', async () => {
    mocks.post.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const user = userEvent.setup({ delay: null });

    const panneau = await poser(user);

    expect(await within(panneau).findByRole('alert')).toHaveTextContent(DETAIL);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer la question' })).toBeEnabled());
  });
});
