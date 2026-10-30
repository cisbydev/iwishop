import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: { est_proprietaire: true } }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Purchases from '../Purchases';

const ACHAT = {
  id: 7, statut: 'VALIDE', montant_total: '1600.00', fournisseur_nom: 'Grossiste',
  date_achat: '2026-10-29T10:00:00Z', lignes: [],
};

// Catalogue avant puis après l'action : le serveur a changé les prix de
// l'Huile (dernier prix payé, prix de vente saisi dans l'achat).
function mockerCatalogue({ achats = [] } = {}) {
  const catalogue = (prixAchatHuile, prixVenteHuile) => ({
    'produits/': [
      { id: 1, nom: 'Riz', prix_achat: '800.00' },
      { id: 2, nom: 'Huile', prix_achat: prixAchatHuile },
    ],
    'produits/prix/': [
      { produit: 1, unite: 10, unite_nom: 'Unité', prix: '1000.00' },
      { produit: 2, unite: 10, unite_nom: 'Unité', prix: prixVenteHuile },
    ],
    'produits/unites-vente/': [{ id: 10, facteur_conversion: '1.000' }],
    'fournisseurs/': [{ id: 5, nom: 'Grossiste' }],
    'achats/': achats,
  });
  let donnees = catalogue('1500.00', '2000.00');
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(donnees[endpoint] ?? []));
  mocks.post.mockImplementation(() => {
    donnees = catalogue('1600.00', '2200.00');
    return Promise.resolve({ data: { id: 99, statut_paiement: 'paye', montant_du: '0.00' } });
  });
}

const optionHuile = () => screen.getByRole('option', { name: 'Huile' });
const champPrixAchat = () => screen.getByPlaceholderText('0.00');
const champPrixVente = () => screen.getByLabelText(/Prix de vente \(Unité\)/);

// Plan du 2026-10-29, point b) : un achat ou une annulation change les
// prix du produit ; les propositions suivantes doivent les reprendre.
describe('Nouvel achat : catalogue rechargé après un achat ou une annulation', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('après un achat : prix à jour, produit sélectionné gardé', async () => {
    mockerCatalogue();
    const user = userEvent.setup();
    render(<Purchases />);
    const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await user.selectOptions(optionHuile().closest('select'), 'Huile');
    await user.click(ajouter);
    await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(champPrixVente()).toHaveValue(2200));
    expect(champPrixAchat()).toHaveValue(1600);
    expect(optionHuile().selected).toBe(true);
  });

  it('après une annulation : prix à jour', async () => {
    mockerCatalogue({ achats: [ACHAT] });
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });
    await user.selectOptions(optionHuile().closest('select'), 'Huile');
    expect(champPrixAchat()).toHaveValue(1500);

    await user.click(screen.getByRole('button', { name: "Annuler l'achat #7" }));

    await waitFor(() => expect(champPrixAchat()).toHaveValue(1600));
    expect(champPrixVente()).toHaveValue(2200);
    expect(optionHuile().selected).toBe(true);
  });
});
