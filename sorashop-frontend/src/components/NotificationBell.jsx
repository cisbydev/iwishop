import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Clock, Package } from 'lucide-react';
import { compterNonLues, listerNotifications, marquerLue } from '../services/notifications';
import { formatDateRelative } from '../utils/formatters';

// Filet de sécurité par sondage périodique - pas de WebSocket à ce stade,
// une notification (stock bas / dette en retard) n'est pas assez urgente
// pour justifier la complexité d'un canal temps réel.
const INTERVALLE_SONDAGE_MS = 60000;
const LIMITE_AFFICHEE = 20;

const ICONES_PAR_TYPE = {
  stock_bas: Package,
  dette_retard: Clock,
};

export default function NotificationBell() {
  const [ouvert, setOuvert] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [chargement, setChargement] = useState(false);
  const conteneurRef = useRef(null);

  const rafraichirCompteur = useCallback(async () => {
    try {
      const count = await compterNonLues();
      setNonLues(count);
    } catch (err) {
      console.error('Erreur lecture du nombre de notifications non lues :', err);
    }
  }, []);

  useEffect(() => {
    compterNonLues().then(setNonLues).catch((err) => {
      console.error('Erreur lecture du nombre de notifications non lues :', err);
    });

    const intervalle = setInterval(rafraichirCompteur, INTERVALLE_SONDAGE_MS);
    return () => clearInterval(intervalle);
  }, [rafraichirCompteur]);

  useEffect(() => {
    if (!ouvert) return undefined;

    const handleClicExterieur = (event) => {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target)) {
        setOuvert(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOuvert(false);
    };

    document.addEventListener('mousedown', handleClicExterieur);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClicExterieur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [ouvert]);

  const handleClicCloche = async () => {
    const etaitOuvert = ouvert;
    setOuvert(!etaitOuvert);
    if (etaitOuvert) return;

    setChargement(true);
    try {
      const liste = await listerNotifications();
      setNotifications(liste.slice(0, LIMITE_AFFICHEE));
    } catch (err) {
      console.error('Erreur lecture des notifications :', err);
    } finally {
      setChargement(false);
    }
  };

  const handleClicNotification = async (notification) => {
    if (notification.lue) return;
    try {
      await marquerLue(notification.id);
      setNotifications((liste) =>
        liste.map((n) => (n.id === notification.id ? { ...n, lue: true } : n))
      );
      setNonLues((valeur) => Math.max(0, valeur - 1));
    } catch (err) {
      console.error('Erreur lors du marquage de la notification comme lue :', err);
    }
  };

  return (
    <div className="relative shrink-0" ref={conteneurRef}>
      <button
        type="button"
        onClick={handleClicCloche}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label="Notifications"
        title="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {nonLues > 0 && (
          <span
            data-testid="notification-bell-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
          >
            {nonLues > 99 ? '99+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {chargement && <p className="px-4 py-6 text-center text-sm text-slate-500">Chargement…</p>}
            {!chargement && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Aucune notification.</p>
            )}
            {!chargement &&
              notifications.map((notification) => {
                const Icone = ICONES_PAR_TYPE[notification.type_notification] || Bell;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleClicNotification(notification)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      notification.lue ? 'opacity-50' : ''
                    }`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-800">{notification.message}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {formatDateRelative(notification.date_creation)}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
