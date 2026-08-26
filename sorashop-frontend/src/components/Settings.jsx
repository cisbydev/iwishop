import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { useSettings } from '../context/SettingsContext';
import Account from './Account';
import Employees from './Employees';
import AccesSupportHistorique from './AccesSupportHistorique';
import UnitesVente from './UnitesVente';
import { Store, Save, Upload, KeyRound, Users, ShieldCheck, Ruler } from 'lucide-react';
import logoParDefaut from '../assets/iwishop-logo-removebg-preview.png';

// Déduit l'URL de base du serveur (sans le "/api/") pour construire l'URL complète du logo
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/';
const SERVER_BASE_URL = API_URL.replace(/api\/?$/, '');

function resoudreUrlLogo(logo) {
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  return `${SERVER_BASE_URL}${logo.startsWith('/') ? logo.slice(1) : logo}`;
}

function BoutiqueSettings() {
  const { refetchParametres } = useSettings();
  const [form, setForm] = useState({
    nom_boutique: '',
    adresse: '',
    telephone: '',
    devise: 'FCFA',
    tva: '0.00',
  });
  const [logoActuel, setLogoActuel] = useState(null);
  const [nouveauLogo, setNouveauLogo] = useState(null);
  const [apercuNouveauLogo, setApercuNouveauLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const updateForm = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

  const fetchParametres = async () => {
    try {
      const response = await api.get('parametres/');
      const data = response.data;
      setForm({
        nom_boutique: data.nom_boutique || '',
        adresse: data.adresse || '',
        telephone: data.telephone || '',
        devise: data.devise || 'FCFA',
        tva: data.tva ?? '0.00',
      });
      setLogoActuel(data.logo);
      setLoading(false);
    } catch (err) {
      console.error("Erreur chargement paramètres", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParametres();
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNouveauLogo(file);
    setApercuNouveauLogo(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData();
    formData.append('nom_boutique', form.nom_boutique);
    formData.append('adresse', form.adresse || '');
    formData.append('telephone', form.telephone || '');
    formData.append('devise', form.devise);
    formData.append('tva', form.tva);
    if (nouveauLogo) {
      formData.append('logo', nouveauLogo);
    }

    try {
      // On laisse le navigateur définir lui-même le Content-Type multipart avec sa "boundary"
      await api.patch('parametres/', formData, {
        headers: { 'Content-Type': undefined },
      });
      setSuccessMessage("Paramètres enregistrés avec succès !");
      setNouveauLogo(null);
      setApercuNouveauLogo(null);
      fetchParametres();
      refetchParametres(); // Met à jour l'en-tête (nom + logo) partout dans l'app
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors de l'enregistrement des paramètres."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement des paramètres...</div>;

  const logoAffiche = apercuNouveauLogo || resoudreUrlLogo(logoActuel) || logoParDefaut;

  return (
    <div className="max-w-2xl">
      {successMessage && (
        <div className="p-4 mb-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-5">
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Logo de la boutique</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-white flex items-center justify-center border border-gray-200">
              <img src={logoAffiche} alt="Logo boutique" className="w-4/5 h-4/5 object-contain" />
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer text-sm">
              <Upload className="w-4 h-4" /> Choisir une image
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Nom de la boutique</label>
          <input
            type="text"
            value={form.nom_boutique}
            onChange={(e) => updateForm('nom_boutique', e.target.value)}
            className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Adresse</label>
          <textarea
            value={form.adresse}
            onChange={(e) => updateForm('adresse', e.target.value)}
            className="mt-1 w-full p-2 border rounded-md"
            rows="2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Téléphone</label>
          <input
            type="text"
            value={form.telephone}
            onChange={(e) => updateForm('telephone', e.target.value)}
            className="mt-1 w-full p-2 border rounded-md"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Devise</label>
            <input
              type="text"
              value={form.devise}
              onChange={(e) => updateForm('devise', e.target.value)}
              placeholder="Ex: FCFA, EUR, USD..."
              className="mt-1 w-full p-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">TVA (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.tva}
              onChange={(e) => updateForm('tva', e.target.value)}
              className="mt-1 w-full p-2 border rounded-md"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-blue-300"
        >
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </button>
      </form>
    </div>
  );
}

export default function Settings() {
  const { utilisateur } = useSettings();
  const estProprietaire = utilisateur?.est_proprietaire;
  const [sousOnglet, setSousOnglet] = useState('boutique');

  const boutonClasse = (val) =>
    `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
      sousOnglet === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Paramètres</h2>

      <div className="flex flex-wrap gap-3">
        <button className={boutonClasse('boutique')} onClick={() => setSousOnglet('boutique')}>
          <Store className="w-4 h-4" /> Boutique
        </button>
        <button className={boutonClasse('compte')} onClick={() => setSousOnglet('compte')}>
          <KeyRound className="w-4 h-4" /> Mon Compte
        </button>
        {estProprietaire && (
          <button className={boutonClasse('employes')} onClick={() => setSousOnglet('employes')}>
            <Users className="w-4 h-4" /> Employés
          </button>
        )}
        <button className={boutonClasse('unites-vente')} onClick={() => setSousOnglet('unites-vente')}>
          <Ruler className="w-4 h-4" /> Unités de vente
        </button>
        <button className={boutonClasse('acces-support')} onClick={() => setSousOnglet('acces-support')}>
          <ShieldCheck className="w-4 h-4" /> Accès Support
        </button>
      </div>

      {sousOnglet === 'boutique' && <BoutiqueSettings />}
      {sousOnglet === 'compte' && <Account />}
      {sousOnglet === 'employes' && estProprietaire && <Employees />}
      {sousOnglet === 'unites-vente' && <UnitesVente />}
      {sousOnglet === 'acces-support' && <AccesSupportHistorique />}
    </div>
  );
}
