import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compterNonLues: vi.fn(),
  listerNotifications: vi.fn(),
  marquerLue: vi.fn(),
}));

vi.mock('../../services/notifications', () => ({
  compterNonLues: mocks.compterNonLues,
  listerNotifications: mocks.listerNotifications,
  marquerLue: mocks.marquerLue,
}));

import NotificationBell from '../NotificationBell';

const notificationNonLue = {
  id: 1,
  type_notification: 'stock_bas',
  message: 'Stock bas : Riz (2 restant, seuil 5)',
  produit: 10,
  vente: null,
  destinataire_role: 'tous',
  date_creation: new Date().toISOString(),
  lue: false,
};

const notificationLue = {
  id: 2,
  type_notification: 'dette_retard',
  message: 'Dette en retard : Awa doit 5000 FCFA depuis 8 jours',
  produit: null,
  vente: 42,
  destinataire_role: 'proprietaire',
  date_creation: new Date().toISOString(),
  lue: true,
};

describe('NotificationBell', () => {
  beforeEach(() => {
    mocks.compterNonLues.mockReset();
    mocks.listerNotifications.mockReset();
    mocks.marquerLue.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('affiche le badge avec le bon nombre de non-lues', async () => {
    mocks.compterNonLues.mockResolvedValue(3);

    render(<NotificationBell />);

    expect(await screen.findByTestId('notification-bell-badge')).toHaveTextContent('3');
  });

  it('masque le badge si aucune notification non lue', async () => {
    mocks.compterNonLues.mockResolvedValue(0);

    render(<NotificationBell />);

    await waitFor(() => expect(mocks.compterNonLues).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-bell-badge')).not.toBeInTheDocument();
  });

  it('ouvre le panneau et liste les notifications au clic sur la cloche', async () => {
    mocks.compterNonLues.mockResolvedValue(1);
    mocks.listerNotifications.mockResolvedValue([notificationNonLue, notificationLue]);
    const user = userEvent.setup();

    render(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText(notificationNonLue.message)).toBeInTheDocument();
    expect(screen.getByText(notificationLue.message)).toBeInTheDocument();
  });

  it('marque une notification comme lue au clic (appel API vérifié)', async () => {
    mocks.compterNonLues.mockResolvedValue(1);
    mocks.listerNotifications.mockResolvedValue([notificationNonLue]);
    mocks.marquerLue.mockResolvedValue({ ...notificationNonLue, lue: true });
    const user = userEvent.setup();

    render(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    const item = await screen.findByText(notificationNonLue.message);

    await user.click(item);

    expect(mocks.marquerLue).toHaveBeenCalledWith(notificationNonLue.id);
  });

  it("ne rappelle pas l'API pour une notification déjà lue", async () => {
    mocks.compterNonLues.mockResolvedValue(0);
    mocks.listerNotifications.mockResolvedValue([notificationLue]);
    const user = userEvent.setup();

    render(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    const item = await screen.findByText(notificationLue.message);

    await user.click(item);

    expect(mocks.marquerLue).not.toHaveBeenCalled();
  });

  it('ferme le panneau à la touche Échap', async () => {
    mocks.compterNonLues.mockResolvedValue(0);
    mocks.listerNotifications.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ferme le panneau au clic extérieur', async () => {
    mocks.compterNonLues.mockResolvedValue(0);
    mocks.listerNotifications.mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <div>
        <NotificationBell />
        <button type="button">Ailleurs</button>
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ailleurs' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
