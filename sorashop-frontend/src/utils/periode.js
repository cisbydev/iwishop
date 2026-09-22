// Sélecteur de période rapide (jour/mois/année) - partagé par Reports.jsx
// et SalesHistory.jsx, qui filtrent tous deux leurs données par plage de
// dates avec les mêmes trois raccourcis.
export function formatDateForInput(d) {
  return d.toISOString().split('T')[0];
}

export function getPlagePeriode(periode) {
  const aujourdHui = new Date();
  let debut, fin;

  if (periode === 'jour') {
    debut = new Date(aujourdHui);
    fin = new Date(aujourdHui);
  } else if (periode === 'mois') {
    debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1);
    fin = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + 1, 0);
  } else if (periode === 'annee') {
    debut = new Date(aujourdHui.getFullYear(), 0, 1);
    fin = new Date(aujourdHui.getFullYear(), 11, 31);
  }

  return { debut: formatDateForInput(debut), fin: formatDateForInput(fin) };
}
