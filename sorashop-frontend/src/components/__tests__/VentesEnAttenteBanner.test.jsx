import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listerVentesEnAttente: vi.fn(),
  marquerVente: vi.fn(),
  synchroniserVentesEnAttente: vi.fn(),
  chargerCatalogueCache: vi.fn(),
  utilisateur: null,
}));

vi.mock('../../services/offlineQueue', () => ({
  listerVentesEnAttente: mocks.listerVentesEnAttente,
  marquerVente: mocks.marquerVente,
  EVENEMENT_FILE_ATTENTE_MODIFIEE: 'sorashop:file-attente-ventes-modifiee',
  STATUT_ECHEC_AUTH: 'ECHEC_AUTH',
}));

vi.mock('../../services/syncEngine', () => ({
  synchroniserVentesEnAttente: mocks.synchroniserVentesEnAttente,
}));

vi.mock('../../services/catalogueCache', () => ({
  chargerCatalogueCache: mocks.chargerCatalogueCache,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

import VentesEnAttenteBanner from '../VentesEnAttenteBanner';

const AWA = { id: 7, username: 'awa', boutique_id: 3, boutique_nom: 'Boutique test' };
const CONTEXTE_AWA = { utilisateur_id: 7, utilisateur_nom: 'awa', boutique_id: 3, boutique_nom: 'Boutique test' };
const MARQUE_AWA = { utilisateur_id: 7, utilisateur_nom: 'awa', boutique_id: 3, boutique_nom: 'Boutique test' };
const MARQUE_CISSE = { utilisateur_id: 8, utilisateur_nom: 'Cisse', boutique_id: 3, boutique_nom: 'Boutique test' };

const vente = (cle, champs = {}) => ({ cle_idempotence: cle, statut: 'EN_ATTENTE', ...MARQUE_AWA, ...champs });
const venteSansMarque = (cle, champs = {}) => ({
  cle_idempotence: cle,
  statut: 'EN_ATTENTE',
  horodatage_client: '2026-10-10T09:15:00.000Z',
  payload: { montant_paye: 1500, lignes: [{ produit: 1, quantite: 2 }, { produit: 99, quantite: 1 }] },
  ...champs,
});

describe('VentesEnAttenteBanner', () => {
  beforeEach(() => {
    mocks.listerVentesEnAttente.mockReset();
    mocks.marquerVente.mockReset().mockResolvedValue(undefined);
    mocks.synchroniserVentesEnAttente.mockReset().mockResolvedValue(undefined);
    mocks.chargerCatalogueCache.mockReset().mockResolvedValue({ produits: [{ id: 1, nom: 'Savon' }] });
    mocks.utilisateur = AWA;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("n'affiche rien quand la file d'attente est vide", async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([]);

    render(<VentesEnAttenteBanner />);

    await waitFor(() => expect(mocks.listerVentesEnAttente).toHaveBeenCalled());
    expect(screen.queryByTestId('ventes-en-attente-banner')).not.toBeInTheDocument();
  });

  it('affiche le nombre de ventes en attente du compte en cours', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([vente('a'), vente('b')]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/2 ventes en attente de synchronisation/)).toBeInTheDocument();
  });

  it('invite explicitement à se reconnecter si une vente est en ECHEC_AUTH', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([vente('a', { statut: 'ECHEC_AUTH' })]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/Reconnectez-vous pour reprendre l’envoi/)).toBeInTheDocument();
  });

  it('déclenche une synchronisation manuelle au clic sur le bouton', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([vente('a')]);
    const user = userEvent.setup();

    render(<VentesEnAttenteBanner />);
    await screen.findByTestId('ventes-en-attente-banner');

    await user.click(screen.getByRole('button', { name: /Réessayer maintenant/ }));

    expect(mocks.synchroniserVentesEnAttente).toHaveBeenCalledTimes(1);
  });

  it('se met à jour automatiquement quand la file change (évènement DOM)', async () => {
    mocks.listerVentesEnAttente.mockResolvedValueOnce([vente('a')]);

    render(<VentesEnAttenteBanner />);
    expect(await screen.findByText(/1 vente en attente/)).toBeInTheDocument();

    mocks.listerVentesEnAttente.mockResolvedValueOnce([]);
    window.dispatchEvent(new Event('sorashop:file-attente-ventes-modifiee'));

    await waitFor(() => {
      expect(screen.queryByTestId('ventes-en-attente-banner')).not.toBeInTheDocument();
    });
  });

  it('ventes d’un autre compte : comptées à part, sans bouton pour les envoyer ni les réattribuer', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([
      vente('a'),
      vente('b', MARQUE_CISSE),
      vente('c', MARQUE_CISSE),
    ]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/1 vente en attente de synchronisation/)).toBeInTheDocument();
    expect(screen.getByText(/2 ventes en attente du compte Cisse \(Boutique test\) : connectez-vous avec ce compte pour les envoyer/))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Envoyer avec mon compte/ })).not.toBeInTheDocument();
  });

  it('ventes sans marque : listées à part (date, montant payé, produits), jamais comptées avec le compte en cours', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([venteSansMarque('x')]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText('1 vente à vérifier (créées avant la mise à jour)')).toBeInTheDocument();
    expect(screen.queryByText(/en attente de synchronisation/)).not.toBeInTheDocument();
    expect(await screen.findByText('Savon × 2, Produit n° 99 × 1')).toBeInTheDocument();
    expect(mocks.chargerCatalogueCache).toHaveBeenCalledWith(CONTEXTE_AWA);
    expect(screen.getByText(/Payé :/)).toHaveTextContent('10/10/2026');
  });

  it('envoi d’une vente sans marque après confirmation : marquée avec le compte en cours, puis synchronisée', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([venteSansMarque('x')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<VentesEnAttenteBanner />);
    await user.click(await screen.findByText(/à vérifier/));
    await user.click(screen.getByRole('button', { name: 'Envoyer avec mon compte (awa) et ma boutique (Boutique test)' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Envoyer avec mon compte (awa) et ma boutique (Boutique test)'));
    await waitFor(() => expect(mocks.synchroniserVentesEnAttente).toHaveBeenCalledTimes(1));
    expect(mocks.marquerVente).toHaveBeenCalledWith('x', CONTEXTE_AWA);
    expect(mocks.marquerVente.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.synchroniserVentesEnAttente.mock.invocationCallOrder[0]);
  });

  it('envoi d’une vente sans marque annulé : rien n’est marqué ni envoyé', async () => {
    mocks.listerVentesEnAttente.mockResolvedValue([venteSansMarque('x')]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(<VentesEnAttenteBanner />);
    await user.click(await screen.findByText(/à vérifier/));
    await user.click(screen.getByRole('button', { name: /Envoyer avec mon compte/ }));

    expect(mocks.marquerVente).not.toHaveBeenCalled();
    expect(mocks.synchroniserVentesEnAttente).not.toHaveBeenCalled();
  });

  it('sans contexte (aucune boutique) : pas de bouton d’envoi pour les ventes sans marque', async () => {
    mocks.utilisateur = { id: 1, username: 'admin' };
    mocks.listerVentesEnAttente.mockResolvedValue([venteSansMarque('x')]);

    render(<VentesEnAttenteBanner />);

    expect(await screen.findByText(/à vérifier/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Envoyer avec mon compte/ })).not.toBeInTheDocument();
    expect(screen.getByText('Connectez-vous à une boutique pour pouvoir l’envoyer.')).toBeInTheDocument();
  });
});
