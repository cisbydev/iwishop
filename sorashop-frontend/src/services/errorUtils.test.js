import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alerterErreur,
  estAbonnementExpire,
  estPaiementEnLigneInactif,
  EVENEMENT_ABONNEMENT_EXPIRE,
  messageErreur,
} from './errorUtils';

const DETAIL = 'Abonnement expiré. Merci de renouveler votre abonnement.';

function erreurHttp(status, data) {
  return { response: { status, data } };
}

describe('estAbonnementExpire', () => {
  it('reconnaît le refus 403 avec le code ABONNEMENT_EXPIRE', () => {
    expect(estAbonnementExpire(erreurHttp(403, { detail: DETAIL, code: 'ABONNEMENT_EXPIRE' }))).toBe(true);
  });

  it("ne reconnaît ni l'ancien backend (même texte, sans code), ni un autre code, ni un autre statut", () => {
    expect(estAbonnementExpire(erreurHttp(403, { detail: DETAIL }))).toBe(false);
    expect(estAbonnementExpire(erreurHttp(403, { detail: 'Cette boutique a été désactivée.' }))).toBe(false);
    expect(estAbonnementExpire(erreurHttp(403, { detail: DETAIL, code: 'AUTRE' }))).toBe(false);
    expect(estAbonnementExpire(erreurHttp(400, { detail: DETAIL, code: 'ABONNEMENT_EXPIRE' }))).toBe(false);
    expect(estAbonnementExpire(new Error('Network Error'))).toBe(false);
  });
});

describe('estPaiementEnLigneInactif', () => {
  const FERME = 'Paiement en ligne bientôt disponible : contactez-nous pour renouveler.';

  it('reconnaît le refus 503 avec le code PAIEMENT_EN_LIGNE_INACTIF', () => {
    expect(estPaiementEnLigneInactif(erreurHttp(503, { detail: FERME, code: 'PAIEMENT_EN_LIGNE_INACTIF' }))).toBe(true);
  });

  it('ne reconnaît ni un 503 sans ce code (panne, page de Render), ni un autre statut', () => {
    expect(estPaiementEnLigneInactif(erreurHttp(503, '<html>Service Unavailable</html>'))).toBe(false);
    expect(estPaiementEnLigneInactif(erreurHttp(503, { detail: FERME }))).toBe(false);
    expect(estPaiementEnLigneInactif(erreurHttp(403, { detail: FERME, code: 'PAIEMENT_EN_LIGNE_INACTIF' }))).toBe(false);
    expect(estPaiementEnLigneInactif(new Error('Network Error'))).toBe(false);
  });
});

describe('alerterErreur', () => {
  let recus;
  const ecouter = (event) => recus.push(event.type);

  beforeEach(() => {
    recus = [];
    window.addEventListener(EVENEMENT_ABONNEMENT_EXPIRE, ecouter);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener(EVENEMENT_ABONNEMENT_EXPIRE, ecouter);
    vi.restoreAllMocks();
  });

  it("signale le refus ABONNEMENT_EXPIRE, sans alert()", () => {
    alerterErreur(erreurHttp(403, { detail: DETAIL, code: 'ABONNEMENT_EXPIRE' }), 'Erreur.');

    expect(recus).toEqual([EVENEMENT_ABONNEMENT_EXPIRE]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("ancien backend (sans code) : alert() d'avant, aucun signal", () => {
    alerterErreur(erreurHttp(403, { detail: DETAIL }), 'Erreur.');

    expect(window.alert).toHaveBeenCalledWith(DETAIL);
    expect(recus).toEqual([]);
  });

  it("messageErreur, refus ABONNEMENT_EXPIRE : signale et renvoie '' (rien sous le formulaire)", () => {
    expect(messageErreur(erreurHttp(403, { detail: DETAIL, code: 'ABONNEMENT_EXPIRE' }), 'Erreur.')).toBe('');
    expect(recus).toEqual([EVENEMENT_ABONNEMENT_EXPIRE]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("messageErreur, ancien backend ou autre erreur : renvoie le message, sans signal ni alert()", () => {
    expect(messageErreur(erreurHttp(403, { detail: DETAIL }), 'Erreur.')).toBe(DETAIL);
    expect(messageErreur(erreurHttp(400, { montant: ['Trop élevé.'] }), 'Erreur.')).toBe('montant : Trop élevé.');
    expect(messageErreur(erreurHttp(500, undefined), 'Erreur du remboursement.')).toBe('Erreur du remboursement.');
    expect(recus).toEqual([]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('toute autre erreur : alert() avec le message ou le texte de secours', () => {
    alerterErreur(erreurHttp(400, { quantite: ['Stock insuffisant.'] }), 'Erreur.');
    alerterErreur(erreurHttp(500, undefined), 'Erreur lors de la vente.');

    expect(window.alert).toHaveBeenNthCalledWith(1, 'quantite : Stock insuffisant.');
    expect(window.alert).toHaveBeenNthCalledWith(2, 'Erreur lors de la vente.');
    expect(recus).toEqual([]);
  });
});
