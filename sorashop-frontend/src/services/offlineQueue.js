import { openDB } from 'idb';

// PWA Niveau 2 : file d'attente locale des ventes créées hors ligne.
// IMPORTANT (sécurité) : cette base ne contient JAMAIS de token, de mot de
// passe, ni aucune donnée d'authentification - uniquement les données de la
// vente elle-même (produits, quantités, prix, montants), telles qu'envoyées
// normalement à POST /api/ventes/. L'access token reste en mémoire du
// module services/api.js, jamais persisté ici ni ailleurs.
const NOM_BASE = 'sorashop-offline';
const VERSION_BASE = 1;
const NOM_STORE = 'ventes_en_attente';

export const STATUT_EN_ATTENTE = 'EN_ATTENTE';
export const STATUT_ECHEC_AUTH = 'ECHEC_AUTH';
export const STATUT_ECHEC_AUTRE = 'ECHEC_AUTRE';

// Évènement DOM déclenché à chaque mutation de la file d'attente (ajout,
// suppression, changement de statut) - permet à un composant d'interface
// (cf. VentesEnAttenteBanner) de se mettre à jour sans sondage agressif ni
// prop drilling, sans dépendre d'une librairie de gestion d'état.
export const EVENEMENT_FILE_ATTENTE_MODIFIEE = 'sorashop:file-attente-ventes-modifiee';

function notifierChangement() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENEMENT_FILE_ATTENTE_MODIFIEE));
  }
}

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(NOM_BASE, VERSION_BASE, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(NOM_STORE)) {
          db.createObjectStore(NOM_STORE, { keyPath: 'cle_idempotence' });
        }
      },
    });
  }
  return dbPromise;
}

// payload : exactement les données de vente telles qu'envoyées à l'API en
// temps normal (remise, montant_paye, mode_paiement, lignes...) - jamais
// enrichi ici avec des informations d'authentification.
export async function ajouterVenteEnAttente(payload) {
  const db = await getDb();
  const entree = {
    cle_idempotence: crypto.randomUUID(),
    payload,
    horodatage_client: new Date().toISOString(),
    statut: STATUT_EN_ATTENTE,
    tentatives: 0,
  };
  await db.add(NOM_STORE, entree);
  notifierChangement();
  return entree;
}

export async function listerVentesEnAttente() {
  const db = await getDb();
  return db.getAll(NOM_STORE);
}

export async function supprimerVenteEnAttente(cle_idempotence) {
  const db = await getDb();
  await db.delete(NOM_STORE, cle_idempotence);
  notifierChangement();
}

// incrementerTentatives est un détail interne utilisé par syncEngine lors
// d'un échec réseau (la vente reste EN_ATTENTE mais on trace le nombre
// d'essais) - la signature de base marquerStatut(cle_idempotence, statut)
// reste celle attendue par tout appelant qui n'a pas besoin de ce détail.
export async function marquerStatut(cle_idempotence, statut, { incrementerTentatives = false } = {}) {
  const db = await getDb();
  const entree = await db.get(NOM_STORE, cle_idempotence);
  if (!entree) return;
  entree.statut = statut;
  if (incrementerTentatives) {
    entree.tentatives = (entree.tentatives || 0) + 1;
  }
  await db.put(NOM_STORE, entree);
  notifierChangement();
}
