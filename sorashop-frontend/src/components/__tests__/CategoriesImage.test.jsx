import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  getAll: vi.fn(),
  post: vi.fn(),
  support: { actif: false, boutiqueId: null },
}));

vi.mock('../../services/api', () => ({
  default: { delete: mocks.delete, post: mocks.post },
  getAll: mocks.getAll,
}));

vi.mock('../../context/settingsContextValue', () => ({
  useSettings: () => ({ utilisateur: { est_proprietaire: true } }),
}));

vi.mock('../../context/supportViewContextValue', () => ({
  useSupportView: () => mocks.support,
}));

import Categories from '../Categories';

const MESSAGE_FORMAT = "Format d'image non accepté. Choisissez une photo JPG ou PNG.";

const refus = (data, status = 400) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data },
});

const imageJpeg = () => new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' });

function fenetre() {
  return screen.getByRole('heading', { name: 'Ajouter une nouvelle catégorie' }).closest('.fixed');
}

async function remplirCreation(user) {
  await user.click((await screen.findAllByRole('button', { name: /Ajouter une catégorie/ }))[0]);
  const f = fenetre();
  fireEvent.change(within(f).getByPlaceholderText(/Robes/), { target: { value: 'Boissons' } });
  return f;
}

function appelsImage(methode) {
  return mocks[methode].mock.calls.filter(([url]) => /^categories\/\d+\/image\/$/.test(url));
}

