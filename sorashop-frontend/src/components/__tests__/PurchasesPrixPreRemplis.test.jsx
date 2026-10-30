import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// Riz : prix connus, vendu à l'Unité, à la Douzaine et au Sac 25kg.
// Savon : prix à 0. Huile : prix d'achat absent, pas de ligne « Unité ».
// Œufs : prix d'achat arrondi au centime par le serveur (1000 / 12).
function mockerCatalogue() {
  const donnees = {
    'produits/': [
      { id: 1, nom: 'Riz', prix_achat: '800.00' },
      { id: 2, nom: 'Savon', prix_achat: '0.00' },
      { id: 3, nom: 'Huile' },
      { id: 4, nom: 'Œufs', prix_achat: '83.33' },
    ],
    'produits/prix/': [
      { produit: 1, unite: 10, unite_nom: 'Unité', prix: '1000.00' },
      { produit: 1, unite: 11, unite_nom: 'Douzaine', prix: '11000.00' },
      { produit: 1, unite: 12, unite_nom: 'Sac 25kg', prix: '24000.00' },
      { produit: 2, unite: 10, unite_nom: 'Unité', prix: '0.00' },
      { produit: 3, unite: 11, unite_nom: 'Douzaine', prix: '6000.00' },
      { produit: 4, unite: 10, unite_nom: 'Unité', prix: '100.00' },
      { produit: 4, unite: 11, unite_nom: 'Douzaine', prix: '1100.00' },
    ],
    'produits/unites-vente/': [
      { id: 10, facteur_conversion: '1.000' },
      { id: 11, facteur_conversion: '12.000' },
      { id: 12, facteur_conversion: '25.000' },
    ],
    'fournisseurs/': [{ id: 5, nom: 'Grossiste' }],
    'achats/': [],
  };
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(donnees[endpoint] ?? []));
}

// Les sélecteurs Produit et Unité n'ont pas de label relié : on les
// trouve par une de leurs options.
const choisir = (user, option) =>
  user.selectOptions(screen.getByRole('option', { name: option }).closest('select'), option);

const champPrixAchat = () => screen.getByPlaceholderText('0.00');
const champPrixVente = () => screen.getByLabelText(/Prix de vente \(Unité\)/);

// paste plutôt que type : même leçon que Clients.test.jsx.
async function coller(user, champ, texte) {
  await user.clear(champ);
  if (texte === '') return;
  await user.click(champ);
  await user.paste(texte);
}

async function validerAchat(user) {
  await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'ESPECES');
  await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  return mocks.post.mock.calls[0][1].lignes;
}

// Plan du 2026-10-29 : les prix enregistrés sont proposés dans Nouvel
// achat, et restent modifiables.
describe('Nouvel achat : prix pré-remplis', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset().mockResolvedValue({ data: { id: 99, statut_paiement: 'paye', montant_du: '0.00' } });
    mockerCatalogue();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('à l’arrivée : prix d’achat et prix de vente Unité actuels du premier produit', async () => {
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    expect(champPrixAchat()).toHaveValue(800);
    expect(champPrixVente()).toHaveValue(1000);
  });

  it('prix d’achat converti selon l’unité, prix de vente inchangé', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await choisir(user, 'Sac 25kg');
    expect(champPrixAchat()).toHaveValue(20000);
    expect(champPrixVente()).toHaveValue(1000);

    await choisir(user, 'Douzaine');
    expect(champPrixAchat()).toHaveValue(9600);

    await choisir(user, 'Unité');
    expect(champPrixAchat()).toHaveValue(800);
  });

  it('arrondi au centime : 83,33 l’unité donne 999,96 la Douzaine', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await choisir(user, 'Œufs');
    await choisir(user, 'Douzaine');

    expect(champPrixAchat()).toHaveValue(999.96);
  });

  it('prix d’achat tapé : gardé quand on change d’unité', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await coller(user, champPrixAchat(), '750');
    await choisir(user, 'Sac 25kg');
    expect(champPrixAchat()).toHaveValue(750);

    // Vidé à la main : reste vide aussi.
    await coller(user, champPrixAchat(), '');
    await choisir(user, 'Unité');
    expect(champPrixAchat()).toHaveValue(null);
  });

  it('changement de produit : les prix du nouveau produit remplacent ceux tapés', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await coller(user, champPrixAchat(), '750');
    await coller(user, champPrixVente(), '1200');
    await choisir(user, 'Œufs');

    expect(champPrixAchat()).toHaveValue(83.33);
    expect(champPrixVente()).toHaveValue(100);
  });

  it('prix à 0 ou absent : champs vides, jamais 0', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await choisir(user, 'Savon');
    expect(champPrixAchat()).toHaveValue(null);
    expect(champPrixVente()).toHaveValue(null);

    await choisir(user, 'Huile');
    expect(champPrixAchat()).toHaveValue(null);
    expect(champPrixVente()).toHaveValue(null);
  });

  it('prix de vente laissé au prix actuel : « Inchangé » et non envoyé ; modifié : envoyé', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await user.click(ajouter);
    await choisir(user, 'Sac 25kg');
    await coller(user, champPrixVente(), '1100');
    await user.click(ajouter);

    const lignes = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(lignes[0]).getAllByRole('cell')[5]).toHaveTextContent('Inchangé');
    expect(await validerAchat(user)).toEqual([
      { produit: 1, unite: 10, quantite: 1, prix_unitaire_achat: 800 },
      { produit: 1, unite: 12, quantite: 1, prix_unitaire_achat: 20000, prix_vente_unite: 1100 },
    ]);
  });

  // Prix actuel « 1000.00 » côté serveur, proposé « 1000 » dans le champ.
  // fireEvent.change plutôt que paste : user-event ramène « 1000.0 » à
  // « 1000 » dans un champ numérique, un vrai navigateur garde le texte.
  it.each(['1000', '1000.00', '1000.0'])('prix de vente « %s » : comparé en nombre au prix actuel, non envoyé', async (ecriture) => {
    const user = userEvent.setup();
    render(<Purchases />);
    const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    fireEvent.change(champPrixVente(), { target: { value: ecriture } });
    expect(champPrixVente().value).toBe(ecriture);
    await user.click(ajouter);

    const [ligne] = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(ligne).getAllByRole('cell')[5]).toHaveTextContent('Inchangé');
    expect((await validerAchat(user))[0]).not.toHaveProperty('prix_vente_unite');
  });

  it('après « Ajouter » : les champs sont de nouveau pré-remplis', async () => {
    const user = userEvent.setup();
    render(<Purchases />);
    const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    await choisir(user, 'Sac 25kg');
    await coller(user, champPrixAchat(), '19000');
    await coller(user, champPrixVente(), '1100');
    await user.click(ajouter);

    expect(champPrixAchat()).toHaveValue(20000);
    expect(champPrixVente()).toHaveValue(1000);
  });
});
