import api from './api';
import {
  listerVentesEnAttente,
  supprimerVenteEnAttente,
  marquerStatut,
  STATUT_EN_ATTENTE,
  STATUT_ECHEC_AUTH,
  STATUT_ECHEC_AUTRE,
} from './offlineQueue';

// Empêche deux synchronisations concurrentes (ex: l'évènement 'online' et un
// clic manuel sur "réessayer maintenant" au même moment) de rejouer deux
// fois la même vente en parallèle avant que la première n'ait eu le temps
// de la supprimer de la file.
let synchronisationEnCours = false;

export async function synchroniserVentesEnAttente() {
  if (synchronisationEnCours) return;
  synchronisationEnCours = true;

  try {
    const ventes = await listerVentesEnAttente();
    const aRejouer = ventes.filter(
      (vente) => vente.statut === STATUT_EN_ATTENTE || vente.statut === STATUT_ECHEC_AUTRE
    );

    for (const vente of aRejouer) {
      try {
        await api.post('ventes/', {
          ...vente.payload,
          cle_idempotence: vente.cle_idempotence,
          horodatage_client: vente.horodatage_client,
          synchronisation_differee: true,
        });
        await supprimerVenteEnAttente(vente.cle_idempotence);
      } catch (error) {
        if (!error.response) {
          // Panne réseau (aucune réponse serveur, y compris un éventuel
          // échec du refresh de token déclenché par l'intercepteur de
          // api.js s'il n'a lui-même pas pu joindre le serveur) : la vente
          // reste EN_ATTENTE, on trace juste la tentative. Elle sera
          // rejouée au prochain déclenchement (retour réseau ou clic
          // manuel) - jamais abandonnée silencieusement.
          await marquerStatut(vente.cle_idempotence, STATUT_EN_ATTENTE, { incrementerTentatives: true });
          continue;
        }

        if (error.response.status === 401) {
          // L'intercepteur de api.js a déjà tenté un refresh silencieux et
          // celui-ci a échoué (sinon cette requête aurait été rejouée avec
          // un nouveau token et ne serait pas arrivée ici en 401) :
          // l'authentification est définitivement invalide pour cette
          // session. On arrête la boucle plutôt que de marteler le serveur
          // avec les ventes suivantes, qui échoueraient identiquement.
          await marquerStatut(vente.cle_idempotence, STATUT_ECHEC_AUTH);
          break;
        }

        // Échec 4xx/5xx inattendu (ex: erreur de validation) : on ne
        // supprime jamais silencieusement une vente en attente, même en
        // échec - elle doit rester visible (statut ECHEC_AUTRE) pour
        // vérification manuelle éventuelle. Les ventes suivantes de la
        // file ne sont pas concernées par cet échec précis : on continue.
        await marquerStatut(vente.cle_idempotence, STATUT_ECHEC_AUTRE);
      }
    }
  } finally {
    synchronisationEnCours = false;
  }
}

let ecouteurReseauDemarre = false;

// À appeler une fois au démarrage de l'application (cf. main.jsx). Idempotent :
// un second appel n'enregistre pas un second écouteur ni ne relance une
// synchronisation immédiate.
export function demarrerSynchronisationAutomatique() {
  if (ecouteurReseauDemarre || typeof window === 'undefined') return;
  ecouteurReseauDemarre = true;

  window.addEventListener('online', () => {
    void synchroniserVentesEnAttente();
  });

  // Couvre le cas où l'app a été fermée hors ligne puis rouverte alors que
  // le réseau est déjà revenu : aucune transition offline->online n'a lieu
  // dans ce cas, l'évènement 'online' seul ne se déclencherait donc jamais.
  // navigator.onLine peut être true à tort sur certains réseaux captifs/
  // proxys, mais l'échec sera alors simplement un échec réseau ordinaire
  // pour synchroniserVentesEnAttente() (vente laissée EN_ATTENTE) - aucun
  // risque de perte ni de comportement incorrect dans ce cas.
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    void synchroniserVentesEnAttente();
  }
}
