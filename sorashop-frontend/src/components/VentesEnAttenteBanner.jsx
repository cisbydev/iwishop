import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import {
  listerVentesEnAttente,
  EVENEMENT_FILE_ATTENTE_MODIFIEE,
  STATUT_ECHEC_AUTH,
} from '../services/offlineQueue';
import { synchroniserVentesEnAttente } from '../services/syncEngine';

// Intervalle de re-sondage de secours : les mutations de la file (ajout,
// suppression, changement de statut) déclenchent déjà EVENEMENT_FILE_ATTENTE_MODIFIEE
// pour une mise à jour immédiate - ce sondage périodique n'est qu'un filet
// de sécurité (ex: un autre onglet a modifié la même base IndexedDB).
const INTERVALLE_RESONDAGE_MS = 30000;

export default function VentesEnAttenteBanner() {
  const [ventes, setVentes] = useState([]);
  const [synchronisationEnCours, setSynchronisationEnCours] = useState(false);

  const rafraichir = useCallback(async () => {
    try {
      const liste = await listerVentesEnAttente();
      setVentes(liste);
    } catch (err) {
      console.error("Erreur lecture file d'attente hors ligne :", err);
    }
  }, []);

  useEffect(() => {
    listerVentesEnAttente().then(setVentes).catch((err) => {
      console.error("Erreur lecture file d'attente hors ligne :", err);
    });

    window.addEventListener(EVENEMENT_FILE_ATTENTE_MODIFIEE, rafraichir);
    window.addEventListener('online', rafraichir);
    const intervalle = setInterval(rafraichir, INTERVALLE_RESONDAGE_MS);

    return () => {
      window.removeEventListener(EVENEMENT_FILE_ATTENTE_MODIFIEE, rafraichir);
      window.removeEventListener('online', rafraichir);
      clearInterval(intervalle);
    };
  }, [rafraichir]);

  if (ventes.length === 0) {
    return null;
  }

  const enEchecAuth = ventes.some((vente) => vente.statut === STATUT_ECHEC_AUTH);

  const handleSynchroniserMaintenant = async () => {
    setSynchronisationEnCours(true);
    try {
      await synchroniserVentesEnAttente();
    } finally {
      setSynchronisationEnCours(false);
      await rafraichir();
    }
  };

  return (
    <div
      data-testid="ventes-en-attente-banner"
      className="bg-amber-500 text-white px-4 py-2 flex flex-wrap items-center gap-2"
    >
      <CloudOff className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium">
        {ventes.length} vente{ventes.length > 1 ? 's' : ''} en attente de synchronisation.
        {enEchecAuth && ' Reconnectez-vous pour reprendre l’envoi.'}
      </span>
      <button
        type="button"
        onClick={handleSynchroniserMaintenant}
        disabled={synchronisationEnCours}
        className="ml-auto flex items-center gap-1.5 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${synchronisationEnCours ? 'animate-spin' : ''}`} />
        {synchronisationEnCours ? 'Synchronisation...' : 'Réessayer maintenant'}
      </button>
    </div>
  );
}
