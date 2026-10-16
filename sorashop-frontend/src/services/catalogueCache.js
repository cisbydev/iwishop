import { openDB } from 'idb';

// PWA Niveau 2 (étape 4) : dernier catalogue de vente connu (produits, prix,
// unités de vente), pour que l'écran Ventes reste utilisable si l'app
// démarre déjà hors ligne - cas où aucun catalogue n'a jamais pu être chargé
// en mémoire (téléphone fermé/redémarré pendant la coupure réseau).
//
// Base IndexedDB séparée de offlineQueue.js (ventes_en_attente) : les deux
// modules ouvrent chacun leur propre connexion, indépendamment l'un de
// l'autre. Les partager exposerait offlineQueue.js (qui n'est volontairement
// pas modifié ici) à un conflit de version IndexedDB dès que ce module
// créerait son propre store dans la même base.
const NOM_BASE = 'sorashop-offline-catalogue';
const VERSION_BASE = 1;
const NOM_STORE = 'catalogue_cache';
// Isolation hors ligne (2026-10-16) : une entrée par couple
// utilisateur-boutique (clé « utilisateur:boutique »), lue seulement pour
// le contexte de session en cours (cf. contexteSession.js). Avant, une
// seule entrée sans marque, sous cette clé : supprimée à la première
// sauvegarde (donnée qui se retélécharge).
const CLE_SANS_MARQUE = 'catalogue';

function cleDu(contexte) {
  return `${contexte.utilisateur_id}:${contexte.boutique_id}`;
}

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(NOM_BASE, VERSION_BASE, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(NOM_STORE)) {
          db.createObjectStore(NOM_STORE);
        }
      },
    });
  }
  return dbPromise;
}

// produits, prix, unites : exactement les 3 tableaux bruts tels que reçus
// par Sales.jsx::fetchCatalogue(), avant toute transformation locale (map
// prixParUnite) - pour ne jamais dupliquer cette logique de transformation.
// contexte : obligatoire, jamais de catalogue sans marque.
export async function sauvegarderCatalogue({ produits, prix, unites }, contexte) {
  if (!contexte) {
    throw new Error('Contexte de session inconnu : catalogue non sauvegardé.');
  }
  const db = await getDb();
  const tx = db.transaction(NOM_STORE, 'readwrite');
  await Promise.all([
    tx.store.put(
      {
        produits,
        prix,
        unites,
        derniere_maj: new Date().toISOString(),
        utilisateur_id: contexte.utilisateur_id,
        boutique_id: contexte.boutique_id,
      },
      cleDu(contexte)
    ),
    tx.store.delete(CLE_SANS_MARQUE),
    tx.done,
  ]);
}

// Retourne null sans contexte, ou si aucun catalogue n'a été sauvegardé
// pour cet utilisateur et cette boutique.
export async function chargerCatalogueCache(contexte) {
  if (!contexte) return null;
  const db = await getDb();
  const entree = await db.get(NOM_STORE, cleDu(contexte));
  return entree ?? null;
}
