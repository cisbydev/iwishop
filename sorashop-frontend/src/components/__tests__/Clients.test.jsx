import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerClients: vi.fn(),
  listerClientsAvecDette: vi.fn(),
  obtenirHistoriqueClient: vi.fn(),
  creerClient: vi.fn(),
  enregistrerRemboursement: vi.fn(),
}));

vi.mock('../../services/clients', () => ({
  listerClients: mocks.listerClients,
  listerClientsAvecDette: mocks.listerClientsAvecDette,
  obtenirHistoriqueClient: mocks.obtenirHistoriqueClient,
  creerClient: mocks.creerClient,
  enregistrerRemboursement: mocks.enregistrerRemboursement,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' } }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Clients from '../Clients';

function client(id, nom, telephone) {
  return { id, nom, telephone, adresse: '', plafond_credit: null, date_creation: '2026-01-01T00:00:00Z' };
}

describe('Clients', () => {
  beforeEach(() => {
    mocks.listerClients.mockReset();
    mocks.listerClientsAvecDette.mockReset();
    mocks.obtenirHistoriqueClient.mockReset();
    mocks.creerClient.mockReset();
    mocks.enregistrerRemboursement.mockReset();
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
    const user = userEvent.setup();

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
    const user = userEvent.setup();

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
    const user = userEvent.setup();

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
    const user = userEvent.setup();

    render(<Clients />);
    await user.click(await screen.findByText('Aïcha'));

    const champMontant = await screen.findByLabelText('Enregistrer un remboursement');
    await user.type(champMontant, '100');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/palier Premium/)).toBeInTheDocument();
  });
});
