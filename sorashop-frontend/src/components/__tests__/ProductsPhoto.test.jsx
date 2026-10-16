import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  getAll: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  support: { actif: false, boutiqueId: null },
}));

vi.mock('../../services/api', () => ({
  default: { delete: mocks.delete, patch: mocks.patch, post: mocks.post, put: mocks.put },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({
    parametres: { devise: 'FCFA' },
    utilisateur: { est_proprietaire: true },
  }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => mocks.support,
}));

import Products from '../Products';

const MESSAGE_FORMAT = "Format d'image non accepté. Choisissez une photo JPG ou PNG.";

const SAVON = {
  id: 1,
  nom: 'Savon',
  prix_achat: '100',
  prix_unitaire: '150',
  prix_douzaine: '1800',
  quantite_en_stock: 5,
  stock_minimum: 1,
  photo: 'https://r2.example/produits/1/savon.webp?signature=abc',
};

const refus = (data, status = 400) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data },
});

function catalogue(produits) {
  mocks.getAll.mockImplementation((endpoint) => Promise.resolve(endpoint === 'produits/' ? produits : []));
}

const photoJpeg = () => new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' });

function fenetre() {
  return screen.getByRole('heading', { name: /produit/i, level: 3 }).closest('.fixed');
}

async function ouvrirModification(user, nom = 'Savon') {
  await user.click(await screen.findByRole('button', { name: `Modifier le produit ${nom}` }));
  return fenetre();
}

async function remplirCreation(user) {
  await user.click(await screen.findByRole('button', { name: 'Ajouter un produit' }));
  const f = fenetre();
  // Remplissage direct (fireEvent.change) : ce n'est pas ce que ces tests
  // vérifient, et six saisies par user-event prenaient environ 4 s sur les
  // 5 s du délai (mesuré le 2026-10-16).
  fireEvent.change(within(f).getAllByRole('textbox')[0], { target: { value: 'Riz' } });
  for (const champ of within(f).getAllByRole('spinbutton')) {
    fireEvent.change(champ, { target: { value: '1' } });
  }
  return f;
}

function appelsPhoto(methode) {
  return mocks[methode].mock.calls.filter(([url]) => /^produits\/\d+\/photo\/$/.test(url));
}

