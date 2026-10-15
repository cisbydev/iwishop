import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  telechargerBlob: vi.fn(),
  support: { actif: false, boutiqueId: null },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
}));

vi.mock('../../utils/telechargerBlob', () => ({
  telechargerBlob: mocks.telechargerBlob,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: { est_proprietaire: false } }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => mocks.support,
}));

import SalesHistory from '../SalesHistory';

function vente(id, extra = {}) {
  return {
    id,
    date_vente: '2026-10-15T10:00:00Z',
    lignes: [],
    remise: '0',
    montant_net: '1000',
    statut: 'VALIDEE',
    ...extra,
  };
}

function listeDeVentes(results) {
  return { data: { count: results.length, next: null, previous: null, results } };
}

describe('SalesHistory : facture', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.telechargerBlob.mockReset();
    mocks.support = { actif: false, boutiqueId: null };
  });

  it("n'affiche rien si l'API ne renvoie pas le champ facture (backend pas encore déployé)", async () => {
    mocks.get.mockResolvedValue(listeDeVentes([vente(1)]));

    render(<SalesHistory />);
    await screen.findByText('#1');

    expect(screen.queryByRole('button', { name: /Créer la facture/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Télécharger la facture/ })).not.toBeInTheDocument();
  });

  it('crée la facture puis affiche son numéro sans recharger la liste', async () => {
    mocks.get.mockResolvedValue(listeDeVentes([vente(1, { facture: null })]));
    mocks.post.mockResolvedValue({
      data: { id: 7, numero: 'F-2026-0001', date_emission: '2026-10-15T10:05:00Z', est_annulee: false },
    });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: /Créer la facture/ }));

    expect(await screen.findByText('F-2026-0001')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('ventes/1/facture/');
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Créer la facture/ })).not.toBeInTheDocument();
  });

  it("affiche le refus de l'API dans la page", async () => {
    mocks.get.mockResolvedValue(listeDeVentes([vente(1, { facture: null })]));
    mocks.post.mockRejectedValue({
      response: { status: 400, data: ["Impossible d'émettre une facture pour une vente annulée."] },
    });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: /Créer la facture/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Impossible d'émettre une facture pour une vente annulée."
    );
    expect(screen.getByRole('button', { name: /Créer la facture/ })).toBeEnabled();
  });

  it('un double clic ne crée qu’une seule facture', async () => {
    let resoudre;
    mocks.get.mockResolvedValue(listeDeVentes([vente(1, { facture: null })]));
    mocks.post.mockReturnValue(new Promise((r) => { resoudre = r; }));
    const user = userEvent.setup();

    render(<SalesHistory />);
    const bouton = await screen.findByRole('button', { name: /Créer la facture/ });
    await user.click(bouton);
    await user.click(bouton);

    expect(screen.getByRole('button', { name: /Création/ })).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    resoudre({ data: { id: 7, numero: 'F-2026-0001', est_annulee: false } });
    expect(await screen.findByText('F-2026-0001')).toBeInTheDocument();
  });

  it('pas de bouton de création sur une vente annulée sans facture', async () => {
    mocks.get.mockResolvedValue(listeDeVentes([vente(1, { statut: 'ANNULEE', facture: null })]));

    render(<SalesHistory />);
    await screen.findByText('#1');

    expect(screen.queryByRole('button', { name: /Créer la facture/ })).not.toBeInTheDocument();
  });

  it('facture d’une vente annulée : numéro, badge Annulée et téléchargement', async () => {
    mocks.get.mockResolvedValue(listeDeVentes([
      vente(1, { statut: 'ANNULEE', facture: { id: 7, numero: 'F-2026-0001', est_annulee: true } }),
    ]));

    render(<SalesHistory />);

    expect(await screen.findByText('F-2026-0001')).toBeInTheDocument();
    // Deux badges « Annulée » : celui de la vente et celui de la facture.
    expect(screen.getAllByText('Annulée')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Télécharger la facture F-2026-0001' })).toBeEnabled();
  });

  it('télécharge le PDF de la facture avec son numéro comme nom de fichier', async () => {
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    mocks.get
      .mockResolvedValueOnce(listeDeVentes([vente(1, { facture: { id: 7, numero: 'F-2026-0001', est_annulee: false } })]))
      .mockResolvedValueOnce({ data: pdf });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Télécharger la facture F-2026-0001' }));

    await waitFor(() => expect(mocks.telechargerBlob).toHaveBeenCalledWith(pdf, 'facture-F-2026-0001.pdf'));
    expect(mocks.get).toHaveBeenNthCalledWith(2, 'ventes/factures/7/pdf/', { responseType: 'blob' });
  });

  it('téléchargement en échec : message dans la page', async () => {
    mocks.get
      .mockResolvedValueOnce(listeDeVentes([vente(1, { facture: { id: 7, numero: 'F-2026-0001', est_annulee: false } })]))
      .mockRejectedValueOnce({ response: { status: 500, data: new Blob() } });
    const user = userEvent.setup();

    render(<SalesHistory />);
    await user.click(await screen.findByRole('button', { name: 'Télécharger la facture F-2026-0001' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de télécharger la facture.');
    expect(mocks.telechargerBlob).not.toHaveBeenCalled();
  });

  describe('partage', () => {
    const facture = { id: 7, numero: 'F-2026-0001', est_annulee: false };
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });

    function definirPartage({ canShare, share }) {
      Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    }

    async function cliquerPartager() {
      mocks.get
        .mockResolvedValueOnce(listeDeVentes([vente(1, { facture })]))
        .mockResolvedValueOnce({ data: pdf });
      const user = userEvent.setup();
      render(<SalesHistory />);
      await user.click(await screen.findByRole('button', { name: 'Partager la facture F-2026-0001' }));
    }

    afterEach(() => {
      delete navigator.canShare;
      delete navigator.share;
    });

    it('partage le fichier PDF quand le navigateur sait partager un fichier', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      definirPartage({ canShare: vi.fn().mockReturnValue(true), share });

      await cliquerPartager();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const { files, title } = share.mock.calls[0][0];
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('facture-F-2026-0001.pdf');
      expect(files[0].type).toBe('application/pdf');
      expect(title).toBe('Facture F-2026-0001');
      expect(mocks.get).toHaveBeenNthCalledWith(2, 'ventes/factures/7/pdf/', { responseType: 'blob' });
      expect(mocks.telechargerBlob).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    });

    it('sans partage de fichier : télécharge le PDF et propose le lien WhatsApp', async () => {
      // jsdom n'a ni navigator.share ni navigator.canShare, comme un
      // navigateur d'ordinateur.
      await cliquerPartager();

      const lien = await screen.findByRole('link', { name: 'WhatsApp' });
      expect(lien).toHaveAttribute('href', 'https://wa.me/?text=Facture%20F-2026-0001');
      expect(lien).toHaveAttribute('target', '_blank');
      expect(mocks.telechargerBlob).toHaveBeenCalledWith(pdf, 'facture-F-2026-0001.pdf');
    });

    it('partage refusé (geste expiré) : même repli que sans partage', async () => {
      const refus = Object.assign(new Error('refus'), { name: 'NotAllowedError' });
      definirPartage({ canShare: vi.fn().mockReturnValue(true), share: vi.fn().mockRejectedValue(refus) });

      await cliquerPartager();

      expect(await screen.findByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();
      expect(mocks.telechargerBlob).toHaveBeenCalledWith(pdf, 'facture-F-2026-0001.pdf');
    });

    it("partage fermé par l'utilisateur : ni erreur ni repli", async () => {
      const fermeture = Object.assign(new Error('fermé'), { name: 'AbortError' });
      const share = vi.fn().mockRejectedValue(fermeture);
      definirPartage({ canShare: vi.fn().mockReturnValue(true), share });

      await cliquerPartager();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Partager la facture F-2026-0001' })).toBeEnabled());
      expect(mocks.telechargerBlob).not.toHaveBeenCalled();
      expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('PDF introuvable : message dans la page, rien partagé', async () => {
      const share = vi.fn();
      definirPartage({ canShare: vi.fn().mockReturnValue(true), share });
      mocks.get
        .mockResolvedValueOnce(listeDeVentes([vente(1, { facture })]))
        .mockRejectedValueOnce({ response: { status: 404, data: new Blob() } });
      const user = userEvent.setup();

      render(<SalesHistory />);
      await user.click(await screen.findByRole('button', { name: 'Partager la facture F-2026-0001' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Facture introuvable.');
      expect(share).not.toHaveBeenCalled();
      expect(mocks.telechargerBlob).not.toHaveBeenCalled();
    });

    it('un double clic ne récupère le PDF qu’une fois', async () => {
      let resoudre;
      const share = vi.fn().mockResolvedValue(undefined);
      definirPartage({ canShare: vi.fn().mockReturnValue(true), share });
      mocks.get
        .mockResolvedValueOnce(listeDeVentes([vente(1, { facture })]))
        .mockReturnValueOnce(new Promise((r) => { resoudre = r; }));
      const user = userEvent.setup();

      render(<SalesHistory />);
      const bouton = await screen.findByRole('button', { name: 'Partager la facture F-2026-0001' });
      await user.click(bouton);
      await user.click(bouton);

      expect(bouton).toBeDisabled();
      expect(mocks.get).toHaveBeenCalledTimes(2);
      resoudre({ data: pdf });
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    });
  });

  it('sur téléphone : boutons en icône seule, nom gardé en aria-label et title, numéro sans coupure', async () => {
    // jsdom n'applique pas le CSS : on vérifie les attributs qui portent le
    // nom des boutons quand le libellé est masqué sous sm.
    mocks.get.mockResolvedValue(listeDeVentes([
      vente(1, { facture: null }),
      vente(2, { facture: { id: 8, numero: 'F-2026-0002', est_annulee: false } }),
    ]));

    render(<SalesHistory />);

    const creer = await screen.findByRole('button', { name: 'Créer la facture' });
    const telecharger = screen.getByRole('button', { name: 'Télécharger la facture F-2026-0002' });
    const partager = screen.getByRole('button', { name: 'Partager la facture F-2026-0002' });
    for (const [bouton, nom] of [
      [creer, 'Créer la facture'],
      [telecharger, 'Télécharger la facture F-2026-0002'],
      [partager, 'Partager la facture F-2026-0002'],
    ]) {
      expect(bouton).toHaveAttribute('aria-label', nom);
      expect(bouton).toHaveAttribute('title', nom);
      expect(bouton.querySelector('span')).toHaveClass('hidden', 'sm:inline');
    }
    expect(screen.getByText('F-2026-0002')).toHaveClass('whitespace-nowrap');
  });

  it('Vue Support : création désactivée, téléchargement permis', async () => {
    mocks.support = { actif: true, boutiqueId: 3 };
    mocks.get.mockResolvedValue(listeDeVentes([
      vente(1, { facture: null }),
      vente(2, { facture: { id: 8, numero: 'F-2026-0002', est_annulee: false } }),
    ]));

    render(<SalesHistory />);

    expect(await screen.findByRole('button', { name: /Créer la facture/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Télécharger la facture F-2026-0002' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Partager la facture F-2026-0002' })).toBeEnabled();
  });
});
