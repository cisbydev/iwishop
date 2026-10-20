import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getAll: vi.fn(),
  utilisateur: null,
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ utilisateur: mocks.utilisateur }),
}));

import MonAbonnement from '../MonAbonnement';

const abonnementActif = {
  a_abonnement: true,
  statut: 'ACTIF',
  abonnement_valide: true,
  date_fin: '2026-12-31',
};

describe('MonAbonnement', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.getAll.mockReset();
    mocks.utilisateur = { est_proprietaire: true };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche les données chargées avec succès', async () => {
    mocks.get.mockResolvedValue({ data: abonnementActif });
    mocks.getAll.mockResolvedValue([{ id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' }]);

    render(<MonAbonnement />);

    expect(await screen.findByText(/Actif jusqu/)).toBeInTheDocument();
    expect(screen.getByText('Mensuel')).toBeInTheDocument();
  });

  it('affiche l’état vide uniquement lorsqu’aucune formule n’est renvoyée', async () => {
    mocks.get.mockResolvedValue({ data: { a_abonnement: false } });
    mocks.getAll.mockResolvedValue([]);

    render(<MonAbonnement />);

    expect(await screen.findByText(/Aucune formule disponible/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche une erreur de chargement au lieu de l’état vide', async () => {
    mocks.get.mockRejectedValue(new Error('Network error'));
    mocks.getAll.mockResolvedValue([]);

    render(<MonAbonnement />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger l'abonnement/);
    expect(screen.queryByText(/Aucune formule disponible/)).not.toBeInTheDocument();
  });

  it('relance le chargement et masque l’erreur après une nouvelle réponse valide', async () => {
    mocks.get
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: abonnementActif });
    mocks.getAll.mockResolvedValue([{ id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' }]);
    const user = userEvent.setup();

    render(<MonAbonnement />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Mensuel')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('renouvellement réservé au propriétaire', () => {
    const formules = [
      { id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' },
      { id: 2, nom: 'Annuel', duree_jours: 365, prix: '50000' },
    ];

    beforeEach(() => {
      mocks.get.mockResolvedValue({ data: abonnementActif });
      mocks.getAll.mockResolvedValue(formules);
    });

    it('employé : formules affichées sans bouton, avec le texte réservé au propriétaire', async () => {
      mocks.utilisateur = { est_proprietaire: false };

      render(<MonAbonnement />);

      expect(await screen.findByText('Annuel')).toBeInTheDocument();
      expect(screen.getByText('Mensuel')).toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(0);
      expect(screen.getByText('Seul le propriétaire peut renouveler.')).toBeInTheDocument();
    });

    it('propriétaire : un bouton par formule, sans le texte', async () => {
      mocks.utilisateur = { est_proprietaire: true };

      render(<MonAbonnement />);

      await screen.findByText('Annuel');
      expect(screen.getAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(2);
      expect(screen.queryByText('Seul le propriétaire peut renouveler.')).not.toBeInTheDocument();
    });

    it.each([
      ['utilisateur pas encore chargé', null],
      ['champ est_proprietaire absent', {}],
    ])('%s : comportement actuel, les boutons restent', async (_cas, utilisateur) => {
      mocks.utilisateur = utilisateur;

      render(<MonAbonnement />);

      await screen.findByText('Annuel');
      expect(screen.getAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(2);
      expect(screen.queryByText('Seul le propriétaire peut renouveler.')).not.toBeInTheDocument();
    });
  });

  describe('paiement en ligne fermé côté serveur', () => {
    const FERME = 'Paiement en ligne bientôt disponible : contactez-nous pour renouveler.';
    const formules = [
      { id: 1, nom: 'Mensuel', duree_jours: 30, prix: '5000' },
      { id: 2, nom: 'Annuel', duree_jours: 365, prix: '50000' },
    ];

    beforeEach(() => {
      mocks.getAll.mockResolvedValue(formules);
    });

    it('propriétaire, paiement_en_ligne_actif false : formules sans bouton, avec le texte', async () => {
      mocks.get.mockResolvedValue({ data: { ...abonnementActif, paiement_en_ligne_actif: false } });

      render(<MonAbonnement />);

      expect(await screen.findByText('Annuel')).toBeInTheDocument();
      expect(screen.getByText('Mensuel')).toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(0);
      expect(screen.getByText(FERME)).toBeInTheDocument();
    });

    it("employé, paiement fermé : le texte de l'employé passe avant", async () => {
      mocks.utilisateur = { est_proprietaire: false };
      mocks.get.mockResolvedValue({ data: { ...abonnementActif, paiement_en_ligne_actif: false } });

      render(<MonAbonnement />);

      await screen.findByText('Annuel');
      expect(screen.getByText('Seul le propriétaire peut renouveler.')).toBeInTheDocument();
      expect(screen.queryByText(FERME)).not.toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(0);
    });

    it('propriétaire, paiement_en_ligne_actif true : un bouton par formule, sans le texte', async () => {
      mocks.get.mockResolvedValue({ data: { ...abonnementActif, paiement_en_ligne_actif: true } });

      render(<MonAbonnement />);

      await screen.findByText('Annuel');
      expect(screen.getAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(2);
      expect(screen.queryByText(FERME)).not.toBeInTheDocument();
    });

    it('clic refusé en 503 PAIEMENT_EN_LIGNE_INACTIF : detail du serveur affiché, boutons masqués', async () => {
      const detail = 'Texte du serveur : paiement en ligne fermé.';
      mocks.get.mockResolvedValue({ data: abonnementActif });
      mocks.post.mockRejectedValue({ response: { status: 503, data: { detail, code: 'PAIEMENT_EN_LIGNE_INACTIF' } } });
      const user = userEvent.setup();

      render(<MonAbonnement />);
      await screen.findByText('Annuel');
      await user.click(screen.getAllByRole('button', { name: /Choisir cette formule/ })[0]);

      expect(await screen.findByText(detail)).toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(0);
      expect(screen.queryByText(/Impossible de démarrer le paiement/)).not.toBeInTheDocument();
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    it('clic refusé en 503 sans ce code : message générique, boutons gardés', async () => {
      mocks.get.mockResolvedValue({ data: abonnementActif });
      mocks.post.mockRejectedValue({ response: { status: 503, data: '<html>Service Unavailable</html>' } });
      const user = userEvent.setup();

      render(<MonAbonnement />);
      await screen.findByText('Annuel');
      await user.click(screen.getAllByRole('button', { name: /Choisir cette formule/ })[0]);

      expect(await screen.findByText(/Impossible de démarrer le paiement/)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Choisir cette formule/ })).toHaveLength(2);
    });
  });
});
