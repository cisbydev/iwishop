import { listerVentesEnAttente } from './offlineQueue';
import { synchroniserVentesEnAttente } from './syncEngine';
import { effacerCatalogues } from './catalogueCache';
import { definirContexteSession } from './contexteSession';
import { setBoutiqueActiveId } from './boutiqueActiveState';

// Déconnexion volontaire (isolation hors ligne, plan validé le 2026-10-16).
// Les ventes non envoyées ne sont jamais effacées : en ligne, on tente
// d'abord de les envoyer ; s'il en reste (hors ligne, autre compte, vente
// sans marque, refus du serveur), la personne est prévenue avant de partir.
export async function confirmerDeconnexion() {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      await synchroniserVentesEnAttente();
    } catch (err) {
      console.error('Erreur synchronisation avant déconnexion :', err);
    }
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
