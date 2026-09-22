import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poserQuestion: vi.fn(),
  utilisateur: { est_proprietaire: true },
}));

vi.mock('../../services/assistant', () => ({
  poserQuestion: mocks.poserQuestion,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ utilisateur: mocks.utilisateur }),
}));

import Assistant from '../Assistant';

describe('Assistant', () => {
  beforeEach(() => {
    mocks.poserQuestion.mockReset();
    mocks.utilisateur = { est_proprietaire: true };
  });

  it("n'affiche pas le formulaire pour un employé", () => {
    mocks.utilisateur = { est_proprietaire: false };

    render(<Assistant />);

    expect(screen.queryByRole('button', { name: 'Demander' })).not.toBeInTheDocument();
    expect(screen.getByText(/réservée au propriétaire/)).toBeInTheDocument();
  });

  it('le propriétaire peut poser une question, qui appelle bien assistant/', async () => {
    mocks.poserQuestion.mockResolvedValue({ reponse: "Votre chiffre d'affaires est de 1000 FCFA." });
    const user = userEvent.setup();

    render(<Assistant />);
    await user.type(screen.getByLabelText('Votre question'), "Quel est mon chiffre d'affaires ?");
    await user.click(screen.getByRole('button', { name: 'Demander' }));

    expect(await screen.findByText("Votre chiffre d'affaires est de 1000 FCFA.")).toBeInTheDocument();
    expect(mocks.poserQuestion).toHaveBeenCalledWith("Quel est mon chiffre d'affaires ?");
  });

  it('affiche un message spécifique quand le quota quotidien est atteint (429)', async () => {
    mocks.poserQuestion.mockRejectedValue({ response: { status: 429, data: {} } });
    const user = userEvent.setup();

    render(<Assistant />);
    await user.type(screen.getByLabelText('Votre question'), 'Une question de trop ?');
    await user.click(screen.getByRole('button', { name: 'Demander' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/limite quotidienne/i);
  });

  it('une suggestion cliquée pré-remplit le champ de question', async () => {
    const user = userEvent.setup();

    render(<Assistant />);
    await user.click(screen.getByRole('button', { name: /Qui me doit de l'argent/ }));

    expect(screen.getByLabelText('Votre question')).toHaveValue("Qui me doit de l'argent ?");
  });
});
