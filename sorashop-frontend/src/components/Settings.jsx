import { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { useSettings } from '../context/settingsContextValue';
import Account from './Account';
import Employees from './Employees';
import AccesSupportHistorique from './AccesSupportHistorique';
import UnitesVente from './UnitesVente';
import MonAbonnement from './MonAbonnement';
import { Store, Save, Upload, KeyRound, Users, ShieldCheck, Ruler, CreditCard } from 'lucide-react';

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
  const [logoInaccessible, setLogoInaccessible] = useState(null);
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
    const loadParametres = async () => {
      await fetchParametres();
    };

    void loadParametres();
  }, []);

  const logoAffiche = apercuNouveauLogo || resoudreUrlLogo(logoActuel);
  const logoIndisponible = logoAffiche === logoInaccessible;

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

  return (
    <div className="mx-auto w-full max-w-[60rem]">
      {successMessage && (
        <div className="p-4 mb-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Informations de la boutique</h3>
          <p className="mt-1 text-sm text-slate-500">Personnalisez les informations utilisées dans votre espace de gestion.</p>
        </div>

        {/* Logo */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <label className="mb-3 block text-sm font-medium text-slate-700">Logo de la boutique</label>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white px-2 sm:w-48 sm:shrink-0">
              {logoAffiche && !logoIndisponible ? (
                <img
                  src={logoAffiche}
                  alt="Logo de la boutique"
                  className="h-full max-w-full object-contain"
                  onError={() => setLogoInaccessible(logoAffiche)}
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-400">
                  <Store className="h-6 w-6 text-blue-400" aria-hidden="true" />
                  <span className="text-xs">Aucun logo</span>
                </div>
              )}
            </div>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto">
              <Upload className="h-4 w-4" /> Choisir une image
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Nom de la boutique</label>
          <input
            type="text"
            value={form.nom_boutique}
            onChange={(e) => updateForm('nom_boutique', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Adresse</label>
          <textarea
            value={form.adresse}
            onChange={(e) => updateForm('adresse', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            rows="2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Téléphone</label>
          <input
            type="text"
            value={form.telephone}
            onChange={(e) => updateForm('telephone', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Devise</label>
            <input
              type="text"
              value={form.devise}
              onChange={(e) => updateForm('devise', e.target.value)}
              placeholder="Ex: FCFA, EUR, USD..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">TVA (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.tva}
              onChange={(e) => updateForm('tva', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          <Save className="h-4 w-4" /> {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
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
    `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
      sousOnglet === val ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <div className="space-y-6 min-[1366px]:-mx-3">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Paramètres</h2>
        <p className="mt-2 text-sm text-slate-600">Configurez votre boutique, votre compte et les préférences de gestion.</p>
      </section>

      <nav aria-label="Sous-navigation des paramètres" className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap sm:justify-between">
        <button aria-pressed={sousOnglet === 'boutique'} className={boutonClasse('boutique')} onClick={() => setSousOnglet('boutique')}>
          <Store className="w-4 h-4" /> Boutique
        </button>
        <button aria-pressed={sousOnglet === 'compte'} className={boutonClasse('compte')} onClick={() => setSousOnglet('compte')}>
          <KeyRound className="w-4 h-4" /> Mon Compte
        </button>
        {estProprietaire && (
          <button aria-pressed={sousOnglet === 'employes'} className={boutonClasse('employes')} onClick={() => setSousOnglet('employes')}>
            <Users className="w-4 h-4" /> Employés
          </button>
        )}
        <button aria-pressed={sousOnglet === 'unites-vente'} className={boutonClasse('unites-vente')} onClick={() => setSousOnglet('unites-vente')}>
          <Ruler className="w-4 h-4" /> Unités de vente
        </button>
        <button aria-pressed={sousOnglet === 'acces-support'} className={boutonClasse('acces-support')} onClick={() => setSousOnglet('acces-support')}>
          <ShieldCheck className="w-4 h-4" /> Accès Support
        </button>
        <button aria-pressed={sousOnglet === 'abonnement'} className={boutonClasse('abonnement')} onClick={() => setSousOnglet('abonnement')}>
          <CreditCard className="w-4 h-4" /> Mon Abonnement
        </button>
          </div>
        </div>
      </nav>

      {sousOnglet === 'boutique' && <BoutiqueSettings />}
      {sousOnglet === 'compte' && <Account />}
      {sousOnglet === 'employes' && estProprietaire && <Employees />}
      {sousOnglet === 'unites-vente' && <UnitesVente />}
      {sousOnglet === 'acces-support' && <AccesSupportHistorique />}
      {sousOnglet === 'abonnement' && <MonAbonnement />}
    </div>
  );
}
