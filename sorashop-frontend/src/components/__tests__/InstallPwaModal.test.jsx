import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InstallPwaModal from '../InstallPwaModal';

const CLE_FERMETURE = 'sorashop:install-prompt-dismissed-at';
const CLE_INSTALLE = 'sorashop:pwa-installed';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

function definirUserAgent(valeur) {
  Object.defineProperty(window.navigator, 'userAgent', { value: valeur, configurable: true });
}

function definirMatchMedia(standalone) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function definirNavigatorStandalone(valeur) {
  Object.defineProperty(window.navigator, 'standalone', { value: valeur, configurable: true });
}

// React ne flush les mises à jour d'état déclenchées par un setTimeout
// fake-timer que si l'avance est elle-même enveloppée dans act() - sans
// ça, l'état change bien en mémoire mais le DOM du test ne se met jamais à
// jour dans le même tick synchrone.
async function avancerDelai() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}

function declencherBeforeInstallPrompt() {
  const evenement = new Event('beforeinstallprompt', { cancelable: true });
  evenement.prompt = vi.fn();
  evenement.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    window.dispatchEvent(evenement);
  });
  return evenement;
}

describe('InstallPwaModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    definirUserAgent(UA_ANDROID);
    definirMatchMedia(false);
    definirNavigatorStandalone(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ne s'affiche jamais si déjà en mode standalone (matchMedia display-mode)", async () => {
    definirMatchMedia(true);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });

  it("ne s'affiche jamais si déjà en mode standalone (navigator.standalone Safari iOS)", async () => {
    definirUserAgent(UA_IPHONE);
    definirMatchMedia(false);
    definirNavigatorStandalone(true);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });

  it('ne raffiche pas la boîte moins de 3 jours après une fermeture', async () => {
    definirUserAgent(UA_IPHONE);
    const ilYA1Jour = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(CLE_FERMETURE, ilYA1Jour);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });

  it('raffiche la boîte plus de 3 jours après une fermeture', async () => {
    definirUserAgent(UA_IPHONE);
    const ilYA4Jours = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(CLE_FERMETURE, ilYA4Jours);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.getByText('Installer IwiShop')).toBeInTheDocument();
  });

  it("ne s'affiche plus jamais si l'installation a déjà réussi (localStorage)", async () => {
    definirUserAgent(UA_IPHONE);
    window.localStorage.setItem(CLE_INSTALLE, 'true');

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });

  it("affiche les instructions iOS en 2 étapes quand la plateforme détectée est iOS", async () => {
    definirUserAgent(UA_IPHONE);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.getByText('Installer IwiShop')).toBeInTheDocument();
    expect(screen.getByText(/Appuyez sur/)).toHaveTextContent('Partager');
    expect(screen.getByText(/Choisissez/)).toHaveTextContent("Sur l'écran d'accueil");
    expect(screen.getByRole('button', { name: 'Compris' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Installer maintenant/ })).not.toBeInTheDocument();
  });

  it("n'affiche rien sur une plateforme générique tant que beforeinstallprompt ne s'est jamais déclenché", async () => {
    definirUserAgent(UA_ANDROID);

    render(<InstallPwaModal />);
    await avancerDelai();

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });

  it('affiche le bouton "Installer maintenant" et déclenche le prompt natif capturé via beforeinstallprompt', async () => {
    definirUserAgent(UA_ANDROID);

    render(<InstallPwaModal />);
    const evenement = declencherBeforeInstallPrompt();
    await avancerDelai();

    const bouton = screen.getByRole('button', { name: /Installer maintenant/ });
    fireEvent.click(bouton);

    expect(evenement.prompt).toHaveBeenCalledTimes(1);
  });

  it('mémorise la date de fermeture au clic sur "Plus tard" (Android/générique)', async () => {
    definirUserAgent(UA_ANDROID);

    render(<InstallPwaModal />);
    declencherBeforeInstallPrompt();
    await avancerDelai();

    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLE_FERMETURE)).toBeTruthy();
  });

  it('mémorise la fermeture au clic sur la croix', async () => {
    definirUserAgent(UA_IPHONE);

    render(<InstallPwaModal />);
    await avancerDelai();
    screen.getByText('Installer IwiShop');

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLE_FERMETURE)).toBeTruthy();
  });

  it("ne réaffiche plus la boîte après un évènement appinstalled", async () => {
    definirUserAgent(UA_ANDROID);

    render(<InstallPwaModal />);
    declencherBeforeInstallPrompt();
    await avancerDelai();
    screen.getByText('Installer IwiShop');

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLE_INSTALLE)).toBe('true');
  });

  it("n'affiche pas la boîte avant l'écoulement du délai, même si les conditions sont réunies", () => {
    definirUserAgent(UA_IPHONE);

    render(<InstallPwaModal />);

    expect(screen.queryByText('Installer IwiShop')).not.toBeInTheDocument();
  });
});
