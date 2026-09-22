import { afterEach, describe, expect, it } from 'vitest';
import { getBoutiqueActiveId, setBoutiqueActiveId } from './boutiqueActiveState';

describe('boutiqueActiveState', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renvoie null tant que rien n’a été stocké', () => {
    expect(getBoutiqueActiveId()).toBeNull();
  });

  it('persiste l’id choisi et le relit sous forme de chaîne', () => {
    setBoutiqueActiveId(2);

    expect(getBoutiqueActiveId()).toBe('2');
    expect(localStorage.getItem('boutique_active_id')).toBe('2');
  });

  it('efface la valeur stockée quand on passe null', () => {
    setBoutiqueActiveId(2);
    setBoutiqueActiveId(null);

    expect(getBoutiqueActiveId()).toBeNull();
  });
});