describe('Fiche produit : photo', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
    mocks.support = { actif: false, boutiqueId: null };
    mocks.put.mockResolvedValue({ data: {} });
    mocks.delete.mockResolvedValue({ data: {} });
    URL.createObjectURL = vi.fn(() => 'blob:apercu');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('création : le produit est créé d’abord, puis la photo part en FormData sur sa route', async () => {
    catalogue([SAVON]);
    mocks.post.mockImplementation((url) => Promise.resolve({ data: url === 'produits/' ? { id: 7 } : {} }));
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une photo'), photoJpeg());
    expect(within(f).getByRole('img', { name: 'Photo de Riz' })).toHaveAttribute('src', 'blob:apercu');
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appelsPhoto('post')).toHaveLength(1));
    expect(mocks.post.mock.calls[0][0]).toBe('produits/');
    const [url, donnees, options] = appelsPhoto('post')[0];
    expect(url).toBe('produits/7/photo/');
    expect(donnees).toBeInstanceOf(FormData);
    expect(donnees.get('photo').name).toBe('IMG_0001.jpg');
    expect(options).toEqual({ headers: { 'Content-Type': undefined } });
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('création : photo refusée, message dans la page « produit créé, photo non envoyée », sans alert()', async () => {
    catalogue([SAVON]);
    mocks.post.mockImplementation((url) => (url === 'produits/'
      ? Promise.resolve({ data: { id: 7 } })
      : Promise.reject(refus([MESSAGE_FORMAT]))));
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une photo'), photoJpeg());
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Produit créé, photo non envoyée : ${MESSAGE_FORMAT}`);
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    // La liste est rechargée : le produit créé y apparaît.
    expect(mocks.getAll.mock.calls.filter(([e]) => e === 'produits/')).toHaveLength(2);
  });

  it('double clic sur Enregistrer : une seule photo envoyée', async () => {
    catalogue([SAVON]);
    let liberer;
    mocks.post.mockImplementation(() => new Promise((resolve) => { liberer = resolve; }));
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);
    await user.upload(within(f).getByLabelText('Changer la photo'), photoJpeg());
    const enregistrer = within(f).getByRole('button', { name: 'Enregistrer les modifications' });
    await user.dblClick(enregistrer);

    await waitFor(() => expect(within(f).getByRole('button', { name: 'Envoi de la photo...' })).toBeDisabled());
    expect(appelsPhoto('post')).toHaveLength(1);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    liberer({ data: {} });
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument());
  });

  it('modification : « Retirer la photo » l’envoie à l’enregistrement (DELETE), jamais avant', async () => {
    catalogue([SAVON]);
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);
    expect(within(f).getByRole('img', { name: 'Photo de Savon' })).toHaveAttribute('src', SAVON.photo);
    await user.click(within(f).getByRole('button', { name: 'Retirer la photo' }));
    expect(within(f).getByRole('img', { name: 'Pas de photo pour Savon' })).toBeInTheDocument();
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(f).getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('produits/1/photo/'));
    expect(appelsPhoto('post')).toHaveLength(0);
  });

  it('modification : retrait refusé, message dans la page « photo non retirée »', async () => {
    catalogue([SAVON]);
    mocks.delete.mockRejectedValue(refus({ detail: 'Erreur serveur.' }, 500));
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);
    await user.click(within(f).getByRole('button', { name: 'Retirer la photo' }));
    await user.click(within(f).getByRole('button', { name: 'Enregistrer les modifications' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Produit enregistré, photo non retirée : Erreur serveur.');
  });

  it('« Garder la photo » et « Annuler le choix » : rien n’est envoyé pour la photo', async () => {
    catalogue([SAVON]);
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);
    await user.click(within(f).getByRole('button', { name: 'Retirer la photo' }));
    await user.click(within(f).getByRole('button', { name: 'Garder la photo' }));
    await user.upload(within(f).getByLabelText('Changer la photo'), photoJpeg());
    await user.click(within(f).getByRole('button', { name: 'Annuler le choix' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:apercu');
    expect(within(f).getByRole('img', { name: 'Photo de Savon' })).toHaveAttribute('src', SAVON.photo);
    await user.click(within(f).getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument());
    expect(appelsPhoto('post')).toHaveLength(0);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('champ photo absent (backend pas encore déployé) : image par défaut, pas de « Retirer »', async () => {
    const sansChamp = { ...SAVON };
    delete sansChamp.photo;
    catalogue([sansChamp]);
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);

    expect(within(f).getByRole('img', { name: 'Pas de photo pour Savon' })).toBeInTheDocument();
    expect(within(f).getByLabelText('Choisir une photo')).toBeEnabled();
    expect(within(f).queryByRole('button', { name: 'Retirer la photo' })).not.toBeInTheDocument();
  });

  it('photo qui ne se charge pas (URL expirée) : image par défaut', async () => {
    catalogue([SAVON]);
    const user = userEvent.setup({ delay: null });
    render(<Products />);

    const f = await ouvrirModification(user);
    fireEvent.error(within(f).getByRole('img', { name: 'Photo de Savon' }));

    expect(within(f).getByRole('img', { name: 'Pas de photo pour Savon' })).toBeInTheDocument();
  });

  it('Vue Support : la fiche ne s’ouvre pas, aucune action sur la photo possible', async () => {
    mocks.support = { actif: true, boutiqueId: 3 };
    catalogue([SAVON]);
    render(<Products />);

    expect(await screen.findByRole('button', { name: 'Modifier le produit Savon' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter un produit' })).toBeDisabled();
    expect(screen.queryByLabelText(/photo/i)).not.toBeInTheDocument();
  });
});
