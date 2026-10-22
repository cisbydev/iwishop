import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { post: mocks.post },
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
    mocks.post.mockReset();
  });

  it('annonce l’essai gratuit et le délai de réponse de la landing', () => {
    render(<DemandeAccesPage />);

    expect(screen.getByRole('heading', { name: 'Demander un accès à iwiShop' })).toBeInTheDocument();
    expect(screen.getByText('14 jours d’essai gratuit, sans carte bancaire.')).toBeInTheDocument();
    expect(screen.getByText(DELAI)).toBeInTheDocument();
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
