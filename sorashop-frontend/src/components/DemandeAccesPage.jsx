import React, { useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';

export default function DemandeAccesPage() {
  const [nomContact, setNomContact] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [nomBoutiqueSouhaite, setNomBoutiqueSouhaite] = useState('');
  const [error, setError] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEnvoi(true);
    try {
      await api.post('tenants/demande-acces/', {
        nom_contact: nomContact,
        email,
        telephone,
        nom_boutique_souhaite: nomBoutiqueSouhaite,
      });
      setEnvoye(true);
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors de l'envoi de la demande."));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="px-8 py-6 mt-4 text-left bg-white shadow-lg rounded-lg w-96">
        <h3 className="text-2xl font-bold text-center text-gray-800">Demander un accès à iwiShop</h3>

        {envoye ? (
          <div className="mt-4 text-sm text-green-700 bg-green-100 p-3 rounded">
            Merci ! Ta demande a été envoyée. Tu recevras tes identifiants de connexion une fois qu'elle sera validée.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="mt-4 text-sm text-red-600 bg-red-100 p-2 rounded">{error}</div>}
            <div className="mt-4">
              <div>
                <label className="block text-gray-700">Nom du contact</label>
                <input
                  type="text"
                  value={nomContact}
                  onChange={(e) => setNomContact(e.target.value)}
                  className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>
              <div className="mt-4">
                <label className="block text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>
              <div className="mt-4">
                <label className="block text-gray-700">Téléphone (optionnel)</label>
                <input
                  type="text"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
              <div className="mt-4">
                <label className="block text-gray-700">Nom de la boutique souhaité</label>
                <input
                  type="text"
                  value={nomBoutiqueSouhaite}
                  onChange={(e) => setNomBoutiqueSouhaite(e.target.value)}
                  className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>
              <div className="flex items-center justify-between mt-4">
                <button
                  type="submit"
                  disabled={envoi}
                  className="w-full px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-900 focus:outline-none disabled:bg-blue-300"
                >
                  {envoi ? 'Envoi...' : 'Envoyer la demande'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
