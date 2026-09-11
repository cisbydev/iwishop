import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Download } from 'lucide-react';

const CLE_FERMETURE = 'sorashop:install-prompt-dismissed-at';
const CLE_INSTALLE = 'sorashop:pwa-installed';
const DELAI_AFFICHAGE_MS = 2500;
const DUREE_REPORT_MS = 3 * 24 * 60 * 60 * 1000;

function lireStorage(cle) {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    // Navigation privée / stockage bloqué par le navigateur : on dégrade en
    // "jamais fermé, jamais installé" plutôt que de planter l'app.
    return null;
  }
}

function ecrireStorage(cle, valeur) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Rien d'autre à faire : au pire la boîte réapparaîtra au prochain
    // chargement, ce n'est qu'une préférence d'affichage, pas une perte de
    // donnée métier.
  }
}

// Deux vérifications nécessaires et complémentaires : matchMedia couvre
// Chrome/Edge/Android (et Safari desktop récent), mais Safari iOS ne
// supporte PAS `display-mode: standalone` en media query - seule la
// propriété non-standard `navigator.standalone` le révèle sur cette
// plateforme. Aucune des deux ne suffit seule sur tous les navigateurs.
function estStandalone() {
  const parMediaQuery = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  const parSafariIOS = window.navigator.standalone === true;
  return Boolean(parMediaQuery || parSafariIOS);
}

function estDejaInstalleSelonStorage() {
  return lireStorage(CLE_INSTALLE) === 'true';
}

function estRecemmentFerme() {
  const valeur = lireStorage(CLE_FERMETURE);
  if (!valeur) return false;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() < DUREE_REPORT_MS;
}

// Détection de plateforme par user agent (méthode choisie, cf. explication
// fournie séparément dans la réponse) : /iPhone|iPod/ couvre le cas
// classique, /iPad/ couvre un iPad avec l'ancien user agent "mobile", et le
// repli Macintosh + écran tactile couvre iPadOS 13+ qui envoie désormais un
// user agent de bureau ("Macintosh") - la seule façon fiable de le
// distinguer d'un vrai Mac (qui n'a jamais d'écran tactile) est
// navigator.maxTouchPoints.
function detecterIOS() {
  const ua = window.navigator.userAgent || '';
  const estIPhoneOuIPod = /iPhone|iPod/.test(ua);
  const estIPadClassique = /iPad/.test(ua);
  const estIPadOS13Plus = ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1;
  return estIPhoneOuIPod || estIPadClassique || estIPadOS13Plus;
}

export default function InstallPwaModal() {
  // Initialiseurs paresseux (fonction passée à useState) : ces valeurs ne
  // dépendent que de l'état du navigateur au moment du montage et ne
  // changent jamais ensuite - les calculer ainsi (au lieu d'un setState
  // synchrone dans un effet) évite un rendu en cascade inutile et respecte
  // la règle react-hooks/set-state-in-effect.
  const [suppression] = useState(() => (
    estStandalone() || estDejaInstalleSelonStorage() || estRecemmentFerme()
  ));
  const [plateformeIOS] = useState(() => detecterIOS());

  const [delaiEcoule, setDelaiEcoule] = useState(false);
  const [evenementInstallation, setEvenementInstallation] = useState(null);
  const [installe, setInstalle] = useState(false);
  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    if (suppression) {
      // Ne programme ni minuteur ni écouteur : la boîte ne doit jamais
      // apparaître dans ce cas, pas même après le délai d'affichage.
      return;
    }

    const minuteur = setTimeout(() => setDelaiEcoule(true), DELAI_AFFICHAGE_MS);

    const gererBeforeInstallPrompt = (evenement) => {
      // Empêche le mini-bandeau natif du navigateur : c'est cette boîte,
      // avec son propre design, qui pilote l'installation.
      evenement.preventDefault();
      setEvenementInstallation(evenement);
    };
    const gererAppInstalled = () => {
      ecrireStorage(CLE_INSTALLE, 'true');
      setInstalle(true);
    };

    window.addEventListener('beforeinstallprompt', gererBeforeInstallPrompt);
    window.addEventListener('appinstalled', gererAppInstalled);

    return () => {
      clearTimeout(minuteur);
      window.removeEventListener('beforeinstallprompt', gererBeforeInstallPrompt);
      window.removeEventListener('appinstalled', gererAppInstalled);
    };
  }, [suppression]);

  // iOS : les instructions manuelles n'ont besoin d'aucun évènement natif.
  // Autres plateformes : n'affiche la boîte QUE si beforeinstallprompt
  // s'est réellement déclenché - sinon le bouton "Installer maintenant" ne
  // ferait rien (navigateur qui ne supporte pas l'installation PWA).
  const visible = !suppression && !installe && !ferme && delaiEcoule
    && (plateformeIOS || Boolean(evenementInstallation));

  const fermerEtReporter = () => {
    ecrireStorage(CLE_FERMETURE, new Date().toISOString());
    setFerme(true);
  };

  const installerMaintenant = async () => {
    if (!evenementInstallation) return;
    evenementInstallation.prompt();
    try {
      await evenementInstallation.userChoice;
    } catch {
      // Ignoré : quel que soit le choix rapporté, on referme la boîte
      // ci-dessous - un 'appinstalled' réel (s'il suit) mémorisera de toute
      // façon l'installation réussie indépendamment de ce résultat.
    }
    setEvenementInstallation(null);
    fermerEtReporter();
  };

  if (!visible) return null;

  return (
    // z-[60] : strictement au-dessus de GlobalBanners (z-50, cf. VentesEnAttenteBanner
    // notamment) - sinon, à z-index égal, l'ordre du DOM ferait passer la
    // bannière sticky par-dessus le fond assombri de ce modal plutôt que
    // d'être couverte par lui.
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={fermerEtReporter}
          aria-label="Fermer"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
          <img src="/pwa-192x192.png" alt="Icône IwiShop" className="h-16 w-16 rounded-2xl shadow-sm" />
          <h2 className="text-lg font-bold text-slate-900">Installer IwiShop</h2>
          <p className="text-sm text-slate-600">
            Installez IwiShop sur votre écran d'accueil pour y accéder plus vite et fiabiliser l'enregistrement de vos ventes hors connexion.
          </p>
        </div>

        {plateformeIOS ? (
          <div className="space-y-4 px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">1</span>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Share className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span>Appuyez sur <strong>Partager</strong>, en bas de Safari.</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">2</span>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <SquarePlus className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span>Choisissez <strong>Sur l'écran d'accueil</strong>.</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            <button
              type="button"
              onClick={installerMaintenant}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" /> Installer maintenant
            </button>
          </div>
        )}

        <div className="border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={fermerEtReporter}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          >
            {plateformeIOS ? 'Compris' : 'Plus tard'}
          </button>
        </div>
      </div>
    </div>
  );
}
