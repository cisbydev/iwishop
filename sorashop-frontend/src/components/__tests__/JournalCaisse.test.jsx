import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  settings: {
    parametres: { devise: 'FCFA' },
    utilisateur: { est_proprietaire: true },
    aAccesPremium: true,
  },
}));

vi.mock('../../services/api', () => ({
  default: { get: mocks.get },
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => mocks.settings,
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => ({ actif: false, boutiqueId: null }),
}));

import JournalCaisse from '../JournalCaisse';
import Reports from '../Reports';

function ligne(mode_paiement, ventes, remboursements, total) {
  return { mode_paiement, ventes, remboursements, total };
}

// Valeurs volontairement "incohérentes" entre elles (total ≠ somme) : le
// composant doit afficher ce que renvoie l'API, jamais recalculer.
const JOURNAL = {
  date_debut: '2026-03-10',
  date_fin: '2026-03-10',
  entrees: {
    par_mode: [
      ligne('ESPECES', 1000.0, 250.0, 1250.0),
      ligne('MOBILE_MONEY', 200.0, 0.0, 200.0),
      ligne('CARTE', 0.0, 0.0, 0.0),
      ligne('AUTRE', 0.0, 0.0, 0.0),
      ligne(null, 0.0, 100.0, 100.0),
    ],
    ventes: 1200.0,
    remboursements: 350.0,
    total: 7777.0,
  },
  sorties: { achats: 400.0, nombre_achats: 1, depenses: 150.0, nombre_depenses: 2, total: 550.0 },
  solde_periode: 1000.0,
  informations: { nombre_ventes: 3, credit_accorde: 800.0, ventes_synchronisees_en_differe: 1 },
};

const RESUME = {
  chiffre_affaires: 2000, nombre_ventes: 2, total_achats: 400, nombre_achats: 1,
  total_depenses: 150, nombre_depenses: 2, benefice_brut: 900, benefice_net: 750,
};

describe('JournalCaisse', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({ data: JOURNAL });
    mocks.settings.utilisateur = { est_proprietaire: true };
    mocks.settings.aAccesPremium = true;
  });

  it("charge la journée du serveur par défaut (sans dates) et affiche les montants tels que renvoyés par l'API", async () => {
    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('reports/journal-caisse/', { params: {} });
    // Total encaissé = valeur API (7777), pas la somme des lignes.
    const tableau = screen.getByRole('table');
    const totalEncaisse = within(tableau).getByText('Total encaissé').closest('tr');
    expect(within(totalEncaisse).getByText(/7\s?777/)).toBeInTheDocument();
    expect(within(tableau).getByText('Non précisé')).toBeInTheDocument();
  });

  it('version téléphone : une carte par mode non nul, total encaissé de l\'API', async () => {
    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    const cartes = screen.getByRole('list', { name: 'Entrées par mode' });
    expect(within(cartes).getByText('Espèces')).toBeInTheDocument();
    expect(within(cartes).getByText('Mobile Money')).toBeInTheDocument();
    expect(within(cartes).getByText('Non précisé')).toBeInTheDocument();
    // Modes à 0 omis sur téléphone.
    expect(within(cartes).queryByText('Carte bancaire')).not.toBeInTheDocument();
    expect(within(cartes).queryByText('Autre')).not.toBeInTheDocument();
    const total = within(cartes).getByText('Total encaissé').closest('li');
    expect(within(total).getByText(/7\s?777/)).toBeInTheDocument();
  });

  it('explique que le solde ne tient pas compte du fond de caisse, et que les sorties sont supposées payées comptant', async () => {
    render(<JournalCaisse />);

    expect(await screen.findByText(/fond de caisse de départ n'est pas enregistré/)).toBeInTheDocument();
    expect(screen.getByText(/considérés comme payés comptant/)).toBeInTheDocument();
    expect(screen.queryByText(/caisse attendue/i)).not.toBeInTheDocument();
  });

  it('signale les ventes synchronisées en différé', async () => {
    render(<JournalCaisse />);

    expect(await screen.findByText(/hors connexion, comptée\(s\) au jour de leur synchronisation/)).toBeInTheDocument();
  });

  it('envoie la période choisie et affiche le message de refus de l\'API', async () => {
    const user = userEvent.setup();
    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    mocks.get.mockRejectedValueOnce({
      response: { status: 400, data: { detail: ['La période ne peut pas dépasser 31 jours.'] } },
    });
    const debut = screen.getByLabelText('Date de début');
    const fin = screen.getByLabelText('Date de fin');
    await user.clear(debut);
    await user.type(debut, '2026-03-01');
    await user.clear(fin);
    await user.type(fin, '2026-04-15');
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(mocks.get).toHaveBeenLastCalledWith('reports/journal-caisse/', {
      params: { date_debut: '2026-03-01', date_fin: '2026-04-15' },
    });
    expect(await screen.findByText(/ne peut pas dépasser 31 jours/)).toBeInTheDocument();
  });

  it('masque la colonne remboursements hors Premium quand il n\'y en a aucun', async () => {
    mocks.settings.aAccesPremium = false;
    mocks.get.mockResolvedValue({
      data: { ...JOURNAL, entrees: { ...JOURNAL.entrees, remboursements: 0.0 } },
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(screen.queryByText('Remboursements de dettes')).not.toBeInTheDocument();
    const cartes = screen.getByRole('list', { name: 'Entrées par mode' });
    expect(within(cartes).queryByText(/Remboursements/)).not.toBeInTheDocument();
  });
});

describe('Reports - onglet Caisse', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('reports/journal-caisse/') ? JOURNAL : RESUME,
    }));
    mocks.settings.aAccesPremium = true;
  });

  it('le propriétaire bascule sur le journal de caisse', async () => {
    mocks.settings.utilisateur = { est_proprietaire: true };
    const user = userEvent.setup();
    render(<Reports />);

    await user.click(await screen.findByRole('tab', { name: 'Caisse' }));

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    // Les exports concernent le résumé financier : absents sur la caisse.
    expect(screen.queryByRole('button', { name: /Exporter en PDF/ })).not.toBeInTheDocument();
  });

  it("l'employé n'a pas d'onglet Caisse", async () => {
    mocks.settings.utilisateur = { est_proprietaire: false };
    render(<Reports />);

    expect(await screen.findByText("Chiffre d'Affaires")).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Caisse' })).not.toBeInTheDocument();
  });
});
