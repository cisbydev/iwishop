import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  settings: {
    parametres: { devise: 'FCFA', nom_boutique: 'Nom des paramètres (périmé)' },
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
  boutique_nom: 'Boutique Awa',
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
    nombre_remboursements: 3,
    total: 7777.0,
  },
  sorties: { achats: 400.0, nombre_achats: 1, depenses: 150.0, nombre_depenses: 2, total: 550.0 },
  solde_periode: 1000.0,
  informations: { nombre_ventes: 3, credit_accorde: 800.0, credit_restant_du: 300.0, ventes_synchronisees_en_differe: 1 },
};

// Période sans aucun mouvement : tout à 0, toutes les lignes à 0. Forme
// actuelle de l'API (dettes fournisseurs comprises).
const JOURNAL_VIDE = {
  date_debut: '2026-03-10',
  date_fin: '2026-03-10',
  entrees: {
    par_mode: ['ESPECES', 'MOBILE_MONEY', 'CARTE', 'AUTRE'].map((mode) => ligne(mode, 0.0, 0.0, 0.0)),
    ventes: 0.0,
    remboursements: 0.0,
    nombre_remboursements: 0,
    total: 0.0,
  },
  sorties: {
    achats: 0.0,
    nombre_achats: 0,
    acomptes_achats: 0.0,
    paiements_fournisseurs: 0.0,
    nombre_paiements_fournisseurs: 0,
    achats_par_mode: ['ESPECES', 'MOBILE_MONEY', 'CARTE', 'AUTRE'].map((mode) => ({ mode_paiement: mode, montant: 0.0 })),
    depenses: 0.0,
    nombre_depenses: 0,
    total: 0.0,
  },
  solde_periode: 0.0,
  informations: {
    nombre_ventes: 0,
    credit_accorde: 0.0,
    credit_restant_du: 0.0,
    ventes_synchronisees_en_differe: 0,
    credit_fournisseur_obtenu: 0.0,
    dette_fournisseurs_restante: 0.0,
  },
};

// Clés ajoutées par les dettes fournisseurs (reports/caisse.py) : absentes
// d'un backend antérieur.
const CLES_SORTIES_DETTES = ['acomptes_achats', 'paiements_fournisseurs', 'nombre_paiements_fournisseurs', 'achats_par_mode'];
const CLES_INFOS_DETTES = ['credit_fournisseur_obtenu', 'dette_fournisseurs_restante'];

function sansClesDettes(journal) {
  const ancien = structuredClone(journal);
  CLES_SORTIES_DETTES.forEach((cle) => delete ancien.sorties[cle]);
  CLES_INFOS_DETTES.forEach((cle) => delete ancien.informations[cle]);
  return ancien;
}

function journalAvec({ entrees = {}, sorties = {}, informations = {}, ...reste }) {
  return {
    ...JOURNAL_VIDE,
    ...reste,
    entrees: { ...JOURNAL_VIDE.entrees, ...entrees },
    sorties: { ...JOURNAL_VIDE.sorties, ...sorties },
    informations: { ...JOURNAL_VIDE.informations, ...informations },
  };
}

function itemQuiContient(texte) {
  return screen.getByText(texte, { exact: false }).closest('li');
}

