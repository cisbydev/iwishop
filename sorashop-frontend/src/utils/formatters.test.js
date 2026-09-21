import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, couleurBadgeDette } from './formatters';

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

describe('couleurBadgeDette', () => {
  const ilYA = (jours) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();

  it('vert si la dette la plus ancienne a moins de 7 jours', () => {
    expect(couleurBadgeDette(ilYA(3))).toBe('bg-green-100 text-green-800');
  });

  it('orange entre 7 et 30 jours', () => {
    expect(couleurBadgeDette(ilYA(7))).toBe('bg-orange-100 text-orange-800');
    expect(couleurBadgeDette(ilYA(15))).toBe('bg-orange-100 text-orange-800');
    expect(couleurBadgeDette(ilYA(30))).toBe('bg-orange-100 text-orange-800');
  });

  it('rouge au-delà de 30 jours', () => {
    expect(couleurBadgeDette(ilYA(45))).toBe('bg-red-100 text-red-800');
  });

  it('rouge par défaut si aucune dette (date absente)', () => {
    expect(couleurBadgeDette(null)).toBe('bg-red-100 text-red-800');
    expect(couleurBadgeDette(undefined)).toBe('bg-red-100 text-red-800');
  });
});
