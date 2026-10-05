import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  listerClients: vi.fn(),
  listerClientsAvecDette: vi.fn(),
  obtenirHistoriqueClient: vi.fn(),
  creerClient: vi.fn(),
  enregistrerRemboursement: vi.fn(),
  corrigerRemboursement: vi.fn(),
  utilisateur: { est_proprietaire: true },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../services/clients', () => ({
  listerClients: mocks.listerClients,
  listerClientsAvecDette: mocks.listerClientsAvecDette,
  obtenirHistoriqueClient: mocks.obtenirHistoriqueClient,
  creerClient: mocks.creerClient,
  enregistrerRemboursement: mocks.enregistrerRemboursement,
  corrigerRemboursement: mocks.corrigerRemboursement,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import SalesHistory from '../SalesHistory';
import Clients from '../Clients';
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

// Remplit un champ en un seul collage (cf. Clients.test.jsx : moins coûteux
// sous charge que la frappe touche par touche).
async function saisir(user, champ, texte) {
  await user.click(champ);
  await user.paste(texte);
}

function configurerMonAbonnement() {
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(
    endpoint === 'tenants/formules-abonnement/' ? [{ id: 2, nom: '1 MOIS', duree_jours: 30, prix: '15000' }] : []
  ));
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
  mocks.utilisateur = { est_proprietaire: true };
  configurerMonAbonnement();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Historique des ventes : annulation refusée après l’expiration', () => {
  const vente = { id: 12, statut: 'VALIDEE', date_vente: '2026-01-01T10:00:00Z', remise: '0', montant_net: '1000',
    lignes: [{ produit_nom: 'Savon', quantite: 1, unite_nom: 'Unité', prix_applique: '1000' }] };

  beforeEach(() => {
    mocks.get.mockImplementation((endpoint) => (endpoint === 'ventes/'
      ? Promise.resolve({ data: { count: 1, next: null, previous: null, results: [vente] } })
      : Promise.reject(new Error(`GET inattendu : ${endpoint}`))));
  });

  const appelsListe = () => mocks.get.mock.calls.filter(([endpoint]) => endpoint === 'ventes/').length;

  it('message dans la page, sans alert(), liste non rechargée, bouton revenu à son état normal', async () => {
    mocks.post.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup();

    rendre(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la vente #12' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(window.alert).not.toHaveBeenCalled();
    expect(appelsListe()).toBe(1);
    const bouton = screen.getByRole('button', { name: 'Annuler la vente #12' });
    expect(bouton).toBeEnabled();
    expect(screen.queryByText('Annulation...')).not.toBeInTheDocument();
  });

  it("ancien backend (même texte, sans code) : alert() d'avant, aucun message dans la page", async () => {
    mocks.post.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const user = userEvent.setup();

    rendre(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Annuler la vente #12' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(DETAIL));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la vente #12' })).toBeEnabled();
  });
});

