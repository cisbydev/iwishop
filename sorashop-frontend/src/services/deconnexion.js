import { listerVentesEnAttente } from './offlineQueue';
import { synchroniserVentesEnAttente } from './syncEngine';
import { effacerCatalogues } from './catalogueCache';
import { definirContexteSession } from './contexteSession';
import { setBoutiqueActiveId } from './boutiqueActiveState';

export const MESSAGE_DECONNEXION_SANS_RESEAU =
  'Pas de connexion : impossible de vous déconnecter en sécurité. Réessayez quand le réseau revient.';
export const MESSAGE_DECONNEXION_SERVEUR_EN_ERREUR =
  'Le serveur ne répond pas correctement. Réessayez dans un instant.';

// Déconnexion volontaire (bouton de l'en-tête et du panneau de navigation).
// Sans réponse de token/logout/, ou sur un 5xx, le cookie de
// rafraîchissement est peut-être encore valable : AuthContext.logout
// refuse, la session reste ouverte et rien n'est effacé (décidé par
// Mahamadou le 2026-10-16, affiné le 2026-10-19).
export async function deconnexionVolontaire({ logout, quitterVueSupport }) {
  if (!(await confirmerDeconnexion())) return false;
  try {
    await logout();
  } catch (err) {
    console.error('Déconnexion refusée :', err);
    window.alert(
      err?.response?.status >= 500 ? MESSAGE_DECONNEXION_SERVEUR_EN_ERREUR : MESSAGE_DECONNEXION_SANS_RESEAU
    );
    return false;
  }
  quitterVueSupport();
  return true;
}

// Déconnexion volontaire (isolation hors ligne, plan validé le 2026-10-16).
// Hors ligne : refus immédiat, sans l'avertissement des ventes (l'échec de
// token/logout/ reste contrôlé ensuite, navigator.onLine peut être vrai à
// tort). Les ventes non envoyées ne sont jamais effacées : on tente d'abord
// de les envoyer ; s'il en reste (autre compte, vente sans marque, refus du
// serveur), la personne est prévenue avant de partir.
export async function confirmerDeconnexion() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.alert(MESSAGE_DECONNEXION_SANS_RESEAU);
    return false;
  }
  try {
    await synchroniserVentesEnAttente();
  } catch (err) {
    console.error('Erreur synchronisation avant déconnexion :', err);
  }

  let restantes;
  try {
    restantes = (await listerVentesEnAttente()).length;
  } catch (err) {
    console.error("Erreur lecture file d'attente avant déconnexion :", err);
    return window.confirm(
      "Impossible de vérifier s'il reste des ventes non envoyées sur cet appareil. Se déconnecter quand même ?"
    );
  }
  if (restantes === 0) return true;

  const ventes = restantes > 1 ? `${restantes} ventes non envoyées restent` : '1 vente non envoyée reste';
  return window.confirm(
    `${ventes} sur cet appareil. Elles ne seront pas effacées et partiront à la prochaine connexion `
    + 'du compte qui les a faites. Se déconnecter quand même ?'
  );
}

// Appelée par AuthContext.logout (déconnexion volontaire seulement, jamais
// sur une session expirée) : catalogue hors ligne, boutique active et
// contexte de session effacés. Jamais la file des ventes.
export async function effacerDonneesDeSession() {
  definirContexteSession(null);
  setBoutiqueActiveId(null);
  try {
    await effacerCatalogues();
  } catch (err) {
    console.error('Erreur effacement du catalogue hors ligne :', err);
  }
}