const RESUME = {
  boutique_nom: 'Boutique Awa', date_debut: '2026-03-01', date_fin: '2026-03-31',
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

  it('crédit de 6000 soldé le jour même (5000 espèces + 1000 Mobile Money) : vendu à crédit 6000, plus rien de dû', async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({
        entrees: {
          par_mode: [
            ligne('ESPECES', 0.0, 5000.0, 5000.0),
            ligne('MOBILE_MONEY', 0.0, 1000.0, 1000.0),
            ligne('CARTE', 0.0, 0.0, 0.0),
            ligne('AUTRE', 0.0, 0.0, 0.0),
          ],
          remboursements: 6000.0,
          nombre_remboursements: 2,
          total: 6000.0,
        },
        solde_periode: 6000.0,
        informations: { nombre_ventes: 1, credit_accorde: 6000.0, credit_restant_du: 0.0 },
      }),
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(itemQuiContient('Vendu à crédit sur la période')).toHaveTextContent(/6\s?000/);
    expect(itemQuiContient(/^Dont encore dû aujourd'hui/)).toHaveTextContent(/:\s*0\s/);
    expect(screen.queryByText(/non encaissé/)).not.toBeInTheDocument();
  });

  it('solde à 0 en couleur neutre, ni vert ni rouge', async () => {
    // Des mouvements qui se compensent : pas l'état vide.
    mocks.get.mockResolvedValue({
      data: journalAvec({
        sorties: { achats: 1000.0, nombre_achats: 1, total: 1000.0 },
        entrees: { ventes: 1000.0, total: 1000.0 },
        informations: { nombre_ventes: 1 },
        solde_periode: 0.0,
      }),
    });

    render(<JournalCaisse />);
    const libelle = await screen.findByText('Solde de la période');

    const montant = libelle.nextElementSibling;
    expect(montant).not.toHaveClass('text-emerald-600');
    expect(montant).not.toHaveClass('text-red-600');
    expect(montant).toHaveClass('text-slate-700');
  });

  it('affiche "Aucun mouvement sur cette période" au lieu des lignes à zéro', async () => {
    mocks.get.mockResolvedValue({ data: JOURNAL_VIDE });

    render(<JournalCaisse />);

    expect(await screen.findByText('Aucun mouvement sur cette période.')).toBeInTheDocument();
    expect(screen.getByText(/Période affichée/)).toBeInTheDocument();
    expect(screen.queryByText('Solde de la période')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("pas d'état vide pour une vente à crédit sans acompte (0 encaissé, mais une vente)", async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({ informations: { nombre_ventes: 1, credit_accorde: 6000.0, credit_restant_du: 6000.0 } }),
    });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
    expect(itemQuiContient('Vendu à crédit sur la période')).toHaveTextContent(/6\s?000/);
  });

  it("pas d'état vide pour un remboursement de 5000 annulé par sa correction (-5000) : 0 en montant, 2 mouvements", async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({ entrees: { remboursements: 0.0, nombre_remboursements: 2 } }),
    });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
  });

  it("À savoir : les remboursements d'une vente à crédit annulée restent à leur date", async () => {
    // Cas vérifié en prod : +5 000 puis -5 000 (2 lignes, 0 en montant),
    // vente annulée ensuite.
    mocks.get.mockResolvedValue({ data: journalAvec({ entrees: { nombre_remboursements: 2 } }) });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(
      screen.getByText("Si une vente à crédit est annulée, ses remboursements restent à leur date et s'annulent entre eux.")
    ).toBeInTheDocument();
  });

  it('backend pas encore déployé (credit_restant_du et nombre_remboursements absents) : ni ligne "Dont encore dû", ni état vide', async () => {
    const ancienneReponse = sansClesDettes(JOURNAL_VIDE);
    delete ancienneReponse.informations.credit_restant_du;
    delete ancienneReponse.entrees.nombre_remboursements;
    mocks.get.mockResolvedValue({ data: ancienneReponse });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Dont encore dû/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN|undefined/)).not.toBeInTheDocument();
    expect(screen.getByText(/Vendu à crédit sur la période/)).toBeInTheDocument();
  });
});

