import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate } from './formatters';

const normalizeSpaces = (value) => value.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('affiche zéro sans décimale inutile', () => {
    expect(normalizeSpaces(formatCurrency(0))).toBe('0 FCFA');
  });

  it('ajoute des séparateurs de milliers', () => {
    expect(normalizeSpaces(formatCurrency(1000))).toBe('1 000 FCFA');
    expect(normalizeSpaces(formatCurrency(1500000))).toBe('1 500 000 FCFA');
  });

  it('gère les valeurs absentes', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });
});

describe('formatDate', () => {
  it('affiche une date utilisateur au format français', () => {
    expect(formatDate('2026-01-09')).toBe('09/01/2026');
  });

  it('gère une date invalide', () => {
    expect(formatDate('date-invalide')).toBe('—');
  });
});
