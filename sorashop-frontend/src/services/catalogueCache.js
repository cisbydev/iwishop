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
// Un seul catalogue est jamais conservé (le plus récent) - clé fixe plutôt
// qu'un keyPath, ce store n'ayant besoin que d'une seule entrée.
const CLE_UNIQUE = 'catalogue';

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
export async function sauvegarderCatalogue({ produits, prix, unites }) {
  const db = await getDb();
  await db.put(
    NOM_STORE,
    { produits, prix, unites, derniere_maj: new Date().toISOString() },
    CLE_UNIQUE
  );
}

// Retourne null si aucun catalogue n'a jamais été mis en cache avec succès
// (ex: tout premier lancement de l'app sans avoir jamais été en ligne).
export async function chargerCatalogueCache() {
  const db = await getDb();
  const entree = await db.get(NOM_STORE, CLE_UNIQUE);
  return entree ?? null;
}
