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
// marque : contexte de session au moment de la vente (utilisateur et
// boutique, cf. contexteSession.js). Obligatoire : aucune nouvelle vente
// n'entre en file sans marque (isolation hors ligne, 2026-10-16).
export async function ajouterVenteEnAttente(payload, marque) {
  if (!marque) {
    throw new Error('Contexte de session inconnu : vente non mise en file.');
  }
  const db = await getDb();
  const entree = {
    cle_idempotence: crypto.randomUUID(),
    payload,
    horodatage_client: new Date().toISOString(),
    statut: STATUT_EN_ATTENTE,
    tentatives: 0,
    utilisateur_id: marque.utilisateur_id,
    utilisateur_nom: marque.utilisateur_nom,
    boutique_id: marque.boutique_id,
    boutique_nom: marque.boutique_nom,
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

// Envoi confirmé d'une vente sans marque (créée avant le 2026-10-16) :
// elle reçoit la marque du compte qui l'envoie, dans l'entrée et dans le
// payload (le serveur répond 409 si elle ne correspond pas). Refusé pour
// une vente déjà marquée : la vente d'un autre compte n'est jamais
// réattribuée.
export async function marquerVente(cle_idempotence, marque) {
  if (!marque) {
    throw new Error('Contexte de session inconnu : vente non marquée.');
  }
  const db = await getDb();
  const entree = await db.get(NOM_STORE, cle_idempotence);
  if (!entree) return;
  if (entree.utilisateur_id != null || entree.boutique_id != null) {
    throw new Error('Vente déjà marquée : jamais réattribuée.');
  }
  entree.utilisateur_id = marque.utilisateur_id;
  entree.utilisateur_nom = marque.utilisateur_nom;
  entree.boutique_id = marque.boutique_id;
  entree.boutique_nom = marque.boutique_nom;
  entree.payload = {
    ...entree.payload,
    utilisateur_attendu: marque.utilisateur_id,
    boutique_attendue: marque.boutique_id,
  };
  entree.statut = STATUT_EN_ATTENTE;
  await db.put(NOM_STORE, entree);
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
