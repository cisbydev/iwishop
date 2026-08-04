import React, { useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { KeyRound, Save } from 'lucide-react';

export default function Account() {
  const [ancienMotDePasse, setAncienMotDePasse] = useState('');
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
      setSuccessMessage("Mot de passe modifié avec succès !");
      setAncienMotDePasse('');
      setNouveauMotDePasse('');
      setConfirmation('');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      alert(getErrorMessage(err, "Erreur lors du changement de mot de passe."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      {successMessage && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Changer mon mot de passe</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700">Mot de passe actuel</label>
          <input
            type="password"
            value={ancienMotDePasse}
            onChange={(e) => setAncienMotDePasse(e.target.value)}
            className="mt-1 w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Nouveau mot de passe</label>
          <input
            type="password"
            value={nouveauMotDePasse}
            onChange={(e) => setNouveauMotDePasse(e.target.value)}
            className="mt-1 w-full p-2 border rounded-md"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="mt-1 w-full p-2 border rounded-md"
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-blue-300"
        >
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Changer le mot de passe'}
        </button>
      </form>
    </div>
  );
}
