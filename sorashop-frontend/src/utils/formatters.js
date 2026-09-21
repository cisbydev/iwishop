const EMPTY_VALUE = '—';

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toValidDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? date
      : null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(value, currency = 'FCFA') {
  const amount = toFiniteNumber(value);
  if (amount === null) return EMPTY_VALUE;

  const formattedAmount = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formattedAmount} ${currency?.trim() || 'FCFA'}`;
}

export function formatDate(value) {
  const date = toValidDate(value);
  if (!date) return EMPTY_VALUE;

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value) {
  const date = toValidDate(value);
  if (!date) return EMPTY_VALUE;

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateRelative(value) {
  const date = toValidDate(value);
  if (!date) return EMPTY_VALUE;

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;

  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;

  const diffJ = Math.round(diffH / 24);
  if (diffJ < 30) return `il y a ${diffJ} j`;

  const diffMois = Math.round(diffJ / 30);
  if (diffMois < 12) return `il y a ${diffMois} mois`;

  const diffAn = Math.round(diffMois / 12);
  return `il y a ${diffAn} an${diffAn > 1 ? 's' : ''}`;
}

export function couleurBadgeDette(plusAncienneDette) {
  const date = toValidDate(plusAncienneDette);
  // Pas de date connue : ne devrait pas arriver pour un client avec une
  // dette réelle, mais mieux vaut alerter (rouge) que sous-alerter en
  // silence si l'API renvoie un jour un cas incomplet.
  if (!date) return 'bg-red-100 text-red-800';

  const jours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (jours < 7) return 'bg-green-100 text-green-800';
  if (jours <= 30) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}
