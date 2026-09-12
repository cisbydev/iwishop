import { useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { useSettings } from '../context/settingsContextValue';
import { useAuth } from '../context/AuthContext';
import { Save, Store } from 'lucide-react';
import PasswordInput from './PasswordInput';

export default function Account() {
  const { utilisateur } = useSettings();
  const { logout } = useAuth();
  const [ancienMotDePasse, setAncienMotDePasse] = useState('');
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (nouveauMotDePasse !== confirmation) {
      alert("Le nouveau mot de passe et sa confirmation ne correspondent pas.");
      return;
    }

    setSaving(true);
    try {
      await api.post('accounts/change-password/', {
        ancien_mot_de_passe: ancienMotDePasse,
        nouveau_mot_de_passe: nouveauMotDePasse,
      });
      // Le changement révoque toutes les sessions ; déconnecter aussi cette
      // session immédiatement évite de laisser un access token devenu invalide
      // en mémoire jusqu'à la prochaine requête.
      await logout();
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors du changement de mot de passe."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[60rem] space-y-5">
      {utilisateur && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Store className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
          Connecté en tant que <span className="font-medium text-gray-800">{utilisateur.username}</span>
          {utilisateur.boutique_nom && (
            <> — <span className="font-medium text-gray-800">{utilisateur.boutique_nom}</span></>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Changer mon mot de passe</h3>
          <p className="mt-1 text-sm text-slate-500">Utilisez un mot de passe sécurisé pour protéger votre compte.</p>
        </div>

        <PasswordInput
          label="Mot de passe actuel"
          value={ancienMotDePasse}
          onChange={(e) => setAncienMotDePasse(e.target.value)}
          autoComplete="current-password"
          required
        />

        <PasswordInput
          label="Nouveau mot de passe"
          value={nouveauMotDePasse}
          onChange={(e) => setNouveauMotDePasse(e.target.value)}
          autoComplete="new-password"
          required
        />

        <PasswordInput
          label="Confirmer le nouveau mot de passe"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
          required
        />

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          <Save className="h-4 w-4" /> {saving ? 'Enregistrement...' : 'Changer le mot de passe'}
        </button>
      </form>
    </div>
  );
}
