import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// fake-indexeddb fournit une vraie implémentation IndexedDB en mémoire
// (jsdom n'en fournit aucune) : ces tests exercent donc le comportement réel
// du store, pas un mock de complaisance.
//
// offlineQueue.js mémorise sa connexion IndexedDB au niveau du module
// (getDb() ne rouvre pas la base à chaque appel) : pour garantir une base
// vierge à chaque test, on remplace `indexedDB` par une instance neuve ET on
// force un rechargement du module (vi.resetModules + import dynamique),
// sinon la connexion mémorisée du test précédent resterait active.
let offlineQueue;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
  offlineQueue = await import('./offlineQueue');
});

const payloadExemple = {
  remise: 0,
  montant_paye: 500,
  mode_paiement: 'ESPECES',
  lignes: [{ produit: 1, unite: 1, quantite: 5, prix_applique: 100 }],
};

describe('offlineQueue', () => {
  it('ajoute une vente en attente avec les champs attendus', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);

    expect(entree.cle_idempotence).toBeTruthy();
    expect(entree.payload).toEqual(payloadExemple);
    expect(entree.statut).toBe(offlineQueue.STATUT_EN_ATTENTE);
    expect(entree.tentatives).toBe(0);
    expect(typeof entree.horodatage_client).toBe('string');
  });

  it('liste les ventes ajoutées', async () => {
    await offlineQueue.ajouterVenteEnAttente(payloadExemple);
    await offlineQueue.ajouterVenteEnAttente({ ...payloadExemple, montant_paye: 200 });

    const liste = await offlineQueue.listerVentesEnAttente();

    expect(liste).toHaveLength(2);
  });

  it('supprime une vente par sa clé d’idempotence', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);

    await offlineQueue.supprimerVenteEnAttente(entree.cle_idempotence);

    expect(await offlineQueue.listerVentesEnAttente()).toHaveLength(0);
  });

  it('change le statut d’une vente existante', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);

    await offlineQueue.marquerStatut(entree.cle_idempotence, offlineQueue.STATUT_ECHEC_AUTH);

    const [miseAJour] = await offlineQueue.listerVentesEnAttente();
    expect(miseAJour.statut).toBe(offlineQueue.STATUT_ECHEC_AUTH);
  });

  it('incrémente le compteur de tentatives sans perdre le statut', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);

    await offlineQueue.marquerStatut(entree.cle_idempotence, offlineQueue.STATUT_EN_ATTENTE, { incrementerTentatives: true });
    await offlineQueue.marquerStatut(entree.cle_idempotence, offlineQueue.STATUT_EN_ATTENTE, { incrementerTentatives: true });

    const [miseAJour] = await offlineQueue.listerVentesEnAttente();
    expect(miseAJour.tentatives).toBe(2);
    expect(miseAJour.statut).toBe(offlineQueue.STATUT_EN_ATTENTE);
  });

  it('ne contient jamais de champ lié à l’authentification (mot de passe, token)', async () => {
    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);

    const texteSerialise = JSON.stringify(entree).toLowerCase();
    expect(texteSerialise).not.toContain('password');
    expect(texteSerialise).not.toContain('"token"');
    expect(texteSerialise).not.toContain('mot_de_passe');
  });

  it('déclenche un évènement DOM à chaque mutation', async () => {
    const evenements = [];
    const ecouteur = () => evenements.push(true);
    window.addEventListener(offlineQueue.EVENEMENT_FILE_ATTENTE_MODIFIEE, ecouteur);

    const entree = await offlineQueue.ajouterVenteEnAttente(payloadExemple);
    await offlineQueue.marquerStatut(entree.cle_idempotence, offlineQueue.STATUT_ECHEC_AUTH);
    await offlineQueue.supprimerVenteEnAttente(entree.cle_idempotence);

    window.removeEventListener(offlineQueue.EVENEMENT_FILE_ATTENTE_MODIFIEE, ecouteur);
    expect(evenements).toHaveLength(3);
  });
});
