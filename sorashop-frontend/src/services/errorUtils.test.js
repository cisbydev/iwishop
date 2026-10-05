import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alerterErreur,
  estAbonnementExpire,
  EVENEMENT_ABONNEMENT_EXPIRE,
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

  it('toute autre erreur : alert() avec le message ou le texte de secours', () => {
    alerterErreur(erreurHttp(400, { quantite: ['Stock insuffisant.'] }), 'Erreur.');
    alerterErreur(erreurHttp(500, undefined), 'Erreur lors de la vente.');

    expect(window.alert).toHaveBeenNthCalledWith(1, 'quantite : Stock insuffisant.');
    expect(window.alert).toHaveBeenNthCalledWith(2, 'Erreur lors de la vente.');
    expect(recus).toEqual([]);
  });
});
