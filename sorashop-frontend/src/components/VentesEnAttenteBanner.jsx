import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import {
  listerVentesEnAttente,
  marquerVente,
  EVENEMENT_FILE_ATTENTE_MODIFIEE,
  STATUT_ECHEC_AUTH,
} from '../services/offlineQueue';
import { synchroniserVentesEnAttente } from '../services/syncEngine';
import { chargerCatalogueCache } from '../services/catalogueCache';
import {
  contexteSessionDepuisMe,
  estVenteDuContexte,
  estVenteSansMarque,
} from '../services/contexteSession';
import { useSettings } from '../context/settingsContextValue';
import { formatCurrency, formatDateTime } from '../utils/formatters';

// Intervalle de re-sondage de secours : les mutations de la file (ajout,
// suppression, changement de statut) déclenchent déjà EVENEMENT_FILE_ATTENTE_MODIFIEE
// pour une mise à jour immédiate - ce sondage périodique n'est qu'un filet
// de sécurité (ex: un autre onglet a modifié la même base IndexedDB).
const INTERVALLE_RESONDAGE_MS = 30000;

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Isolation hors ligne (plan validé le 2026-10-16) : trois groupes.
// - Ventes du compte en cours : envoyées par la synchronisation.
// - Ventes d'un autre compte : jamais envoyées d'ici, ni réattribuées.
// - Ventes sans marque (créées avant la mise à jour) : envoyées seulement
//   après la confirmation explicite du vendeur, avec son compte.
export default function VentesEnAttenteBanner() {
  const { parametres, utilisateur } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const contexte = useMemo(() => contexteSessionDepuisMe(utilisateur), [utilisateur]);
  const [ventes, setVentes] = useState([]);
  const [nomsProduits, setNomsProduits] = useState({});
  const [synchronisationEnCours, setSynchronisationEnCours] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(null);

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

  const duCompte = ventes.filter((vente) => estVenteDuContexte(vente, contexte));
  const sansMarque = ventes.filter(estVenteSansMarque);
  const autresComptes = ventes.filter((vente) => !estVenteSansMarque(vente) && !estVenteDuContexte(vente, contexte));
  const groupesAutres = Object.values(autresComptes.reduce((groupes, vente) => {
    const cle = `${vente.utilisateur_id}:${vente.boutique_id}`;
    groupes[cle] = groupes[cle] || { cle, utilisateur_nom: vente.utilisateur_nom, boutique_nom: vente.boutique_nom, nombre: 0 };
    groupes[cle].nombre += 1;
    return groupes;
  }, {}));

  // Noms des produits des ventes sans marque, lus dans le catalogue du
  // compte en cours (sinon « Produit n° id »).
  const aDesVentesSansMarque = sansMarque.length > 0;
  useEffect(() => {
    if (!aDesVentesSansMarque || !contexte) return;
    chargerCatalogueCache(contexte)
      .then((cache) => {
        setNomsProduits(Object.fromEntries((cache?.produits || []).map((p) => [p.id, p.nom])));
      })
      .catch((err) => console.error('Erreur lecture du catalogue hors ligne :', err));
  }, [aDesVentesSansMarque, contexte]);

  if (ventes.length === 0) {
    return null;
  }

  const enEchecAuth = duCompte.some((vente) => vente.statut === STATUT_ECHEC_AUTH);

  const handleSynchroniserMaintenant = async () => {
    setSynchronisationEnCours(true);
    try {
      await synchroniserVentesEnAttente();
    } finally {
      setSynchronisationEnCours(false);
      await rafraichir();
    }
  };

  const envoyerAvecMonCompte = async (vente) => {
    if (envoiEnCours) return;
    const confirme = window.confirm(
      `Envoyer avec mon compte (${contexte.utilisateur_nom}) et ma boutique (${contexte.boutique_nom}) ? `
      + `La vente sera enregistrée comme faite par ${contexte.utilisateur_nom}.`
    );
    if (!confirme) return;
    setEnvoiEnCours(vente.cle_idempotence);
    try {
      await marquerVente(vente.cle_idempotence, contexte);
      await synchroniserVentesEnAttente();
    } catch (err) {
      console.error("Erreur envoi d'une vente sans marque :", err);
    } finally {
      setEnvoiEnCours(null);
      await rafraichir();
    }
  };

  return (
    <div
      data-testid="ventes-en-attente-banner"
      className="space-y-2 bg-amber-500 px-4 py-2 text-white"
    >
      {duCompte.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <CloudOff className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            {pluriel(duCompte.length, 'vente')} en attente de synchronisation.
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
      )}

      {groupesAutres.map((groupe) => (
        <p key={groupe.cle} className="flex items-start gap-2 text-sm font-medium">
          <CloudOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {pluriel(groupe.nombre, 'vente')} en attente du compte {groupe.utilisateur_nom} ({groupe.boutique_nom}) :
            connectez-vous avec ce compte pour {groupe.nombre > 1 ? 'les' : "l'"} envoyer.
          </span>
        </p>
      ))}

      {sansMarque.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {pluriel(sansMarque.length, 'vente')} à vérifier (créées avant la mise à jour)
          </summary>
          <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">
            {sansMarque.map((vente) => (
              <li key={vente.cle_idempotence} className="rounded-md bg-white/15 p-2">
                <p>
                  {formatDateTime(vente.horodatage_client)} · Payé : {formatCurrency(vente.payload?.montant_paye ?? 0, devise)}
                </p>
                <p className="text-xs">
                  {(vente.payload?.lignes || [])
                    .map((ligne) => `${nomsProduits[ligne.produit] || `Produit n° ${ligne.produit}`} × ${ligne.quantite}`)
                    .join(', ')}
                </p>
                {contexte ? (
                  <button
                    type="button"
                    onClick={() => envoyerAvecMonCompte(vente)}
                    disabled={envoiEnCours !== null}
                    className="mt-1 rounded-md bg-white/25 px-2.5 py-1 text-xs font-semibold hover:bg-white/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Envoyer avec mon compte ({contexte.utilisateur_nom}) et ma boutique ({contexte.boutique_nom})
                  </button>
                ) : (
                  <p className="mt-1 text-xs">Connectez-vous à une boutique pour pouvoir l’envoyer.</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
