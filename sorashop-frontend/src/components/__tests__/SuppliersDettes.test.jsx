import { render, screen, waitFor, within } from '@testing-library/react';
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
  default: { get: mocks.get, post: mocks.post, put: vi.fn(), delete: vi.fn() },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ parametres: { devise: 'FCFA' }, utilisateur: mocks.utilisateur }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: mocks.modeSupport, boutiqueId: null }),
}));

import Suppliers from '../Suppliers';

const FOURNISSEURS = [
  { id: 5, nom: 'Grossiste Diallo', telephone: '77 000 00 00', adresse: '' },
  { id: 6, nom: 'Huilerie du Sahel', telephone: '', adresse: '' },
];

const AVEC_DETTE = [
  { id: 5, nom: 'Grossiste Diallo', dette_totale: '4000.00', plus_ancienne_dette: new Date().toISOString() },
];

// Valeurs volontairement incohérentes entre elles (10000 - 3000 - 2500 ≠
// 4000) : la fiche affiche ce que renvoie l'API, jamais un calcul.
function historique() {
  return [
    {
      id: 41, date_achat: '2026-10-02T09:30:00Z', statut: 'VALIDE',
      montant_total: '10000.00', montant_paye: '3000.00', mode_paiement: 'ESPECES',
      montant_du: '4000.00', statut_paiement: 'partiel', total_paiements: '2500.00',
      paiements: [
        {
          id: 71, montant: '3000.00', date_paiement: '2026-10-02T12:00:00Z', enregistre_par_nom: 'awa',
          mode_paiement: 'MOBILE_MONEY', montant_effectif: '2500.00',
          corrections: [
            { id: 72, montant: '-500.00', date_paiement: '2026-10-03T08:00:00Z', enregistre_par_nom: 'mahamadou', motif_correction: 'erreur de saisie' },
          ],
        },
      ],
    },
    {
      id: 40, date_achat: '2026-09-20T09:30:00Z', statut: 'VALIDE',
      montant_total: '2000.00', montant_paye: '0.00', mode_paiement: null,
      montant_du: '0.00', statut_paiement: 'paye', total_paiements: '2000.00',
      paiements: [
        { id: 70, montant: '2000.00', date_paiement: '2026-09-25T10:00:00Z', enregistre_par_nom: 'awa', mode_paiement: 'ESPECES', montant_effectif: '2000.00', corrections: [] },
      ],
    },
    // Annulé après un paiement corrigé à 0 (option B : total net nul).
    {
      id: 39, date_achat: '2026-09-10T09:30:00Z', statut: 'ANNULE',
      montant_total: '5000.00', montant_paye: '0.00', mode_paiement: null,
      montant_du: '5000.00', statut_paiement: 'en_attente', total_paiements: '0.00',
      paiements: [
        {
          id: 60, montant: '1000.00', date_paiement: '2026-09-11T10:00:00Z', enregistre_par_nom: 'awa',
          mode_paiement: 'ESPECES', montant_effectif: '0.00',
          corrections: [
            { id: 61, montant: '-1000.00', date_paiement: '2026-09-12T10:00:00Z', enregistre_par_nom: 'mahamadou', motif_correction: 'paiement jamais fait' },
          ],
        },
      ],
    },
  ];
}

function mockerApi({ avecDette = () => Promise.resolve(AVEC_DETTE), historiqueFn = historique } = {}) {
  mocks.getAll.mockImplementation((endpoint) => {
    if (endpoint === 'fournisseurs/') return Promise.resolve(FOURNISSEURS);
    if (endpoint === 'fournisseurs/avec_dette/') return avecDette();
    return Promise.resolve([]);
  });
  mocks.get.mockImplementation((url) => {
    if (url === 'fournisseurs/5/historique/') return Promise.resolve({ data: historiqueFn() });
    return Promise.reject({ response: { status: 404 } });
  });
}

// paste plutôt que type : même leçon que Clients.test.jsx.
async function coller(user, champ, texte) {
  await user.clear(champ);
  await user.click(champ);
  await user.paste(texte);
}

function carte(nom) {
  return screen.getByRole('heading', { name: nom }).closest('div.rounded-xl');
}

async function ouvrirFiche(user, nom = 'Grossiste Diallo') {
  await user.click(await screen.findByRole('button', { name: `Dettes et paiements du fournisseur ${nom}` }));
  const fiche = await screen.findByRole('dialog', { name: `Dettes et paiements : ${nom}` });
  await within(fiche).findByText('Achat #41');
  return fiche;
}

