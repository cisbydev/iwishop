import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  utilisateur: { est_proprietaire: true },
  modeSupport: false,
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: mocks.modeSupport, boutiqueId: null }),
}));

import Purchases from '../Purchases';

// Catalogue minimal : un produit vendu à l'unité, un fournisseur.
function mockerCatalogue(achats = []) {
  const donnees = {
    'produits/': [{ id: 1, nom: 'Riz' }],
    'produits/prix/': [{ produit: 1, unite: 10, unite_nom: 'Unité' }],
    'produits/unites-vente/': [{ id: 10, facteur_conversion: '1.000' }],
    'fournisseurs/': [{ id: 5, nom: 'Grossiste' }],
    'achats/': achats,
  };
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(donnees[endpoint] ?? []));
}

// paste plutôt que type : même leçon que Clients.test.jsx (saisie
// caractère par caractère instable sous charge).
async function coller(user, champ, texte) {
  await user.clear(champ);
  await user.click(champ);
  await user.paste(texte);
}

async function ajouterRizAuPanier(user) {
  const ajouter = await screen.findByRole('button', { name: /Ajouter à l'achat/ });
  await coller(user, screen.getByPlaceholderText('0.00'), '60');
  await user.click(ajouter);
  await screen.findByRole('button', { name: 'Retirer Riz de l\'achat' });
}

const LIGNES_ATTENDUES = [{ produit: 1, unite: 10, quantite: 1, prix_unitaire_achat: 60 }];

beforeEach(() => {
  mocks.get.mockReset();
  mocks.getAll.mockReset();
  mocks.post.mockReset();
  mocks.utilisateur = { est_proprietaire: true };
  mocks.modeSupport = false;
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Achat à crédit dans le formulaire d’achat', () => {
  it('non-régression : un achat comptant envoie exactement le même objet qu’avant', async () => {
    mockerCatalogue();
    mocks.post.mockResolvedValue({ data: { id: 99, statut_paiement: 'paye', montant_du: '0.00' } });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('achats/', {
      fournisseur: 5,
      notes: null,
      lignes: LIGNES_ATTENDUES,
    });
    expect(await screen.findByText(/Achat enregistré avec succès/)).toBeInTheDocument();
  });

  it('la case « Achat à crédit » n’apparaît pas pour un employé (D3)', async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mockerCatalogue();
    render(<Purchases />);

    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    expect(screen.queryByLabelText('Achat à crédit')).not.toBeInTheDocument();
  });

  it('la case n’apparaît pas si le rôle est inconnu', async () => {
    mocks.utilisateur = undefined;
    mockerCatalogue();
    render(<Purchases />);

    await screen.findByRole('button', { name: /Ajouter à l'achat/ });

    expect(screen.queryByLabelText('Achat à crédit')).not.toBeInTheDocument();
  });

  it('crédit sans montant versé : pas de mode, montant_paye "0" et aucun mode envoyé', async () => {
    mockerCatalogue();
    mocks.post.mockResolvedValue({ data: { id: 99, statut_paiement: 'en_attente', montant_du: '60.00' } });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(await screen.findByLabelText('Achat à crédit'));

    expect(await screen.findByLabelText('Montant versé maintenant')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mode de paiement du montant versé')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const donnees = mocks.post.mock.calls[0][1];
    expect(donnees).toEqual({ fournisseur: 5, notes: null, lignes: LIGNES_ATTENDUES, montant_paye: '0' });
    expect(donnees).not.toHaveProperty('mode_paiement');
  });

  it('crédit avec montant versé : mode obligatoire, puis envoyé avec le montant', async () => {
    mockerCatalogue();
    mocks.post.mockResolvedValue({ data: { id: 99, statut_paiement: 'partiel', montant_du: '10.00' } });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(await screen.findByLabelText('Achat à crédit'));
    await coller(user, await screen.findByLabelText('Montant versé maintenant'), '50');

    const mode = await screen.findByLabelText('Mode de paiement du montant versé');
    expect(mode).toHaveValue('');

    // Sans mode : envoi bloqué.
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));
    expect(window.alert).toHaveBeenCalledWith('Choisissez le mode de paiement du montant versé.');
    expect(mocks.post).not.toHaveBeenCalled();

    await user.selectOptions(mode, 'MOBILE_MONEY');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('achats/', {
      fournisseur: 5,
      notes: null,
      lignes: LIGNES_ATTENDUES,
      montant_paye: '50',
      mode_paiement: 'MOBILE_MONEY',
    });
  });

  it('aucun reste calculé pendant la saisie ; le reste dû affiché vient du serveur', async () => {
    mockerCatalogue();
    // Valeur volontairement différente de 60 - 50 : seul le serveur fait foi.
    mocks.post.mockResolvedValue({ data: { id: 99, statut_paiement: 'partiel', montant_du: '130.00' } });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(await screen.findByLabelText('Achat à crédit'));
    await coller(user, await screen.findByLabelText('Montant versé maintenant'), '50');

    // Ni « reste dû » chiffré, ni 60 - 50 calculé côté frontend.
    expect(screen.queryByText(/Reste dû au fournisseur/)).not.toBeInTheDocument();
    expect(screen.queryByText(/(^|\D)10 FCFA/)).not.toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText('Mode de paiement du montant versé'), 'ESPECES');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    expect(await screen.findByText('Achat à crédit enregistré. Reste dû au fournisseur : 130 FCFA.')).toBeInTheDocument();
    // Formulaire remis à zéro après le succès.
    expect(screen.getByLabelText('Achat à crédit')).not.toBeChecked();
  });

  it('réponse sans les nouveaux champs (backend plus ancien) : message habituel', async () => {
    mockerCatalogue();
    mocks.post.mockResolvedValue({ data: { id: 99 } });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(await screen.findByLabelText('Achat à crédit'));
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    expect(await screen.findByText(/Achat enregistré avec succès/)).toBeInTheDocument();
  });

  it('erreur du serveur : message affiché, montant versé et mode conservés', async () => {
    mockerCatalogue();
    mocks.post.mockRejectedValue({
      response: { status: 400, data: ["Le montant payé ne peut pas dépasser le montant total de l'achat."] },
    });
    const user = userEvent.setup();
    render(<Purchases />);

    await ajouterRizAuPanier(user);
    await user.click(await screen.findByLabelText('Achat à crédit'));
    await coller(user, await screen.findByLabelText('Montant versé maintenant'), '500');
    await user.selectOptions(await screen.findByLabelText('Mode de paiement du montant versé'), 'CARTE');
    await user.click(screen.getByRole('button', { name: "Valider l'Achat" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('ne peut pas dépasser le montant total'),
    ));
    expect(screen.getByLabelText('Achat à crédit')).toBeChecked();
    expect(screen.getByLabelText('Montant versé maintenant')).toHaveValue(500);
    expect(screen.getByLabelText('Mode de paiement du montant versé')).toHaveValue('CARTE');
  });

  it('vue support : la case est désactivée', async () => {
    mocks.modeSupport = true;
    mockerCatalogue();
    render(<Purchases />);

    expect(await screen.findByLabelText('Achat à crédit')).toBeDisabled();
  });
});

describe('Badge « À crédit » dans l’historique des achats', () => {
  function achat(id, extra = {}) {
    return {
      id,
      statut: 'VALIDE',
      fournisseur_nom: 'Grossiste',
      date_achat: '2026-01-01T10:00:00Z',
      lignes: [{ produit_nom: 'Riz', quantite: 2, unite_nom: 'Sac', prix_unitaire_achat: '5000' }],
      montant_total: '10000',
      ...extra,
    };
  }

  it('affiche le reste dû renvoyé par le serveur', async () => {
    mockerCatalogue([achat(7, { statut_paiement: 'partiel', montant_du: '4000.00' })]);
    render(<Purchases />);

    // formatCurrency sépare les milliers par une espace fine insécable.
    expect(await screen.findByText(/^À crédit · reste 4\s000 FCFA$/)).toBeInTheDocument();
  });

  it('aucun badge pour un achat payé, annulé ou sans les nouveaux champs', async () => {
    mockerCatalogue([
      achat(7, { statut_paiement: 'paye', montant_du: '0.00' }),
      achat(8, { statut: 'ANNULE', statut_paiement: 'partiel', montant_du: '4000.00' }),
      achat(9),
    ]);
    render(<Purchases />);

    await screen.findByText('#9');
    expect(screen.queryByText(/À crédit · reste/)).not.toBeInTheDocument();
  });
});
