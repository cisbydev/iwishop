import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { DollarSign, ShoppingBag, Wallet, TrendingUp, TrendingDown, Printer } from 'lucide-react';

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function getPlagePeriode(periode) {
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

  return { debut: formatDate(debut), fin: formatDate(fin) };
}

export default function Reports() {
  const { parametres } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const [periode, setPeriode] = useState('mois');
  const [dateDebut, setDateDebut] = useState(getPlagePeriode('mois').debut);
  const [dateFin, setDateFin] = useState(getPlagePeriode('mois').fin);
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchResume = async (debut, fin) => {
    setLoading(true);
    try {
      const response = await api.get(`reports/resume-financier/?date_debut=${debut}&date_fin=${fin}`);
      setResume(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement rapport", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResume(dateDebut, dateFin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodeRapide = (nouvellePeriode) => {
    setPeriode(nouvellePeriode);
    const { debut, fin } = getPlagePeriode(nouvellePeriode);
    setDateDebut(debut);
    setDateFin(fin);
    fetchResume(debut, fin);
  };

  const handlePeriodePersonnalisee = () => {
    setPeriode('personnalise');
    fetchResume(dateDebut, dateFin);
  };

  const boutonClasse = (p) =>
    `px-4 py-2 rounded-md text-sm font-medium transition ${
      periode === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 print:hidden">
        <h2 className="text-2xl font-bold text-gray-800">Rapports</h2>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" /> Imprimer
        </button>
      </div>

      {/* Sélecteur de période */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-wrap items-center gap-3 print:hidden">
        <button className={boutonClasse('jour')} onClick={() => handlePeriodeRapide('jour')}>Aujourd'hui</button>
        <button className={boutonClasse('mois')} onClick={() => handlePeriodeRapide('mois')}>Ce mois</button>
        <button className={boutonClasse('annee')} onClick={() => handlePeriodeRapide('annee')}>Cette année</button>

        <div className="flex items-center gap-2 ml-0 sm:ml-4">
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="p-2 border rounded-md text-sm"
          />
          <span className="text-gray-400 text-sm">à</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="p-2 border rounded-md text-sm"
          />
          <button
            onClick={handlePeriodePersonnalisee}
            className={boutonClasse('personnalise')}
          >
            Appliquer
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Période affichée : <span className="font-medium text-gray-700">{dateDebut}</span> au{' '}
        <span className="font-medium text-gray-700">{dateFin}</span>
      </p>

      {loading ? (
        <div className="p-6 text-center text-gray-600">Chargement du rapport...</div>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Chiffre d'Affaires</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{resume?.chiffre_affaires} {devise}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_ventes} vente(s)</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Achats</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{resume?.total_achats} {devise}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_achats} achat(s)</p>
              </div>
              <div className="p-3 bg-orange-50 text-orange-600 rounded-full">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Dépenses</p>
                <h3 className="text-2xl font-bold text-gray-800 mt-1">{resume?.total_depenses} {devise}</h3>
                <p className="text-xs text-gray-400 mt-1">{resume?.nombre_depenses} dépense(s)</p>
              </div>
              <div className="p-3 bg-red-50 text-red-600 rounded-full">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Bénéfices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Bénéfice Brut</p>
                <p className="text-xs text-gray-400">Ventes − Coût des produits vendus</p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">{resume?.benefice_brut} {devise}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Bénéfice Net</p>
                <p className="text-xs text-gray-400">Bénéfice brut − Dépenses</p>
                <h3 className={`text-2xl font-bold mt-1 ${resume?.benefice_net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {resume?.benefice_net} {devise}
                </h3>
              </div>
              <div className={`p-3 rounded-full ${resume?.benefice_net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {resume?.benefice_net >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