function achat(fiche, id) {
  return within(fiche).getByRole('listitem', { name: `Achat #${id}` });
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.getAll.mockReset();
  mocks.post.mockReset();
  mocks.utilisateur = { est_proprietaire: true };
  mocks.modeSupport = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Fournisseurs : badge de dette', () => {
  it("badge « Doit X » avec la dette de l'API, seulement pour le fournisseur endetté", async () => {
    mockerApi();
    render(<Suppliers />);

    await screen.findByText('Grossiste Diallo');
    // formatCurrency sépare les milliers par une espace fine insécable.
    expect(await within(carte('Grossiste Diallo')).findByText(/^Doit 4\s000 FCFA$/)).toBeInTheDocument();
    expect(within(carte('Huilerie du Sahel')).queryByText(/^Doit/)).not.toBeInTheDocument();
  });

  it('route absente (404, backend antérieur) : ni badge, ni message', async () => {
    mockerApi({ avecDette: () => Promise.reject({ response: { status: 404 } }) });
    render(<Suppliers />);

    await screen.findByText('Grossiste Diallo');
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledWith('fournisseurs/avec_dette/'));
    expect(screen.queryByText(/^Doit/)).not.toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger les dettes fournisseurs.')).not.toBeInTheDocument();
  });

  it('erreur du serveur (500) : message discret, liste utilisable, aucun badge', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockerApi({ avecDette: () => Promise.reject({ response: { status: 500 } }) });
    render(<Suppliers />);

    expect(await screen.findByText('Impossible de charger les dettes fournisseurs.')).toBeInTheDocument();
    expect(screen.getByText('Grossiste Diallo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dettes et paiements du fournisseur Grossiste Diallo' })).toBeInTheDocument();
    expect(screen.queryByText(/^Doit/)).not.toBeInTheDocument();
  });

  it('erreur réseau (pas de réponse) : même message discret', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockerApi({ avecDette: () => Promise.reject(new Error('Network Error')) });
    render(<Suppliers />);

    expect(await screen.findByText('Impossible de charger les dettes fournisseurs.')).toBeInTheDocument();
    expect(screen.getByText('Grossiste Diallo')).toBeInTheDocument();
  });
});

