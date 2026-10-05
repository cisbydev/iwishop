import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerClients: vi.fn(),
  listerClientsAvecDette: vi.fn(),
  obtenirHistoriqueClient: vi.fn(),
  creerClient: vi.fn(),
  enregistrerRemboursement: vi.fn(),
  corrigerRemboursement: vi.fn(),
  utilisateur: { est_proprietaire: true },
  aAccesPremium: undefined,
  supportActif: false,
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
  useSettings: () => ({
    parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur, aAccesPremium: mocks.aAccesPremium,
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: mocks.supportActif, boutiqueId: null }),
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

// Vente à crédit de 6000 sans acompte, annulée : l'annulation ne change que
// le statut, montant_du et statut_paiement restent ceux d'avant.
function venteAnnulee(remboursements = []) {
  return {
    id: 51,
    numero: 'V-AD91351B',
    date_vente: '2026-01-03T10:00:00Z',
    statut: 'ANNULEE',
    montant_net: '6000.00',
    montant_paye: '0.00',
    montant_du: '6000.00',
    statut_paiement: 'en_attente',
    remboursements,
  };
}

const PHRASE_VENTE_ANNULEE = 'Vente annulée : le client ne doit rien sur cette vente.';

async function ouvrirFicheAvecVentes(ventes) {
  mocks.listerClients.mockResolvedValue([client(1, 'Aïcha', '70000001')]);
  mocks.listerClientsAvecDette.mockResolvedValue([
    { id: 1, nom: 'Aïcha', telephone: '70000001', dette_totale: '600.00' },
  ]);
  mocks.obtenirHistoriqueClient.mockResolvedValue(ventes);
  const user = userEvent.setup({ delay: null });

  render(<Clients />);
  await user.click(await screen.findByText('Aïcha'));
  await screen.findByText(ventes[0].numero);
  return user;
}

// Carte d'une vente dans la fiche, et sa case « Dû ».
const carteVente = (numero) => screen.getByText(numero).closest('li');
const caseDu = (carte) => within(carte).getByText('Dû').parentElement;