describe('JournalCaisse - sorties des achats (dettes fournisseurs)', () => {
  function achatsParMode(especes, mobile, carte, autre, nonPrecise) {
    const lignes = [
      { mode_paiement: 'ESPECES', montant: especes },
      { mode_paiement: 'MOBILE_MONEY', montant: mobile },
      { mode_paiement: 'CARTE', montant: carte },
      { mode_paiement: 'AUTRE', montant: autre },
    ];
    if (nonPrecise !== undefined) lignes.push({ mode_paiement: null, montant: nonPrecise });
    return lignes;
  }

  function sectionSorties() {
    return screen.getByRole('heading', { name: 'Sorties' }).closest('section');
  }

  function ligneSorties(texte) {
    return within(sectionSorties()).getByText(texte).closest('div');
  }

  beforeEach(() => {
    mocks.get.mockReset();
    mocks.settings.aAccesPremium = true;
  });

  it("achats, payé à l'achat, dettes payées et modes : valeurs de l'API, sans calcul", async () => {
    // Volontairement incohérent : 300 + 250 ≠ 900, et 700 + 123 ≠ 900.
    mocks.get.mockResolvedValue({
      data: journalAvec({
        sorties: {
          achats: 900.0,
          nombre_achats: 2,
          acomptes_achats: 300.0,
          paiements_fournisseurs: 250.0,
          nombre_paiements_fournisseurs: 1,
          achats_par_mode: achatsParMode(700.0, 0.0, 0.0, 0.0, 123.0),
          total: 900.0,
        },
      }),
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(ligneSorties('Achats')).toHaveTextContent(/^Achats900\sFCFA$/);
    expect(ligneSorties("Payé à l'achat (2)")).toHaveTextContent(/300\sFCFA$/);
    expect(ligneSorties('Dettes fournisseurs payées (1)')).toHaveTextContent(/250\sFCFA$/);

    const modes = screen.getByRole('list', { name: 'Achats par mode' });
    expect(within(modes).getByText('Espèces').closest('li')).toHaveTextContent(/700\sFCFA$/);
    expect(within(modes).getByText('Non précisé').closest('li')).toHaveTextContent(/123\sFCFA$/);
    // Modes à 0 : masqués sur téléphone seulement.
    expect(within(modes).getByText('Carte bancaire').closest('li')).toHaveClass('hidden', 'sm:flex');
    expect(within(modes).getByText('Espèces').closest('li')).not.toHaveClass('hidden');
  });

  it("pas de ligne « Non précisé » quand l'API n'en renvoie pas", async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({
        sorties: { achats: 500.0, nombre_achats: 1, acomptes_achats: 500.0, achats_par_mode: achatsParMode(500.0, 0.0, 0.0, 0.0), total: 500.0 },
      }),
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    const modes = screen.getByRole('list', { name: 'Achats par mode' });
    expect(within(modes).queryByText('Non précisé')).not.toBeInTheDocument();
  });

  it("pas d'état vide un jour où il n'y a qu'un paiement de dette fournisseur", async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({
        sorties: { achats: 500.0, paiements_fournisseurs: 500.0, nombre_paiements_fournisseurs: 1, achats_par_mode: achatsParMode(500.0, 0.0, 0.0, 0.0), total: 500.0 },
        solde_periode: -500.0,
      }),
    });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
    expect(ligneSorties('Dettes fournisseurs payées (1)')).toHaveTextContent(/500\sFCFA$/);
  });

  it("paiement fournisseur annulé par sa correction (0 en montant, 2 mouvements) : pas d'état vide", async () => {
    mocks.get.mockResolvedValue({ data: journalAvec({ sorties: { nombre_paiements_fournisseurs: 2 } }) });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
  });

  it('bandeau : achats = argent réellement versé par mode, dépenses supposées payées comptant', async () => {
    mocks.get.mockResolvedValue({ data: journalAvec({ sorties: { nombre_achats: 1 } }) });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(screen.getByText(/Achats : argent réellement versé \(à l'achat et dettes fournisseurs payées\), par mode/)).toBeInTheDocument();
    expect(screen.getByText(/« Non précisé » : achats enregistrés avant le suivi du mode de paiement/)).toBeInTheDocument();
    expect(screen.getByText(/Les dépenses sont considérées comme payées comptant/)).toBeInTheDocument();
    expect(screen.queryByText(/Les achats et les dépenses sont considérés comme payés comptant/)).not.toBeInTheDocument();
    expect(screen.getByText("Si un achat à crédit est annulé, ses paiements restent à leur date et s'annulent entre eux.")).toBeInTheDocument();
  });

  it('« Acheté à crédit » toujours affiché, même à 0, comme « Vendu à crédit »', async () => {
    mocks.get.mockResolvedValue({ data: journalAvec({ sorties: { nombre_achats: 1 } }) });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(itemQuiContient('Acheté à crédit sur la période')).toHaveTextContent(
      /^Acheté à crédit sur la période : 0\sFCFA, dont encore dû aujourd'hui : 0\sFCFA$/,
    );
  });

  it("« Acheté à crédit » : montants de l'API (crédit obtenu et dette restante)", async () => {
    mocks.get.mockResolvedValue({
      data: journalAvec({
        sorties: { nombre_achats: 1 },
        informations: { credit_fournisseur_obtenu: 700.0, dette_fournisseurs_restante: 400.0 },
      }),
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(itemQuiContient('Acheté à crédit sur la période')).toHaveTextContent(
      /^Acheté à crédit sur la période : 700\sFCFA, dont encore dû aujourd'hui : 400\sFCFA$/,
    );
  });

  it('backend antérieur aux dettes fournisseurs : ancien affichage, sans « undefined »', async () => {
    mocks.get.mockResolvedValue({
      data: sansClesDettes(journalAvec({ sorties: { achats: 400.0, nombre_achats: 1, total: 400.0 } })),
    });

    render(<JournalCaisse />);
    await screen.findByText('Solde de la période');

    expect(within(sectionSorties()).getByText('Achats (1)')).toBeInTheDocument();
    expect(within(sectionSorties()).queryByText(/Payé à l'achat/)).not.toBeInTheDocument();
    expect(within(sectionSorties()).queryByText(/Dettes fournisseurs payées/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Achats par mode' })).not.toBeInTheDocument();
    expect(screen.getByText(/Les achats et les dépenses sont considérés comme payés comptant/)).toBeInTheDocument();
    expect(screen.queryByText(/Acheté à crédit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Si un achat à crédit est annulé/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN|undefined/)).not.toBeInTheDocument();
  });

  it("backend antérieur, aucun mouvement connu : pas d'état vide (nombre_paiements_fournisseurs absent)", async () => {
    mocks.get.mockResolvedValue({ data: sansClesDettes(JOURNAL_VIDE) });

    render(<JournalCaisse />);

    expect(await screen.findByText('Solde de la période')).toBeInTheDocument();
    expect(screen.queryByText('Aucun mouvement sur cette période.')).not.toBeInTheDocument();
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

  // jsdom n'applique pas le média print : on vérifie le contenu du titre et
  // qu'il est masqué à l'écran (hidden + print:block), le rendu papier se
  // contrôle avec Ctrl+P.
  it('titre imprimé de la caisse : "Journal de caisse", boutique, période de l\'API ; pas celui du résumé', async () => {
    mocks.settings.utilisateur = { est_proprietaire: true };
    const user = userEvent.setup();
    render(<Reports />);

    await user.click(await screen.findByRole('tab', { name: 'Caisse' }));

    const titre = await screen.findByRole('heading', { name: 'Journal de caisse' });
    const entete = titre.parentElement;
    expect(entete).toHaveClass('hidden', 'print:block');
    expect(entete).toHaveTextContent('Boutique Awa · Période du 10/03/2026 au 10/03/2026');
    expect(screen.queryByRole('heading', { name: 'Résumé financier' })).not.toBeInTheDocument();
  });

  it('titre imprimé du résumé : "Résumé financier", boutique, période de l\'API', async () => {
    mocks.settings.utilisateur = { est_proprietaire: false };
    render(<Reports />);

    const titre = await screen.findByRole('heading', { name: 'Résumé financier' });
    const entete = titre.parentElement;
    expect(entete).toHaveClass('hidden', 'print:block');
    expect(entete).toHaveTextContent('Boutique Awa · Période du 01/03/2026 au 31/03/2026');
  });

  it("vue support : le nom imprimé vient de la réponse du rapport, jamais des paramètres chargés au démarrage", async () => {
    // Paramètres d'une autre boutique (chargés avant la session support) :
    // ils ne doivent jamais apparaître dans le titre imprimé.
    mocks.settings.utilisateur = { est_proprietaire: true };
    const user = userEvent.setup();
    render(<Reports />);

    const titreResume = await screen.findByRole('heading', { name: 'Résumé financier' });
    expect(titreResume.parentElement).toHaveTextContent('Boutique Awa');
    await user.click(screen.getByRole('tab', { name: 'Caisse' }));
    const titreCaisse = await screen.findByRole('heading', { name: 'Journal de caisse' });
    expect(titreCaisse.parentElement).toHaveTextContent('Boutique Awa');
    expect(screen.queryByText(/Nom des paramètres/)).not.toBeInTheDocument();
  });

  it('boutique_nom absent (backend pas encore déployé) : titre et période seuls, sans "undefined"', async () => {
    mocks.settings.utilisateur = { est_proprietaire: false };
    mocks.get.mockImplementation(() => Promise.resolve({ data: { ...RESUME, boutique_nom: undefined } }));
    render(<Reports />);

    const titre = await screen.findByRole('heading', { name: 'Résumé financier' });
    expect(titre.parentElement).toHaveTextContent(/^Résumé financierPériode du 01\/03\/2026 au 31\/03\/2026$/);
  });

  it("l'employé n'a pas d'onglet Caisse", async () => {
    mocks.settings.utilisateur = { est_proprietaire: false };
    render(<Reports />);

    expect(await screen.findByText("Chiffre d'Affaires")).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Caisse' })).not.toBeInTheDocument();
  });
});
