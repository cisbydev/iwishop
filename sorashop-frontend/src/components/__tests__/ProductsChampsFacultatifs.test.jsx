import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { post: mocks.post, put: mocks.put },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: { est_proprietaire: true },
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Products from '../Products';

const SAVON = {
  id: 1,
  nom: 'Savon',
  prix_achat: '100.00',
  prix_unitaire: '150.00',
  prix_douzaine: '1800.00',
  quantite_en_stock: 5,
  stock_minimum: 1,
};

function fenetre() {
  return screen.getByRole('heading', { name: /produit/i, level: 3 }).closest('.fixed');
}

// Ordre des champs numériques du formulaire : prix d'achat, prix vente
// (Unité), prix vente (Douzaine), stock, stock minimum.
function champsNumeriques(f) {
  const [prixAchat, prixUnite, prixDouzaine, stock, stockMinimum] = within(f).getAllByRole('spinbutton');
  return { prixAchat, prixUnite, prixDouzaine, stock, stockMinimum };
}

// Plan du 2026-10-28 (retour d'un prospect) : le commerçant ne connaît ses
// prix et son stock qu'après l'achat. Seul le nom est obligatoire.
describe('Fiche produit : champs facultatifs', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAll.mockImplementation((endpoint) => Promise.resolve(endpoint === 'produits/' ? [SAVON] : []));
    mocks.post.mockResolvedValue({ data: { id: 7 } });
    mocks.put.mockResolvedValue({ data: {} });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seul le nom est obligatoire, avec le texte d’aide sous le prix d’achat', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un produit' }));
    const f = fenetre();

    expect(within(f).getAllByRole('textbox')[0]).toBeRequired();
    Object.values(champsNumeriques(f)).forEach((champ) => expect(champ).not.toBeRequired());
    expect(within(f).getByText(
      "Laisser vide si inconnu : le prix d'achat sera rempli par le premier achat."
    )).toBeInTheDocument();
  });

  it('création avec le nom seul : prix envoyés à 0, stocks non envoyés', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un produit' }));
    const f = fenetre();
    fireEvent.change(within(f).getAllByRole('textbox')[0], { target: { value: 'Riz' } });
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [url, payload] = mocks.post.mock.calls[0];
    expect(url).toBe('produits/');
    expect(payload).toEqual({
      nom: 'Riz', categorie: null, prix_achat: 0, prix_unitaire: 0, prix_douzaine: 0,
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('création avec tout rempli : valeurs envoyées telles que saisies', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un produit' }));
    const f = fenetre();
    fireEvent.change(within(f).getAllByRole('textbox')[0], { target: { value: 'Riz' } });
    const champs = champsNumeriques(f);
    fireEvent.change(champs.prixAchat, { target: { value: '400' } });
    fireEvent.change(champs.prixUnite, { target: { value: '500' } });
    fireEvent.change(champs.prixDouzaine, { target: { value: '5500' } });
    fireEvent.change(champs.stock, { target: { value: '20' } });
    fireEvent.change(champs.stockMinimum, { target: { value: '3' } });
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][1]).toEqual({
      nom: 'Riz', categorie: null, prix_achat: '400', prix_unitaire: '500', prix_douzaine: '5500',
      quantite_en_stock: '20', stock_minimum: '3',
    });
  });

  it('modification : un prix vidé part à 0, un stock vidé n’est pas envoyé', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Modifier le produit Savon' }));
    const f = fenetre();
    const champs = champsNumeriques(f);
    fireEvent.change(champs.prixUnite, { target: { value: '' } });
    fireEvent.change(champs.stock, { target: { value: '' } });
    await user.click(within(f).getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    const [url, payload] = mocks.put.mock.calls[0];
    expect(url).toBe('produits/1/');
    expect(payload).toEqual({
      nom: 'Savon', categorie: null, prix_achat: '100.00', prix_unitaire: 0, prix_douzaine: '1800.00',
      stock_minimum: 1,
    });
  });
});
