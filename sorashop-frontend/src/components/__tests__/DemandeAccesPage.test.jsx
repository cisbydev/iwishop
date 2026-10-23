import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
}));

import DemandeAccesPage from '../DemandeAccesPage';

// Mêmes promesses que la landing (landing/index.html), en vouvoyant.
const DELAI = 'Votre demande est examinée sous 24 h, puis vos accès vous sont envoyés par email.';

function remplirEtEnvoyer() {
  const [nom, email, telephone, boutique] = screen.getAllByRole('textbox');
  fireEvent.change(nom, { target: { value: 'Awa Traoré' } });
  fireEvent.change(email, { target: { value: 'awa@example.com' } });
  fireEvent.change(telephone, { target: { value: '70 00 00 00' } });
  fireEvent.change(boutique, { target: { value: 'Boutique Awa' } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
}

describe('DemandeAccesPage', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({ data: { duree_jours: 14 } });
    mocks.post.mockReset();
  });

  it('annonce l’essai gratuit et le délai de réponse de la landing', async () => {
    render(<DemandeAccesPage />);

    expect(screen.getByRole('heading', { name: 'Demander un accès à iwiShop' })).toBeInTheDocument();
    expect(await screen.findByText('14 jours d’essai gratuit, sans carte bancaire.')).toBeInTheDocument();
    expect(screen.getByText(DELAI)).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('tenants/essai-gratuit/');
  });

  it('affiche la durée lue dans la formule « Essai gratuit », pas 14 en dur', async () => {
    mocks.get.mockResolvedValue({ data: { duree_jours: 21 } });
    render(<DemandeAccesPage />);

    expect(await screen.findByText('21 jours d’essai gratuit, sans carte bancaire.')).toBeInTheDocument();
    expect(screen.queryByText(/14 jours/)).not.toBeInTheDocument();
  });

  it('accorde « jour » au singulier', async () => {
    mocks.get.mockResolvedValue({ data: { duree_jours: 1 } });
    render(<DemandeAccesPage />);

    expect(await screen.findByText('1 jour d’essai gratuit, sans carte bancaire.')).toBeInTheDocument();
  });

  it.each([
    ['champ absent (backend pas encore déployé)', () => mocks.get.mockResolvedValue({ data: {} })],
    ['API injoignable', () => mocks.get.mockRejectedValue(new Error('Network Error'))],
  ])('sans durée exploitable (%s), annonce l’essai sans chiffre', async (_cas, preparer) => {
    preparer();
    render(<DemandeAccesPage />);

    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    // Laisse la réponse simulée (ou son échec) arriver avant de regarder.
    await act(async () => {});
    expect(await screen.findByText('Essai gratuit, sans carte bancaire.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ jours?/)).not.toBeInTheDocument();
  });

  it('confirme l’envoi en vouvoyant, avec le même délai', async () => {
    mocks.post.mockResolvedValue({ data: {} });
    render(<DemandeAccesPage />);

    remplirEtEnvoyer();

    expect(await screen.findByText('Merci ! Votre demande a bien été envoyée.')).toBeInTheDocument();
    expect(screen.getByText(DELAI)).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('tenants/demande-acces/', {
      nom_contact: 'Awa Traoré',
      email: 'awa@example.com',
      telephone: '70 00 00 00',
      nom_boutique_souhaite: 'Boutique Awa',
    });
  });

  it('ne tutoie nulle part, ni avant ni après l’envoi', async () => {
    mocks.post.mockResolvedValue({ data: {} });
    const { container } = render(<DemandeAccesPage />);
    const tutoiement = /\b(tu|ta|ton|tes|toi)\b/i;

    expect(container.textContent).not.toMatch(tutoiement);
    remplirEtEnvoyer();
    await screen.findByText(/^Merci !/);
    expect(container.textContent).not.toMatch(tutoiement);
  });
});
