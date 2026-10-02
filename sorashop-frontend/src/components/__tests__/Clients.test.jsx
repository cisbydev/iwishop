import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerClients: vi.fn(),
  listerClientsAvecDette: vi.fn(),
  obtenirHistoriqueClient: vi.fn(),
  creerClient: vi.fn(),
  enregistrerRemboursement: vi.fn(),
  corrigerRemboursement: vi.fn(),
  utilisateur: { est_proprietaire: true },
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

import Clients from '../Clients';

function client(id, nom, telephone) {
  return { id, nom, telephone, adresse: '', plafond_credit: null, date_creation: '2026-01-01T00:00:00Z' };
}

function remboursement(id, montant, { corrige = null, motif = '', mode = null } = {}) {
  return {
    id,
    montant,
    date_remboursement: '2026-01-02T10:00:00Z',
    enregistre_par_nom: 'proprio',
    remboursement_corrige: corrige,
    motif_correction: motif,
    mode_paiement: mode,
  };
}

// Vente à crédit de 1000 sans acompte, 400 remboursés (dû : 600).
function venteAvecRemboursements(remboursements) {
  return {
    id: 42,
    numero: 'V-ABCD1234',
    date_vente: '2026-01-01T10:00:00Z',
    statut: 'VALIDEE',
    montant_net: '1000.00',
    montant_paye: '0.00',
    montant_du: '600.00',
    statut_paiement: 'partiel',
    remboursements,
  };
}

async function ouvrirFicheAvec(remboursements) {
  mocks.listerClients.mockResolvedValue([client(1, 'Aïcha', '70000001')]);
  mocks.listerClientsAvecDette.mockResolvedValue([
    { id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '600.00' },
  ]);
  mocks.obtenirHistoriqueClient.mockResolvedValue([venteAvecRemboursements(remboursements)]);
  const user = userEvent.setup({ delay: null });

  render(<Clients />);
  await user.click(await screen.findByText('Aïcha'));
  await screen.findByText('V-ABCD1234');
  return user;
}

