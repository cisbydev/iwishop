import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { delete: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn() },
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

const produit = (id, nom, champs = {}) => ({
  id,
  nom,
  prix_achat: '100',
  prix_unitaire: '150',
  prix_douzaine: '1800',
  quantite_en_stock: 5,
  stock_minimum: 1,
  ...champs,
});

const URL_SAVON = 'https://r2.example/produits/1/savon.webp?signature=abc';

function catalogue(produits) {
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(endpoint === 'produits/' ? produits : []));
}

function connexion(enLigne) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(enLigne);
  act(() => {
    window.dispatchEvent(new Event(enLigne ? 'online' : 'offline'));
  });
}

describe('Liste des produits : miniature ou image par défaut', () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:apercu');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('miniature quand le produit a une photo ; image par défaut sans photo ou champ absent', async () => {
    catalogue([
      produit(1, 'Savon', { photo: URL_SAVON }),
      produit(2, 'Riz', { photo: null }),
      produit(3, 'Huile'), // champ absent : backend pas encore déployé
    ]);
    render(<Products />);

    expect(await screen.findByRole('img', { name: 'Photo de Savon' })).toHaveAttribute('src', URL_SAVON);
    expect(screen.getByRole('img', { name: 'Pas de photo pour Riz' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pas de photo pour Huile' })).toBeInTheDocument();
  });

  it('miniature qui ne se charge pas (URL signée expirée) : image par défaut', async () => {
    catalogue([produit(1, 'Savon', { photo: URL_SAVON })]);
    render(<Products />);

    fireEvent.error(await screen.findByRole('img', { name: 'Photo de Savon' }));

    expect(screen.getByRole('img', { name: 'Pas de photo pour Savon' })).toBeInTheDocument();
  });

  it('hors ligne : image par défaut sans tenter de charger la photo ; de retour en ligne, la miniature revient', async () => {
    catalogue([produit(1, 'Savon', { photo: URL_SAVON })]);
    render(<Products />);
    await screen.findByRole('img', { name: 'Photo de Savon' });

    connexion(false);
    expect(screen.getByRole('img', { name: 'Pas de photo pour Savon' })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();

    connexion(true);
    expect(screen.getByRole('img', { name: 'Photo de Savon' })).toHaveAttribute('src', URL_SAVON);
  });

  it('hors ligne : l’aperçu d’une photo choisie (locale) reste affiché dans la fiche', async () => {
    catalogue([produit(1, 'Savon', { photo: URL_SAVON })]);
    const user = userEvent.setup({ delay: null });
    render(<Products />);
    await user.click(await screen.findByRole('button', { name: 'Modifier le produit Savon' }));
    const fenetre = screen.getByRole('heading', { name: 'Modifier le produit' }).closest('.fixed');

    connexion(false);
    await user.upload(within(fenetre).getByLabelText('Changer la photo'), new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' }));

    expect(within(fenetre).getByRole('img', { name: 'Photo de Savon' })).toHaveAttribute('src', 'blob:apercu');
  });
});
