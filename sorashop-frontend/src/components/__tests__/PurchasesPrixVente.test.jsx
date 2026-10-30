import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  utilisateur: { est_proprietaire: true },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import Purchases from '../Purchases';
import { formatCurrency } from '../../utils/formatters';

// Un produit vendu à l'Unité et au Sac 25kg, un fournisseur.
function mockerCatalogue() {
  const donnees = {
    'produits/': [{ id: 1, nom: 'Riz' }],
    'produits/prix/': [
      { produit: 1, unite: 10, unite_nom: 'Unité' },
      { produit: 1, unite: 11, unite_nom: 'Sac 25kg' },
    ],
    'produits/unites-vente/': [{ id: 10, facteur_conversion: '1.000' }, { id: 11, facteur_conversion: '25.000' }],
    'fournisseurs/': [{ id: 5, nom: 'Grossiste' }],
    'achats/': [],
  };
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(donnees[endpoint] ?? []));
}

// paste plutôt que type : même leçon que Clients.test.jsx (saisie
// caractère par caractère instable sous charge).
async function coller(user, champ, texte) {
  await user.clear(champ);
  if (texte === '') return;
  await user.click(champ);
  await user.paste(texte);
}

async function ajouterLigne(user, { prixAchat = '60', prixVente = '', unite } = {}) {
  const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });
  // Le sélecteur d'unité n'a pas de label relié : on le trouve par ses options.
  if (unite) await user.selectOptions(screen.getByRole('option', { name: unite }).closest('select'), unite);
  await coller(user, screen.getByPlaceholderText('0.00'), prixAchat);
  await coller(user, screen.getByLabelText(/Prix de vente \(Unité\)/), prixVente);
  await user.click(ajouter);
}

function lignesDuPanier() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

async function validerAchat(user) {
  await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'ESPECES');
  await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  return mocks.post.mock.calls[0][1].lignes;
}

// Plan du 2026-10-28 (option A) : prix de vente Unité facultatif sur
// chaque ligne d'achat, mis à jour par le serveur ; vide = inchangé.
describe('Nouvel achat : prix de vente (Unité) facultatif', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAll.mockReset();
    mocks.post.mockReset().mockResolvedValue({ data: { id: 99, statut_paiement: 'paye', montant_du: '0.00' } });
    mocks.utilisateur = { est_proprietaire: true };
    mockerCatalogue();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('le champ est facultatif et explique qu’il est pré-rempli', async () => {
    render(<Purchases />);
    const champ = await screen.findByLabelText(/Prix de vente \(Unité\)/);

    expect(champ).not.toBeRequired();
    expect(screen.getByText(
      'Pré-rempli avec le prix actuel. Le changer met à jour le prix de vente.'
    )).toBeInTheDocument();
  });

  it('rempli : affiché dans le panier et envoyé, même pour un achat au Sac', async () => {
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterLigne(user, { prixAchat: '20000', prixVente: '1000', unite: 'Sac 25kg' });

    const [ligne] = lignesDuPanier();
    expect(ligne).toHaveTextContent('Sac 25kg');
    expect(within(ligne).getAllByRole('cell')[5].textContent).toBe(formatCurrency(1000, 'FCFA'));
    expect(screen.getByLabelText(/Prix de vente \(Unité\)/)).toHaveValue(null);
    expect(await validerAchat(user)).toEqual([
      { produit: 1, unite: 11, quantite: 1, prix_unitaire_achat: 20000, prix_vente_unite: 1000 },
    ]);
  });

  it('vide : « Inchangé » dans le panier, champ non envoyé', async () => {
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterLigne(user);

    expect(within(lignesDuPanier()[0]).getAllByRole('cell')[5]).toHaveTextContent('Inchangé');
    expect(await validerAchat(user)).toEqual([
      { produit: 1, unite: 10, quantite: 1, prix_unitaire_achat: 60 },
    ]);
  });

  it('0 ou négatif : refusé par le champ lui-même, la ligne n’est pas ajoutée', async () => {
    const user = userEvent.setup();
    render(<Purchases />);

    for (const prixVente of ['0', '-5']) {
      await ajouterLigne(user, { prixVente });

      // min="0.01" : le navigateur bloque l'envoi du formulaire et
      // affiche son propre message (contrôle JS en second rideau).
      expect(screen.getByLabelText(/Prix de vente \(Unité\)/).validity.rangeUnderflow).toBe(true);
      expect(screen.getByText('Aucun produit ajouté.')).toBeInTheDocument();
    }
  });

  it('même produit, deux prix différents : la seconde ligne est refusée dès l’ajout', async () => {
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterLigne(user, { prixVente: '150' });
    await ajouterLigne(user, { prixVente: '160', unite: 'Sac 25kg' });

    expect(window.alert).toHaveBeenCalledWith("Un autre prix de vente est déjà saisi pour 'Riz' dans cet achat.");
    expect(lignesDuPanier()).toHaveLength(1);
  });

  it('même produit, même prix ou prix sur une seule ligne : accepté', async () => {
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterLigne(user, { prixVente: '150' });
    await ajouterLigne(user, { prixVente: '150', unite: 'Sac 25kg' });
    await ajouterLigne(user);

    expect(window.alert).not.toHaveBeenCalled();
    expect(lignesDuPanier()).toHaveLength(3);
    const lignes = await validerAchat(user);
    expect(lignes.map((l) => l.prix_vente_unite)).toEqual([150, 150, undefined]);
  });

  it('refus du serveur : son message est affiché, le panier est gardé', async () => {
    const message = "Deux prix de vente différents pour 'Riz' dans le même achat.";
    mocks.post.mockReset().mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 400'), {
      response: { status: 400, data: [message] },
    }));
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterLigne(user, { prixVente: '150' });
    await user.selectOptions(screen.getByLabelText('Mode de paiement'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(message));
    expect(lignesDuPanier()).toHaveLength(1);
  });

  it('un employé voit le champ aussi (option A)', async () => {
    mocks.utilisateur = { est_proprietaire: false };
    render(<Purchases />);

    expect(await screen.findByLabelText(/Prix de vente \(Unité\)/)).toBeInTheDocument();
  });
});