describe('Clients', () => {
  beforeEach(() => {
    mocks.listerClients.mockReset();
    mocks.listerClientsAvecDette.mockReset();
    mocks.obtenirHistoriqueClient.mockReset();
    mocks.creerClient.mockReset();
    mocks.enregistrerRemboursement.mockReset();
    mocks.corrigerRemboursement.mockReset();
    mocks.utilisateur = { est_proprietaire: true };
  });

  it('affiche la liste des clients avec un badge de dette uniquement pour ceux qui en ont une', async () => {
    mocks.listerClients.mockResolvedValue([
      client(1, 'Aïcha', '70000001'),
      client(2, 'Boubacar', '70000002'),
    ]);
    mocks.listerClientsAvecDette.mockResolvedValue([
      { id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '1500.00' },
    ]);

    render(<Clients />);

    const carteAicha = (await screen.findByText('Aïcha')).closest('button');
    expect(within(carteAicha).getByText(/Doit/)).toBeInTheDocument();

    const carteBoubacar = screen.getByText('Boubacar').closest('button');
    expect(within(carteBoubacar).queryByText(/Doit/)).not.toBeInTheDocument();
  });

  it("le formulaire d'ajout de client valide le téléphone obligatoire", async () => {
    mocks.listerClients.mockResolvedValue([]);
    mocks.listerClientsAvecDette.mockResolvedValue([]);
    const user = userEvent.setup({ delay: null });

    render(<Clients />);
    await screen.findByText('Aucun client enregistré.');

    await user.click(screen.getAllByRole('button', { name: /Ajouter un client/ })[0]);
    await user.type(screen.getByLabelText('Nom du client'), 'Nouveau Client');
    // Téléphone volontairement laissé vide.
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(mocks.creerClient).not.toHaveBeenCalled();
  });

  it('le formulaire de remboursement rejette un montant supérieur au montant dû', async () => {
    mocks.listerClients.mockResolvedValue([client(1, 'Aïcha', '70000001')]);
    mocks.listerClientsAvecDette.mockResolvedValue([
      { id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '1000.00' },
    ]);
    mocks.obtenirHistoriqueClient.mockResolvedValue([
      {
        id: 42,
        numero: 'V-ABCD1234',
        date_vente: '2026-01-01T10:00:00Z',
        statut: 'VALIDEE',
        montant_net: '1000.00',
        montant_paye: '0.00',
        montant_du: '1000.00',
        statut_paiement: 'en_attente',
        remboursements: [],
      },
    ]);
    const user = userEvent.setup({ delay: null });

    render(<Clients />);
    await user.click(await screen.findByText('Aïcha'));

    const champMontant = await screen.findByLabelText('Enregistrer un remboursement');
    await user.type(champMontant, '1500');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/dépasse le montant dû/)).toBeInTheDocument();
    expect(mocks.enregistrerRemboursement).not.toHaveBeenCalled();
  });

  it("affiche le blocage Premium (pas le message d'erreur générique) si la création d'un client échoue avec code PALIER_INSUFFISANT", async () => {
    mocks.listerClients.mockResolvedValue([]);
    mocks.listerClientsAvecDette.mockResolvedValue([]);
    mocks.creerClient.mockRejectedValue({
      response: { status: 403, data: { detail: 'Fonctionnalité réservée au palier Premium.', code: 'PALIER_INSUFFISANT' } },
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup({ delay: null });

    render(<Clients />);
    await screen.findByText('Aucun client enregistré.');

    await user.click(screen.getAllByRole('button', { name: /Ajouter un client/ })[0]);
    await user.type(screen.getByLabelText('Nom du client'), 'Nouveau Client');
    await user.type(screen.getByLabelText('Téléphone'), '70000005');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/palier Premium/)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("affiche le blocage Premium (pas le message d'erreur générique) si l'enregistrement d'un remboursement échoue avec code PALIER_INSUFFISANT", async () => {
    mocks.listerClients.mockResolvedValue([client(1, 'Aïcha', '70000001')]);
    mocks.listerClientsAvecDette.mockResolvedValue([
      { id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '1000.00' },
    ]);
    mocks.obtenirHistoriqueClient.mockResolvedValue([
      {
        id: 42,
        numero: 'V-ABCD1234',
        date_vente: '2026-01-01T10:00:00Z',
        statut: 'VALIDEE',
        montant_net: '1000.00',
        montant_paye: '0.00',
        montant_du: '1000.00',
        statut_paiement: 'en_attente',
        remboursements: [],
      },
    ]);
    mocks.enregistrerRemboursement.mockRejectedValue({
      response: { status: 403, data: { detail: 'Fonctionnalité réservée au palier Premium.', code: 'PALIER_INSUFFISANT' } },
    });
    const user = userEvent.setup({ delay: null });

    render(<Clients />);
    await user.click(await screen.findByText('Aïcha'));

    const champMontant = await screen.findByLabelText('Enregistrer un remboursement');
    await user.type(champMontant, '100');
    await user.selectOptions(screen.getByLabelText('Mode de paiement du remboursement'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/palier Premium/)).toBeInTheDocument();
  });

  it('groupe chaque correction sous son remboursement d\'origine avec badge et motif, sans bouton Corriger sur la correction', async () => {
    await ouvrirFicheAvec([
      remboursement(7, '400.00'),
      remboursement(8, '-100.00', { corrige: 7, motif: 'Erreur de saisie' }),
    ]);

    expect(screen.getByText('Correction')).toBeInTheDocument();
    expect(screen.getByText('Motif : Erreur de saisie')).toBeInTheDocument();
    // Montant effectif (400 - 100) affiché à côté de l'original.
    expect(screen.getByText(/^300\s*FCFA$/)).toBeInTheDocument();
    // Un seul bouton : sur l'original, jamais sur la ligne de correction.
    expect(screen.getAllByRole('button', { name: 'Corriger' })).toHaveLength(1);
  });

  it("n'affiche pas le bouton Corriger pour un employé", async () => {
    mocks.utilisateur = { est_proprietaire: false };

    await ouvrirFicheAvec([remboursement(7, '400.00')]);

    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
  });

  it('le propriétaire corrige un remboursement : envoie le nouveau montant et le motif puis recharge', async () => {
    mocks.corrigerRemboursement.mockResolvedValue({ id: 8 });
    const user = await ouvrirFicheAvec([remboursement(7, '400.00')]);

    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    const champMontant = screen.getByLabelText('Nouveau montant');
    await user.clear(champMontant);
    await user.type(champMontant, '300');
    await user.type(screen.getByLabelText('Motif de la correction'), 'Erreur de saisie');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(mocks.corrigerRemboursement).toHaveBeenCalledWith(7, 300, 'Erreur de saisie');
    // Historique rechargé après la correction (chargement initial + rechargement).
    await waitFor(() => expect(mocks.obtenirHistoriqueClient).toHaveBeenCalledTimes(2));
  });

  it('la correction exige un motif', async () => {
    const user = await ouvrirFicheAvec([remboursement(7, '400.00')]);

    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    const champMontant = screen.getByLabelText('Nouveau montant');
    await user.clear(champMontant);
    await user.type(champMontant, '300');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(await screen.findByText('Le motif de la correction est obligatoire.')).toBeInTheDocument();
    expect(mocks.corrigerRemboursement).not.toHaveBeenCalled();
  });

  it('la correction est rejetée si elle ferait dépasser la dette initiale', async () => {
    const user = await ouvrirFicheAvec([remboursement(7, '400.00')]);

    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    const champMontant = screen.getByLabelText('Nouveau montant');
    await user.clear(champMontant);
    await user.type(champMontant, '1200');
    await user.type(screen.getByLabelText('Motif de la correction'), 'Erreur');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(await screen.findByText(/ferait dépasser le montant dû/)).toBeInTheDocument();
    expect(mocks.corrigerRemboursement).not.toHaveBeenCalled();
  });

  it('le formulaire de remboursement exige le mode de paiement', async () => {
    const user = await ouvrirFicheAvec([]);

    await user.type(screen.getByLabelText('Enregistrer un remboursement'), '100');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Choisissez le mode de paiement.')).toBeInTheDocument();
    expect(mocks.enregistrerRemboursement).not.toHaveBeenCalled();
  });

  it('envoie le mode de paiement choisi avec le remboursement', async () => {
    mocks.enregistrerRemboursement.mockResolvedValue({ id: 9 });
    const user = await ouvrirFicheAvec([]);

    await user.type(screen.getByLabelText('Enregistrer un remboursement'), '100');
    await user.selectOptions(screen.getByLabelText('Mode de paiement du remboursement'), 'MOBILE_MONEY');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(mocks.enregistrerRemboursement).toHaveBeenCalledWith(42, 100, 'MOBILE_MONEY');
  });

  it('affiche le mode de chaque remboursement, "Non précisé" pour les anciens', async () => {
    await ouvrirFicheAvec([
      remboursement(7, '400.00', { mode: 'MOBILE_MONEY' }),
      remboursement(9, '100.00'),
    ]);

    expect(screen.getByText(/proprio · Mobile Money/)).toBeInTheDocument();
    expect(screen.getByText(/Non précisé/)).toBeInTheDocument();
  });
});