describe('Clients : ajout refusé après l’expiration', () => {
  async function remplirEtEnvoyer(user) {
    mocks.listerClients.mockResolvedValue([]);
    mocks.listerClientsAvecDette.mockResolvedValue([]);
    rendre(<Clients />);
    await screen.findByText('Aucun client enregistré.');
    await user.click(screen.getAllByRole('button', { name: /Ajouter un client/ })[0]);
    await saisir(user, screen.getByLabelText('Nom du client'), 'Awa');
    await saisir(user, screen.getByLabelText('Téléphone'), '70000005');
    await saisir(user, screen.getByLabelText('Adresse (optionnel)'), 'Bamako');
    await saisir(user, screen.getByLabelText('Plafond de crédit (optionnel)'), '5000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  }

  function saisieConservee() {
    expect(screen.getByLabelText('Nom du client')).toHaveValue('Awa');
    expect(screen.getByLabelText('Téléphone')).toHaveValue('70000005');
    expect(screen.getByLabelText('Adresse (optionnel)')).toHaveValue('Bamako');
    expect(screen.getByLabelText('Plafond de crédit (optionnel)')).toHaveValue(5000);
  }

  it('message dans la page, sans alert(), fenêtre et saisie conservées, boutons revenus à leur état normal', async () => {
    mocks.creerClient.mockRejectedValue(REFUS_EXPIRE());
    const user = userEvent.setup({ delay: null });

    await remplirEtEnvoyer(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(window.alert).not.toHaveBeenCalled();
    saisieConservee();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(screen.queryByText('Enregistrement...')).not.toBeInTheDocument();
  });

  it('« Renouveler » ouvre Mon abonnement après la fenêtre d’ajout (devant elle) ; à la fermeture, saisie intacte', async () => {
    mocks.creerClient.mockRejectedValue(REFUS_EXPIRE());
    mocks.get.mockResolvedValue({
      data: { a_abonnement: true, statut: 'ACTIF', abonnement_valide: false, date_fin: '2026-10-01' },
    });
    const user = userEvent.setup({ delay: null });

    await remplirEtEnvoyer(user);
    await user.click(await screen.findByRole('button', { name: 'Renouveler' }));

    const fenetre = await screen.findByRole('dialog', { name: 'Mon abonnement' });
    expect(await within(fenetre).findByText('Expiré')).toBeInTheDocument();
    // Même couche (z-50) : rendue après la fenêtre d'ajout dans le DOM, elle passe devant.
    const fenetreAjout = screen.getByLabelText('Nom du client').closest('.fixed');
    expect(fenetreAjout.compareDocumentPosition(fenetre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(fenetre).getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog', { name: 'Mon abonnement' })).not.toBeInTheDocument();
    saisieConservee();
  });
});

describe('Fiche client : remboursement et correction refusés après l’expiration', () => {
  const vente = {
    id: 42, numero: 'V-ABCD1234', date_vente: '2026-01-01T10:00:00Z', statut: 'VALIDEE',
    montant_net: '1000.00', montant_paye: '0.00', montant_du: '600.00', statut_paiement: 'partiel',
    remboursements: [{
      id: 7, montant: '400.00', date_remboursement: '2026-01-02T10:00:00Z', enregistre_par_nom: 'proprio',
      remboursement_corrige: null, motif_correction: '', mode_paiement: 'ESPECES',
    }],
  };

  async function ouvrirFiche() {
    mocks.listerClients.mockResolvedValue([
      { id: 1, nom: 'Aïcha', telephone: '70000001', adresse: '', plafond_credit: null, date_creation: '2026-01-01T00:00:00Z' },
    ]);
    mocks.listerClientsAvecDette.mockResolvedValue([{ id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '600.00' }]);
    mocks.obtenirHistoriqueClient.mockResolvedValue([vente]);
    const user = userEvent.setup({ delay: null });
    rendre(<Clients />);
    await user.click(await screen.findByText('Aïcha'));
    await screen.findByText('V-ABCD1234');
    return user;
  }

  async function rembourser(user) {
    await saisir(user, screen.getByLabelText('Enregistrer un remboursement'), '100');
    await user.selectOptions(screen.getByLabelText('Mode de paiement du remboursement'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
  }

  async function corriger(user) {
    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    const champ = screen.getByLabelText('Nouveau montant');
    await user.clear(champ);
    await saisir(user, champ, '300');
    await saisir(user, screen.getByLabelText('Motif de la correction'), 'Erreur de saisie');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));
  }

  it('remboursement : un seul message (en haut), erreur précédente effacée, montant et mode conservés, bouton normal', async () => {
    mocks.enregistrerRemboursement
      .mockRejectedValueOnce(refus({ detail: 'Erreur serveur précédente.' }, 400))
      .mockRejectedValueOnce(REFUS_EXPIRE());
    const user = await ouvrirFiche();

    await rembourser(user);
    expect(await screen.findByText('Erreur serveur précédente.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(screen.queryByText('Erreur serveur précédente.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Enregistrer un remboursement')).toHaveValue(100);
    expect(screen.getByLabelText('Mode de paiement du remboursement')).toHaveValue('ESPECES');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect(mocks.obtenirHistoriqueClient).toHaveBeenCalledTimes(1);
  });

  it('correction : un seul message (en haut), erreur précédente effacée, formulaire ouvert et saisie conservée, bouton normal', async () => {
    mocks.corrigerRemboursement
      .mockRejectedValueOnce(refus({ detail: 'Erreur serveur précédente.' }, 400))
      .mockRejectedValueOnce(REFUS_EXPIRE());
    const user = await ouvrirFiche();

    await corriger(user);
    expect(await screen.findByText('Erreur serveur précédente.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_PROPRIETAIRE);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(screen.queryByText('Erreur serveur précédente.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau montant')).toHaveValue(300);
    expect(screen.getByLabelText('Motif de la correction')).toHaveValue('Erreur de saisie');
    expect(screen.getByRole('button', { name: 'Valider la correction' })).toBeEnabled();
  });

  it('employé, remboursement refusé : « prévenez le propriétaire », sans « Renouveler », saisie conservée', async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mocks.enregistrerRemboursement.mockRejectedValue(REFUS_EXPIRE());
    const user = await ouvrirFiche();

    await rembourser(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_EMPLOYE);
    expect(screen.queryByRole('button', { name: 'Renouveler' })).not.toBeInTheDocument();
    expect(screen.queryByText(DETAIL)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Enregistrer un remboursement')).toHaveValue(100);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('ancien backend, correction refusée (même texte, sans code) : erreur sous le formulaire, aucun message en haut', async () => {
    mocks.corrigerRemboursement.mockRejectedValue(REFUS_ANCIEN_BACKEND());
    const user = await ouvrirFiche();

    await corriger(user);

    expect(await screen.findByText(DETAIL)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider la correction' })).toBeEnabled();
  });
});
