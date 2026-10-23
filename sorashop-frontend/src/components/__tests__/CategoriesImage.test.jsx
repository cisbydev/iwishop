import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
