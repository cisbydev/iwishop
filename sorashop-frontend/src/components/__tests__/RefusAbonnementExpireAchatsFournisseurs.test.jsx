import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  utilisateur: { est_proprietaire: true },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.delete },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Purchases from '../Purchases';
import Suppliers from '../Suppliers';
import RefusAbonnementExpire from '../RefusAbonnementExpire';

const DETAIL = 'Abonnement expiré. Merci de renouveler votre abonnement.';
const MESSAGE_PROPRIETAIRE = "Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée.";
const MESSAGE_EMPLOYE = 'Abonnement expiré : prévenez le propriétaire de la boutique.';

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
const appelsGet = (url) => mocks.get.mock.calls.filter(([u]) => u === url).length;

async function messageEnHaut(texte = MESSAGE_PROPRIETAIRE) {
  expect(await screen.findByRole('alert')).toHaveTextContent(texte);
  expect(window.alert).not.toHaveBeenCalled();
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

describe('Achats : enregistrement et annulation refusés après l’expiration', () => {
  function mockerCatalogue(achats = []) {
    const donnees = {
      'produits/': [{ id: 1, nom: 'Riz' }],
      'produits/prix/': [{ produit: 1, unite: 10, unite_nom: 'Unité' }],
      'produits/unites-vente/': [{ id: 10, facteur_conversion: '1.000' }],
      'fournisseurs/': [{ id: 5, nom: 'Grossiste' }],
      'achats/': achats,
    };
    mocks.getAll.mockImplementation((endpoint) => Promise.resolve(donnees[endpoint] ?? []));
  }

  async function remplirEtValider(user) {
    rendre(<Purchases />);
    const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });
    await saisir(user, screen.getByPlaceholderText('0.00'), '60');
    await user.click(ajouter);
    await screen.findByRole('button', { name: "Retirer Riz de l'achat" });
    await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));
  }

  function panierConserve() {
    expect(screen.getByRole('button', { name: "Retirer Riz de l'achat" })).toBeInTheDocument();
    expect(screen.getByLabelText('Mode de paiement')).toHaveValue('ESPECES');
  }

  // En premier : le premier test du fichier paie le démarrage (rendu, requêtes
  // par rôle) ; l'annulation est le plus court (cf. EN_COURS, test instable).
  it('annulation : message en haut, sans alert(), liste non rechargée, bouton revenu à son état normal', async () => {
    mockerCatalogue([{
      id: 7, statut: 'VALIDE', fournisseur_nom: 'Grossiste', date_achat: '2026-01-01T10:00:00Z',
      lignes: [{ produit_nom: 'Riz', quantite: 2, unite_nom: 'Sac', prix_unitaire_achat: '5000' }],
      montant_total: '10000',
    }]);
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Purchases />);
    await user.click(await screen.findByRole('button', { name: "Annuler l'achat #7" }));

    await messageEnHaut();
    expect(appelsGetAll('achats/')).toBe(1);
    expect(screen.getByRole('button', { name: "Annuler l'achat #7" })).toBeEnabled();
    expect(screen.queryByText('Annulation...')).not.toBeInTheDocument();
  });

  it('enregistrement : message en haut, sans alert(), panier et saisie conservés, bouton revenu à son état normal', async () => {
    mockerCatalogue();
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    await remplirEtValider(user);

    await messageEnHaut();
    panierConserve();
    expect(screen.getByRole('button', { name: "Valider l'Achat" })).toBeEnabled();
    expect(screen.queryByText('Validation...')).not.toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("ancien backend, enregistrement (même texte, sans code) : alert() d'avant, aucun message en haut, panier conservé", async () => {
    mockerCatalogue();
    mocks.post.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const user = userEvent.setup({ delay: null });

    await remplirEtValider(user);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(DETAIL));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    panierConserve();
    expect(screen.getByRole('button', { name: "Valider l'Achat" })).toBeEnabled();
  });
});

describe('Fournisseurs : création et suppression refusées après l’expiration', () => {
  function mockerFournisseurs() {
    mocks.getAll.mockImplementation((endpoint) => Promise.resolve(
      endpoint === 'fournisseurs/' ? [{ id: 5, nom: 'Grossiste Diallo', telephone: '', adresse: '' }] : []
    ));
    mocks.get.mockResolvedValue({ data: { dette_totale: '0.00', nombre_fournisseurs: 0 } });
  }

  it('création : message en haut, sans alert(), fenêtre et saisie conservées, boutons revenus à leur état normal', async () => {
    mockerFournisseurs();
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Suppliers />);
    await screen.findByText('Grossiste Diallo');
    await user.click(screen.getAllByRole('button', { name: /Ajouter un fournisseur/ })[0]);
    const fenetre = screen.getByRole('heading', { name: 'Ajouter un nouveau fournisseur' }).closest('.fixed');
    const [nom, telephone, adresse] = within(fenetre).getAllByRole('textbox');
    await saisir(user, nom, 'Huilerie du Sahel');
    await saisir(user, telephone, '76000000');
    await saisir(user, adresse, 'Ségou');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer' }));

    await messageEnHaut();
    expect(nom).toHaveValue('Huilerie du Sahel');
    expect(telephone).toHaveValue('76000000');
    expect(adresse).toHaveValue('Ségou');
    expect(within(fenetre).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(appelsGetAll('fournisseurs/')).toBe(1);
  });

  it('suppression : message en haut, sans alert(), liste non rechargée', async () => {
    mockerFournisseurs();
    mocks.delete.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    rendre(<Suppliers />);
    await user.click(await screen.findByRole('button', { name: 'Supprimer le fournisseur Grossiste Diallo' }));

    await messageEnHaut();
    expect(mocks.delete).toHaveBeenCalledWith('fournisseurs/5/');
    expect(appelsGetAll('fournisseurs/')).toBe(1);
    expect(screen.getByText('Grossiste Diallo')).toBeInTheDocument();
  });
});