describe('Catégories : image dans le formulaire de création', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
    mocks.support = { actif: false, boutiqueId: null };
    mocks.getAll.mockResolvedValue([]);
    URL.createObjectURL = vi.fn(() => 'blob:apercu');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('la catégorie est créée d’abord, puis l’image part en FormData sur sa route', async () => {
    mocks.post.mockImplementation((url) => Promise.resolve({ data: url === 'categories/' ? { id: 9 } : {} }));
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une image'), imageJpeg());
    expect(within(f).getByRole('img', { name: 'Image de Boissons' })).toHaveAttribute('src', 'blob:apercu');
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(appelsImage('post')).toHaveLength(1));
    expect(mocks.post.mock.calls[0]).toEqual(['categories/', { nom: 'Boissons', description: '' }]);
    const [url, donnees, options] = appelsImage('post')[0];
    expect(url).toBe('categories/9/image/');
    expect(donnees).toBeInstanceOf(FormData);
    expect(donnees.get('image').name).toBe('IMG_0001.jpg');
    expect(options).toEqual({ headers: { 'Content-Type': undefined } });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ajouter une nouvelle catégorie' })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('image refusée : message dans la page « catégorie créée, image non envoyée », sans alert()', async () => {
    mocks.post.mockImplementation((url) => (url === 'categories/'
      ? Promise.resolve({ data: { id: 9 } })
      : Promise.reject(refus([MESSAGE_FORMAT]))));
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une image'), imageJpeg());
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Catégorie créée, image non envoyée : ${MESSAGE_FORMAT}`);
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ajouter une nouvelle catégorie' })).not.toBeInTheDocument();
    // La liste est rechargée : la catégorie créée y apparaît.
    expect(mocks.getAll.mock.calls.filter(([e]) => e === 'categories/')).toHaveLength(2);
  });

  it('double clic sur Enregistrer : une seule catégorie et une seule image envoyées', async () => {
    let libererImage;
    mocks.post.mockImplementation((url) => (url === 'categories/'
      ? Promise.resolve({ data: { id: 9 } })
      : new Promise((resolve) => { libererImage = resolve; })));
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une image'), imageJpeg());
    await user.dblClick(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(within(f).getByRole('button', { name: "Envoi de l'image..." })).toBeDisabled());
    expect(mocks.post.mock.calls.filter(([u]) => u === 'categories/')).toHaveLength(1);
    expect(appelsImage('post')).toHaveLength(1);
    libererImage({ data: {} });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ajouter une nouvelle catégorie' })).not.toBeInTheDocument());
  });

  it('« Annuler le choix » : la catégorie est créée sans image', async () => {
    mocks.post.mockResolvedValue({ data: { id: 9 } });
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    const f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une image'), imageJpeg());
    await user.click(within(f).getByRole('button', { name: 'Annuler le choix' }));
    expect(within(f).getByRole('img', { name: "Pas d'image pour Boissons" })).toBeInTheDocument();
    await user.click(within(f).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ajouter une nouvelle catégorie' })).not.toBeInTheDocument());
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(appelsImage('post')).toHaveLength(0);
  });

  it('fermer la fenêtre oublie l’image choisie', async () => {
    mocks.post.mockResolvedValue({ data: { id: 9 } });
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    let f = await remplirCreation(user);
    await user.upload(within(f).getByLabelText('Choisir une image'), imageJpeg());
    await user.click(within(f).getByRole('button', { name: 'Annuler' }));
    f = await remplirCreation(user);

    expect(within(f).getByLabelText('Choisir une image')).toBeInTheDocument();
    expect(within(f).getByRole('img', { name: "Pas d'image pour Boissons" })).toBeInTheDocument();
  });
});

const URL_BOISSONS = 'https://r2.example/categories/3/boissons.webp?signature=abc';
const categorie = (id, nom, champs = {}) => ({ id, nom, description: '', ...champs });

function connexion(enLigne) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(enLigne);
  act(() => {
    window.dispatchEvent(new Event(enLigne ? 'online' : 'offline'));
  });
}

describe('Catégories : miniature sur la carte, changer ou retirer l’image', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
    mocks.support = { actif: false, boutiqueId: null };
    URL.createObjectURL = vi.fn(() => 'blob:apercu');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('miniature quand la catégorie a une image ; icône sans image ; champ absent : icône et aucune action', async () => {
    mocks.getAll.mockResolvedValue([
      categorie(1, 'Boissons', { image: URL_BOISSONS }),
      categorie(2, 'Épicerie', { image: null }),
      categorie(3, 'Hygiène'), // champ absent : backend pas encore déployé
    ]);
    render(<Categories />);

    expect(await screen.findByRole('img', { name: 'Image de Boissons' })).toHaveAttribute('src', URL_BOISSONS);
    expect(screen.getByRole('img', { name: "Pas d'image pour Épicerie" })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: "Pas d'image pour Hygiène" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Retirer l'image de la catégorie Boissons" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Retirer l'image de la catégorie Épicerie" })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Image de la catégorie Épicerie')).toBeInTheDocument();
    expect(screen.queryByLabelText('Image de la catégorie Hygiène')).not.toBeInTheDocument();
  });

  it('image qui ne se charge pas (URL signée expirée) : icône par défaut', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    render(<Categories />);

    fireEvent.error(await screen.findByRole('img', { name: 'Image de Boissons' }));

    expect(screen.getByRole('img', { name: "Pas d'image pour Boissons" })).toBeInTheDocument();
  });

  it('hors ligne : icône sans charger l’image ; de retour en ligne, la miniature revient', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    render(<Categories />);
    await screen.findByRole('img', { name: 'Image de Boissons' });

    connexion(false);
    expect(screen.getByRole('img', { name: "Pas d'image pour Boissons" })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();

    connexion(true);
    expect(screen.getByRole('img', { name: 'Image de Boissons' })).toHaveAttribute('src', URL_BOISSONS);
  });

  it('changer l’image depuis la carte : FormData sur sa route, la carte prend la nouvelle URL', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    const nouvelle = 'https://r2.example/categories/3/nouvelle.webp?signature=def';
    mocks.post.mockResolvedValue({ data: categorie(1, 'Boissons', { image: nouvelle }) });
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    await user.upload(await screen.findByLabelText('Image de la catégorie Boissons'), imageJpeg());

    await waitFor(() => expect(screen.getByRole('img', { name: 'Image de Boissons' })).toHaveAttribute('src', nouvelle));
    const [url, donnees, options] = mocks.post.mock.calls[0];
    expect(url).toBe('categories/1/image/');
    expect(donnees.get('image').name).toBe('IMG_0001.jpg');
    expect(options).toEqual({ headers: { 'Content-Type': undefined } });
    expect(mocks.getAll).toHaveBeenCalledTimes(1);
  });

  it('retirer l’image depuis la carte : DELETE sur sa route, la carte revient à l’icône', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    mocks.delete.mockResolvedValue({ data: categorie(1, 'Boissons', { image: null }) });
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    await user.click(await screen.findByRole('button', { name: "Retirer l'image de la catégorie Boissons" }));

    expect(await screen.findByRole('img', { name: "Pas d'image pour Boissons" })).toBeInTheDocument();
    expect(mocks.delete).toHaveBeenCalledWith('categories/1/image/');
    expect(screen.queryByRole('button', { name: "Retirer l'image de la catégorie Boissons" })).not.toBeInTheDocument();
  });

  it('image refusée depuis la carte : message dans la page, sans alert(), ancienne image gardée', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    mocks.post.mockRejectedValue(refus([MESSAGE_FORMAT]));
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    await user.upload(await screen.findByLabelText('Image de la catégorie Boissons'), imageJpeg());

    expect(await screen.findByRole('alert')).toHaveTextContent(`Image non envoyée : ${MESSAGE_FORMAT}`);
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Image de Boissons' })).toHaveAttribute('src', URL_BOISSONS);
  });

  it('pendant un envoi, les actions d’image sont désactivées : une seule requête', async () => {
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    let liberer;
    mocks.post.mockImplementation(() => new Promise((resolve) => { liberer = resolve; }));
    const user = userEvent.setup({ delay: null });
    render(<Categories />);

    const champ = await screen.findByLabelText('Image de la catégorie Boissons');
    await user.upload(champ, imageJpeg());

    expect(await screen.findByText('Envoi...')).toBeInTheDocument();
    expect(champ).toBeDisabled();
    expect(screen.getByRole('button', { name: "Retirer l'image de la catégorie Boissons" })).toBeDisabled();
    fireEvent.change(champ, { target: { files: [imageJpeg()] } });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    liberer({ data: categorie(1, 'Boissons', { image: URL_BOISSONS }) });
    await waitFor(() => expect(screen.queryByText('Envoi...')).not.toBeInTheDocument());
  });

  it('Vue Support : actions d’image désactivées, aucune requête', async () => {
    mocks.support = { actif: true, boutiqueId: 3 };
    mocks.getAll.mockResolvedValue([categorie(1, 'Boissons', { image: URL_BOISSONS })]);
    render(<Categories />);

    const champ = await screen.findByLabelText('Image de la catégorie Boissons');
    expect(champ).toBeDisabled();
    expect(screen.getByRole('button', { name: "Retirer l'image de la catégorie Boissons" })).toBeDisabled();
    fireEvent.change(champ, { target: { files: [imageJpeg()] } });
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