// Remplit un champ en un seul collage plutôt que touche par touche :
// aucun test ne vérifie un comportement pendant la frappe, et chaque
// touche simulée coûte cher sous charge (délai de 5 s dépassé).
async function saisir(user, champ, texte) {
  await user.click(champ);
  await user.paste(texte);
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
    mocks.aAccesPremium = undefined;
    mocks.supportActif = false;
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
    await saisir(user, screen.getByLabelText('Nom du client'), 'Nouveau Client');
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
    await saisir(user, champMontant, '1500');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/dépasse le montant dû/)).toBeInTheDocument();
    expect(mocks.enregistrerRemboursement).not.toHaveBeenCalled();
  });

  describe('offre unique : plus de blocage Premium, le refus vient du serveur', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function creerClientRefuse(reponse) {
      mocks.listerClients.mockResolvedValue([]);
      mocks.listerClientsAvecDette.mockResolvedValue([]);
      mocks.creerClient.mockRejectedValue({ response: reponse });
      vi.spyOn(window, 'alert').mockImplementation(() => {});
      const user = userEvent.setup({ delay: null });

      render(<Clients />);
      await screen.findByText('Aucun client enregistré.');
      await user.click(screen.getAllByRole('button', { name: /Ajouter un client/ })[0]);
      await saisir(user, screen.getByLabelText('Nom du client'), 'Nouveau Client');
      await saisir(user, screen.getByLabelText('Téléphone'), '70000005');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() => expect(window.alert).toHaveBeenCalledTimes(1));
    }

    async function rembourserRefuse(reponse) {
      mocks.enregistrerRemboursement.mockRejectedValue({ response: reponse });
      const user = await ouvrirFicheAvec([]);
      await saisir(user, screen.getByLabelText('Enregistrer un remboursement'), '100');
      await user.selectOptions(screen.getByLabelText('Mode de paiement du remboursement'), 'ESPECES');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    }

    it('« Ajouter un client » est actif même si un ancien backend dit aAccesPremium: false', async () => {
      mocks.aAccesPremium = false;
      mocks.listerClients.mockResolvedValue([]);
      mocks.listerClientsAvecDette.mockResolvedValue([]);

      render(<Clients />);
      await screen.findByText('Aucun client enregistré.');

      // En-tête et état vide : deux boutons actifs, aucune bannière Premium.
      const boutons = screen.getAllByRole('button', { name: /Ajouter un client/ });
      expect(boutons).toHaveLength(2);
      boutons.forEach((bouton) => expect(bouton).toBeEnabled());
      expect(screen.queryByText(/Premium/)).not.toBeInTheDocument();
    });

    it("création refusée (abonnement expiré) : message du serveur en alerte, fenêtre et saisie conservées", async () => {
      await creerClientRefuse({ status: 403, data: { detail: 'Abonnement expiré. Merci de renouveler votre abonnement.' } });

      expect(window.alert).toHaveBeenCalledWith('Abonnement expiré. Merci de renouveler votre abonnement.');
      expect(screen.getByLabelText('Nom du client')).toHaveValue('Nouveau Client');
      expect(screen.getByLabelText('Téléphone')).toHaveValue('70000005');
    });

    it('ancien backend PALIER_INSUFFISANT à la création : même chemin, message du serveur en alerte', async () => {
      await creerClientRefuse({
        status: 403, data: { detail: 'Fonctionnalité réservée au palier Premium.', code: 'PALIER_INSUFFISANT' },
      });

      expect(window.alert).toHaveBeenCalledWith('Fonctionnalité réservée au palier Premium.');
      expect(screen.getByLabelText('Nom du client')).toHaveValue('Nouveau Client');
    });

    it('remboursement refusé (abonnement expiré) : message du serveur sous le formulaire, montant conservé', async () => {
      await rembourserRefuse({ status: 403, data: { detail: 'Abonnement expiré. Merci de renouveler votre abonnement.' } });

      expect(await screen.findByText('Abonnement expiré. Merci de renouveler votre abonnement.')).toBeInTheDocument();
      expect(screen.getByLabelText('Enregistrer un remboursement')).toHaveValue(100);
    });

    it('ancien backend PALIER_INSUFFISANT au remboursement : message du serveur sous le formulaire', async () => {
      await rembourserRefuse({
        status: 403, data: { detail: 'Fonctionnalité réservée au palier Premium.', code: 'PALIER_INSUFFISANT' },
      });

      expect(await screen.findByText('Fonctionnalité réservée au palier Premium.')).toBeInTheDocument();
      expect(screen.getByLabelText('Enregistrer un remboursement')).toHaveValue(100);
    });
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
    await saisir(user, champMontant, '300');
    await saisir(user, screen.getByLabelText('Motif de la correction'), 'Erreur de saisie');
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
    await saisir(user, champMontant, '300');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(await screen.findByText('Le motif de la correction est obligatoire.')).toBeInTheDocument();
    expect(mocks.corrigerRemboursement).not.toHaveBeenCalled();
  });

  it('la correction est rejetée si elle ferait dépasser la dette initiale', async () => {
    const user = await ouvrirFicheAvec([remboursement(7, '400.00')]);

    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    const champMontant = screen.getByLabelText('Nouveau montant');
    await user.clear(champMontant);
    await saisir(user, champMontant, '1200');
    await saisir(user, screen.getByLabelText('Motif de la correction'), 'Erreur');
    await user.click(screen.getByRole('button', { name: 'Valider la correction' }));

    expect(await screen.findByText(/ferait dépasser le montant dû/)).toBeInTheDocument();
    expect(mocks.corrigerRemboursement).not.toHaveBeenCalled();
  });

  it('le formulaire de remboursement exige le mode de paiement', async () => {
    const user = await ouvrirFicheAvec([]);

    await saisir(user, screen.getByLabelText('Enregistrer un remboursement'), '100');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Choisissez le mode de paiement.')).toBeInTheDocument();
    expect(mocks.enregistrerRemboursement).not.toHaveBeenCalled();
  });

  it('envoie le mode de paiement choisi avec le remboursement', async () => {
    mocks.enregistrerRemboursement.mockResolvedValue({ id: 9 });
    const user = await ouvrirFicheAvec([]);

    await saisir(user, screen.getByLabelText('Enregistrer un remboursement'), '100');
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

  describe('vente annulée', () => {
    it('badge « Annulée » à la place du badge de paiement, « — » au lieu du montant dû, sans formulaire de remboursement', async () => {
      await ouvrirFicheAvecVentes([venteAnnulee(), venteAvecRemboursements([])]);

      const annulee = carteVente('V-AD91351B');
      expect(within(annulee).getByText('Annulée')).toBeInTheDocument();
      expect(within(annulee).queryByText('En attente')).not.toBeInTheDocument();
      const du = caseDu(annulee);
      expect(within(du).getByText('—')).not.toHaveClass('text-red-700');
      expect(within(du).queryByText(/6\s*000/)).not.toBeInTheDocument();
      expect(within(annulee).getByText(PHRASE_VENTE_ANNULEE)).toBeInTheDocument();
      expect(within(annulee).queryByLabelText('Enregistrer un remboursement')).not.toBeInTheDocument();

      // La vente non annulée de la même fiche ne change pas.
      const normale = carteVente('V-ABCD1234');
      expect(within(normale).getByText('Partiel')).toBeInTheDocument();
      expect(within(normale).queryByText('Annulée')).not.toBeInTheDocument();
      expect(within(caseDu(normale)).getByText(/^600\s*FCFA$/)).toHaveClass('text-red-700');
      expect(within(normale).getByLabelText('Enregistrer un remboursement')).toBeInTheDocument();

      // On compte : un seul formulaire et une seule phrase pour deux ventes.
      expect(screen.getAllByLabelText('Enregistrer un remboursement')).toHaveLength(1);
      expect(screen.getAllByText(PHRASE_VENTE_ANNULEE)).toHaveLength(1);
    });

    it("aAccesPremium: false (ancien backend) n'a plus d'effet : formulaire et « Corriger » sur la vente normale, rien sur l'annulée", async () => {
      mocks.aAccesPremium = false;

      await ouvrirFicheAvecVentes([venteAnnulee(), venteAvecRemboursements([remboursement(7, '400.00')])]);

      const annulee = carteVente('V-AD91351B');
      expect(within(annulee).queryByLabelText('Enregistrer un remboursement')).not.toBeInTheDocument();
      const normale = carteVente('V-ABCD1234');
      expect(within(normale).getByLabelText('Enregistrer un remboursement')).toBeInTheDocument();
      expect(within(normale).getByRole('button', { name: 'Corriger' })).toBeInTheDocument();
      expect(screen.queryByText(/Premium/)).not.toBeInTheDocument();
    });

    it('les remboursements d\'une vente annulée restent visibles, sans bouton Corriger', async () => {
      await ouvrirFicheAvecVentes([venteAnnulee([remboursement(7, '400.00', { mode: 'ESPECES' })])]);

      const annulee = carteVente('V-AD91351B');
      expect(within(annulee).getByText('Remboursements')).toBeInTheDocument();
      expect(within(annulee).getByText(/proprio · Espèces/)).toBeInTheDocument();
      expect(within(annulee).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    });

    it('en vue support, la vente annulée est aussi marquée « Annulée » avec « — »', async () => {
      mocks.supportActif = true;

      await ouvrirFicheAvecVentes([venteAnnulee()]);

      const annulee = carteVente('V-AD91351B');
      expect(within(annulee).getByText('Annulée')).toBeInTheDocument();
      expect(within(caseDu(annulee)).getByText('—')).toBeInTheDocument();
      expect(within(annulee).queryByLabelText('Enregistrer un remboursement')).not.toBeInTheDocument();
    });

    it('champ statut absent (ancien backend) : affichage inchangé, jamais déduit des autres champs', async () => {
      const sansStatut = venteAnnulee();
      delete sansStatut.statut;

      await ouvrirFicheAvecVentes([sansStatut]);

      const carte = carteVente('V-AD91351B');
      expect(within(carte).getByText('En attente')).toBeInTheDocument();
      expect(within(carte).queryByText('Annulée')).not.toBeInTheDocument();
      expect(within(caseDu(carte)).getByText(/^6\s*000\s*FCFA$/)).toHaveClass('text-red-700');
      expect(within(carte).queryByText(PHRASE_VENTE_ANNULEE)).not.toBeInTheDocument();
      expect(within(carte).getByLabelText('Enregistrer un remboursement')).toBeInTheDocument();
    });
  });
});