describe('Fiche fournisseur : paiement et correction refusés après l’expiration', () => {
  function historique() {
    return [{
      id: 41, date_achat: '2026-10-02T09:30:00Z', statut: 'VALIDE',
      montant_total: '10000.00', montant_paye: '3000.00', mode_paiement: 'ESPECES',
      montant_du: '4500.00', statut_paiement: 'partiel', total_paiements: '2500.00',
      paiements: [{
        id: 71, montant: '2500.00', date_paiement: '2026-10-02T12:00:00Z', enregistre_par_nom: 'awa',
        mode_paiement: 'MOBILE_MONEY', montant_effectif: '2500.00', corrections: [],
      }],
    }];
  }

  async function ouvrirFiche() {
    mocks.getAll.mockImplementation((endpoint) => {
      if (endpoint === 'fournisseurs/') return Promise.resolve([{ id: 5, nom: 'Grossiste Diallo', telephone: '', adresse: '' }]);
      if (endpoint === 'fournisseurs/avec_dette/') {
        return Promise.resolve([{ id: 5, nom: 'Grossiste Diallo', dette_totale: '4500.00', plus_ancienne_dette: new Date().toISOString() }]);
      }
      return Promise.resolve([]);
    });
    mocks.get.mockImplementation((url) => {
      if (url === 'fournisseurs/5/historique/') return Promise.resolve({ data: historique() });
      if (url === 'fournisseurs/dette_totale/') return Promise.resolve({ data: { dette_totale: '4500.00', nombre_fournisseurs: 1 } });
      return Promise.reject(refus({}, 404));
    });
    const user = userEvent.setup({ delay: null });
    rendre(<Suppliers />);
    await user.click(await screen.findByRole('button', { name: 'Dettes et paiements du fournisseur Grossiste Diallo' }));
    const fiche = await screen.findByRole('dialog', { name: 'Dettes et paiements : Grossiste Diallo' });
    const achat = await within(fiche).findByRole('listitem', { name: 'Achat #41' });
    return { user, achat };
  }

  async function payer(user, achat) {
    await saisir(user, within(achat).getByLabelText('Enregistrer un paiement'), '1000');
    await user.selectOptions(within(achat).getByLabelText('Mode de paiement'), 'ESPECES');
    await user.click(within(achat).getByRole('button', { name: 'Enregistrer' }));
  }

  async function corriger(user, achat) {
    await user.click(within(achat).getByRole('button', { name: 'Corriger' }));
    await coller(user, within(achat).getByLabelText('Nouveau montant'), '2000');
    await saisir(user, within(achat).getByLabelText('Motif de la correction'), 'reçu relu');
    await user.click(within(achat).getByRole('button', { name: 'Valider la correction' }));
  }

  it('paiement : un seul message (en haut), erreur précédente effacée, montant et mode conservés, bouton normal', async () => {
    mocks.post
      .mockRejectedValueOnce(refus({ detail: 'Erreur serveur précédente.' }, 400))
      .mockRejectedValueOnce(REFUS_EXPIRE());
    const { user, achat } = await ouvrirFiche();

    await payer(user, achat);
    expect(await within(achat).findByText('Erreur serveur précédente.')).toBeInTheDocument();
    await user.click(within(achat).getByRole('button', { name: 'Enregistrer' }));

    await messageEnHaut();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(within(achat).queryByText('Erreur serveur précédente.')).not.toBeInTheDocument();
    expect(within(achat).getByLabelText('Enregistrer un paiement')).toHaveValue(1000);
    expect(within(achat).getByLabelText('Mode de paiement')).toHaveValue('ESPECES');
    expect(within(achat).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(appelsGet('fournisseurs/5/historique/')).toBe(1);
  });

  it('correction : un seul message (en haut), erreur précédente effacée, formulaire ouvert et saisie conservée, bouton normal', async () => {
    mocks.post
      .mockRejectedValueOnce(refus({ detail: 'Erreur serveur précédente.' }, 400))
      .mockRejectedValueOnce(REFUS_EXPIRE());
    const { user, achat } = await ouvrirFiche();

    await corriger(user, achat);
    expect(await within(achat).findByText('Erreur serveur précédente.')).toBeInTheDocument();
    await user.click(within(achat).getByRole('button', { name: 'Valider la correction' }));

    await messageEnHaut();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(within(achat).queryByText('Erreur serveur précédente.')).not.toBeInTheDocument();
    expect(within(achat).getByLabelText('Nouveau montant')).toHaveValue(2000);
    expect(within(achat).getByLabelText('Motif de la correction')).toHaveValue('reçu relu');
    expect(within(achat).getByRole('button', { name: 'Valider la correction' })).toBeEnabled();
    expect(appelsGet('fournisseurs/5/historique/')).toBe(1);
  });

  it('employé, paiement refusé : « prévenez le propriétaire », sans « Renouveler », saisie conservée', async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const { user, achat } = await ouvrirFiche();

    await payer(user, achat);

    await messageEnHaut(MESSAGE_EMPLOYE);
    expect(screen.queryByRole('button', { name: 'Renouveler' })).not.toBeInTheDocument();
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(within(achat).getByLabelText('Enregistrer un paiement')).toHaveValue(1000);
    expect(within(achat).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('ancien backend, paiement refusé (même texte, sans code) : erreur sous le formulaire, aucun message en haut', async () => {
    mocks.post.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const { user, achat } = await ouvrirFiche();

    await payer(user, achat);

    expect(await within(achat).findByText(DETAIL)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    expect(within(achat).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });
});
