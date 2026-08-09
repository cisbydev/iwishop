import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/errorUtils';
import { ShieldCheck, CheckCircle, XCircle, Loader2, Copy, Store, Power } from 'lucide-react';

function AdminLoginForm({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('token/', { username, password });
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      onLoginSuccess();
    } catch (err) {
      setError('Identifiants incorrects. Veuillez réessayer.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="px-8 py-6 mt-4 text-left bg-white shadow-lg rounded-lg w-96">
        <h3 className="text-2xl font-bold text-center text-gray-800">Administration plateforme</h3>
        {error && <div className="mt-4 text-sm text-red-600 bg-red-100 p-2 rounded">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mt-4">
            <div>
              <label className="block text-gray-700">Nom d'utilisateur</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                required
              />
            </div>
            <div className="mt-4">
              <label className="block text-gray-700">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                required
              />
            </div>
            <div className="flex items-center justify-between mt-4">
              <button
                type="submit"
                className="w-full px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-900 focus:outline-none"
              >
                Se connecter
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUT_STYLES = {
  EN_ATTENTE: 'bg-yellow-100 text-yellow-800',
  APPROUVEE: 'bg-green-100 text-green-800',
  REJETEE: 'bg-gray-200 text-gray-600',
};

const STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  APPROUVEE: 'Approuvée',
  REJETEE: 'Rejetée',
};

function BoutiquesPanel() {
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enCoursId, setEnCoursId] = useState(null);

  const fetchBoutiques = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('tenants/boutiques/');
      setBoutiques(response.data);
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors du chargement des boutiques."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoutiques();
  }, [fetchBoutiques]);

  const handleToggleActif = async (boutique) => {
    if (boutique.actif && !window.confirm(`Désactiver "${boutique.nom}" ? Ses utilisateurs ne pourront plus se connecter ni accéder à leurs données.`)) {
      return;
    }
    setEnCoursId(boutique.id);
    setError('');
    try {
      await api.post(`tenants/boutiques/${boutique.id}/toggle-actif/`);
      fetchBoutiques();
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors du changement de statut de la boutique."));
    } finally {
      setEnCoursId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-800">Boutiques</h2>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-100 p-3 rounded">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
          </div>
        ) : boutiques.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucune boutique pour le moment.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Membres</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Créée le</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {boutiques.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="p-3 font-medium text-gray-800">{b.nom}</td>
                  <td className="p-3">{b.nombre_membres}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      b.actif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {b.actif ? 'Active' : 'Désactivée'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">{new Date(b.date_creation).toLocaleDateString('fr-FR')}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleToggleActif(b)}
                      disabled={enCoursId === b.id}
                      className={`flex items-center gap-1 px-3 py-1 rounded-md transition text-xs text-white disabled:opacity-50 ${
                        b.actif ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      <Power className="w-3 h-3" /> {b.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DemandesPanel() {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accesRefuse, setAccesRefuse] = useState(false);
  const [enCoursId, setEnCoursId] = useState(null);
  const [resultatApprobation, setResultatApprobation] = useState(null);

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('tenants/demandes/');
      setDemandes(response.data);
    } catch (err) {
      if (err?.response?.status === 403) {
        setAccesRefuse(true);
      } else {
        setError(getErrorMessage(err, "Erreur lors du chargement des demandes."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  const handleApprouver = async (id) => {
    setEnCoursId(id);
    setError('');
    try {
      const demande = demandes.find((d) => d.id === id);
      const response = await api.post(`tenants/demandes/${id}/approuver/`);
      setResultatApprobation({ ...response.data, contact_email: demande?.email });
      fetchDemandes();
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors de l'approbation de la demande."));
    } finally {
      setEnCoursId(null);
    }
  };

  const handleRejeter = async (id) => {
    if (!window.confirm("Rejeter cette demande d'accès ?")) return;
    setEnCoursId(id);
    setError('');
    try {
      await api.post(`tenants/demandes/${id}/rejeter/`);
      fetchDemandes();
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors du rejet de la demande."));
    } finally {
      setEnCoursId(null);
    }
  };

  if (accesRefuse) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white shadow-lg rounded-lg p-8 text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-700">Action réservée à l'administrateur de la plateforme.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">Administration plateforme — Demandes d'accès</h1>
        </div>

        {resultatApprobation && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-1">
            <p className="font-semibold text-green-800">{resultatApprobation.detail}</p>

            {resultatApprobation.email_envoye ? (
              <p className="text-sm bg-green-100 text-green-800 rounded px-3 py-2">
                ✅ Email envoyé automatiquement à {resultatApprobation.contact_email || 'l\'adresse du contact'}
              </p>
            ) : (
              <p className="text-sm bg-orange-100 text-orange-800 rounded px-3 py-2">
                ⚠️ Échec de l'envoi automatique ({resultatApprobation.erreur_email}) — transmets les identifiants manuellement ci-dessous
              </p>
            )}

            <p className="text-sm text-gray-700">Boutique : <span className="font-medium">{resultatApprobation.boutique}</span></p>
            <p className="text-sm text-gray-700">Identifiant : <span className="font-mono font-medium">{resultatApprobation.username}</span></p>
            <p className="text-sm text-gray-700">Mot de passe temporaire : <span className="font-mono font-medium">{resultatApprobation.mot_de_passe_temporaire}</span></p>
            <p className="text-xs text-red-600 mt-2">{resultatApprobation.avertissement}</p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => navigator.clipboard.writeText(
                  `${resultatApprobation.username} / ${resultatApprobation.mot_de_passe_temporaire}`
                )}
                className="flex items-center gap-1 text-xs px-3 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Copy className="w-3 h-3" /> Copier les identifiants
              </button>
              <button
                onClick={() => setResultatApprobation(null)}
                className="text-xs text-gray-500 underline"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600 bg-red-100 p-3 rounded">{error}</div>}

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
            </div>
          ) : demandes.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Aucune demande pour le moment.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="p-3">Contact</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Téléphone</th>
                  <th className="p-3">Boutique souhaitée</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {demandes.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="p-3">{d.nom_contact}</td>
                    <td className="p-3">{d.email}</td>
                    <td className="p-3">{d.telephone || '—'}</td>
                    <td className="p-3">{d.nom_boutique_souhaite}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_STYLES[d.statut]}`}>
                        {STATUT_LABELS[d.statut] || d.statut}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">{new Date(d.date_demande).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3">
                      {d.statut === 'EN_ATTENTE' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprouver(d.id)}
                            disabled={enCoursId === d.id}
                            className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:bg-green-300 text-xs"
                          >
                            <CheckCircle className="w-3 h-3" /> Approuver
                          </button>
                          <button
                            onClick={() => handleRejeter(d.id)}
                            disabled={enCoursId === d.id}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition disabled:opacity-50 text-xs"
                          >
                            <XCircle className="w-3 h-3" /> Rejeter
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <BoutiquesPanel />
      </div>
    </div>
  );
}

export default function AdminPlateformePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem('access_token')
  );

  if (!isAuthenticated) {
    return <AdminLoginForm onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <DemandesPanel />;
}