describe('Fournisseurs : fiche des dettes et paiements', () => {
  it("affiche les montants de l'API sans calcul : reste dû, payé à l'achat, paiements, corrections", async () => {
    mockerApi();
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    expect(within(fiche).getByText(/^Dette en cours :/).closest('p')).toHaveTextContent(/4\s000 FCFA$/);

    const a41 = achat(fiche, 41);
    expect(within(a41).getByText('Partiel')).toBeInTheDocument();
    expect(within(a41).getByText('Reste dû').nextElementSibling).toHaveTextContent(/^4\s000 FCFA$/);
    const paye = within(a41).getByText("Payé à l'achat").parentElement;
    expect(paye).toHaveTextContent(/3\s000 FCFA/);
    expect(paye).toHaveTextContent('Espèces');
    expect(within(a41).getByText(/Paiements/)).toHaveTextContent(/total 2\s500 FCFA/);
    // Paiement corrigé : montant d'origine barré, montant effectif de l'API.
    expect(within(a41).getByText(/^3\s000 FCFA$/, { selector: '.line-through' })).toBeInTheDocument();
    expect(within(a41).getByText(/^2\s500 FCFA$/)).toBeInTheDocument();
    expect(within(a41).getByText('Correction').closest('li')).toHaveTextContent(/500 FCFA/);
    expect(within(a41).getByText('Motif : erreur de saisie')).toBeInTheDocument();

    expect(within(achat(fiche, 40)).getByText('Soldé')).toBeInTheDocument();
    expect(within(achat(fiche, 39)).getByText('Annulé')).toBeInTheDocument();
  });

  it("achats soldé et annulé : pas de formulaire de paiement ; pas de « Corriger » sur l'annulé", async () => {
    mockerApi();
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    expect(within(achat(fiche, 41)).getByLabelText('Enregistrer un paiement')).toBeInTheDocument();
    expect(within(achat(fiche, 40)).queryByLabelText('Enregistrer un paiement')).not.toBeInTheDocument();
    expect(within(achat(fiche, 39)).queryByLabelText('Enregistrer un paiement')).not.toBeInTheDocument();
    // Propriétaire : un paiement d'achat soldé se corrige encore.
    expect(within(achat(fiche, 40)).getByRole('button', { name: 'Corriger' })).toBeInTheDocument();
    expect(within(achat(fiche, 39)).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
  });

  it("l'employé enregistre un paiement (montant saisi, mode choisi), puis fiche et badges sont rechargés", async () => {
    mocks.utilisateur = { est_proprietaire: false };
    mockerApi();
    mocks.post.mockResolvedValue({ data: { id: 80 } });
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    const a41 = achat(fiche, 41);
    // D3 : pas de correction pour l'employé.
    expect(within(fiche).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();

    const mode = within(a41).getByLabelText('Mode de paiement');
    expect(mode).toHaveValue('');
    await coller(user, within(a41).getByLabelText('Enregistrer un paiement'), '1000');
    await user.selectOptions(mode, 'ESPECES');
    const appelsAvecDette = mocks.getAll.mock.calls.filter(([url]) => url === 'fournisseurs/avec_dette/').length;
    await user.click(within(a41).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('achats/paiements/', { achat: 41, montant: '1000', mode_paiement: 'ESPECES' });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(
      mocks.getAll.mock.calls.filter(([url]) => url === 'fournisseurs/avec_dette/').length,
    ).toBe(appelsAvecDette + 1));
  });

  it('paiement sans mode ou sans montant : bloqué, sans envoi', async () => {
    mockerApi();
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    const a41 = achat(fiche, 41);
    await user.click(within(a41).getByRole('button', { name: 'Enregistrer' }));
    expect(within(a41).getByText('Le montant doit être strictement positif.')).toBeInTheDocument();

    await coller(user, within(a41).getByLabelText('Enregistrer un paiement'), '1000');
    await user.click(within(a41).getByRole('button', { name: 'Enregistrer' }));
    expect(within(a41).getByText('Choisissez le mode de paiement.')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('refus du serveur : son message est affiché, la saisie conservée', async () => {
    mockerApi();
    mocks.post.mockRejectedValue({
      response: { status: 400, data: ['Le montant du paiement dépasse le montant dû sur cet achat.'] },
    });
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    const a41 = achat(fiche, 41);
    await coller(user, within(a41).getByLabelText('Enregistrer un paiement'), '9000');
    await user.selectOptions(within(a41).getByLabelText('Mode de paiement'), 'CARTE');
    await user.click(within(a41).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(a41).findByText('Le montant du paiement dépasse le montant dû sur cet achat.')).toBeInTheDocument();
    expect(within(a41).getByLabelText('Enregistrer un paiement')).toHaveValue(9000);
    expect(within(a41).getByLabelText('Mode de paiement')).toHaveValue('CARTE');
  });

  it("le propriétaire corrige un paiement : montant effectif prérempli, motif obligatoire, objet envoyé", async () => {
    mockerApi();
    mocks.post.mockResolvedValue({ data: { id: 81 } });
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    const a41 = achat(fiche, 41);
    await user.click(within(a41).getByRole('button', { name: 'Corriger' }));
    const nouveauMontant = within(a41).getByLabelText('Nouveau montant');
    expect(nouveauMontant).toHaveValue(2500);

    await user.click(within(a41).getByRole('button', { name: 'Valider la correction' }));
    expect(within(a41).getByText('Le motif de la correction est obligatoire.')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await coller(user, nouveauMontant, '2000');
    await coller(user, within(a41).getByLabelText('Motif de la correction'), 'reçu relu');
    await user.click(within(a41).getByRole('button', { name: 'Valider la correction' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('achats/paiements/71/corriger/', { nouveau_montant: '2000', motif: 'reçu relu' });
  });

  it('vue support : ni formulaire de paiement, ni « Corriger »', async () => {
    mocks.modeSupport = true;
    mockerApi();
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    expect(within(fiche).queryByLabelText('Enregistrer un paiement')).not.toBeInTheDocument();
    expect(within(fiche).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
  });

  it('champs absents (total_paiements, corrections) : ni « undefined » ni « NaN »', async () => {
    mockerApi({
      historiqueFn: () => historique().map((a) => {
        delete a.total_paiements;
        a.paiements.forEach((p) => delete p.corrections);
        return a;
      }),
    });
    const user = userEvent.setup();
    render(<Suppliers />);

    const fiche = await ouvrirFiche(user);
    expect(within(fiche).queryByText(/undefined|NaN/)).not.toBeInTheDocument();
    expect(within(achat(fiche, 41)).getAllByText(/Paiements/)[0]).not.toHaveTextContent(/total/);
  });
});
