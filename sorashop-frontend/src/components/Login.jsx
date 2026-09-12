import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logoParDefaut from '../assets/iwishop-logo-removebg-preview.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      // axios ne renseigne pas `response` quand la requête n'a jamais atteint
      // le serveur (pas de réseau, timeout, serveur injoignable) : dans ce
      // cas, ce n'est pas l'identifiant/mot de passe qui est en cause, donc
      // on ne doit pas l'affirmer à l'utilisateur.
      if (!err?.response) {
        setError('Pas de connexion internet. Vérifiez votre réseau et réessayez.');
      } else if (err.response.status === 401 || err.response.status === 400) {
        setError('Identifiants incorrects. Veuillez réessayer.');
      } else {
        setError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-100">
      <div className="px-8 py-6 mt-4 text-left bg-white shadow-xl rounded-2xl w-96">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-white flex items-center justify-center border border-gray-200 mx-auto mb-2">
          <img src={logoParDefaut} alt="Logo" className="w-4/5 h-4/5 object-contain" />
        </div>
        <h3 className="text-2xl font-bold text-center text-gray-800">iwiShop - Connexion</h3>
        {error && <div className="mt-4 text-sm text-red-600 bg-red-100 p-2 rounded">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mt-4">
            <div>
              <label className="block text-gray-700">Nom d'utilisateur</label>
              <input
                type="text"
                placeholder="Admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div className="mt-4">
              <label className="block text-gray-700">Mot de passe</label>
              <div className="relative">
                <input
                  type={afficherMotDePasse ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 mt-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setAfficherMotDePasse((v) => !v)}
                  aria-label={afficherMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={afficherMotDePasse}
                  className="absolute right-2 top-1/2 -translate-y-1/2 mt-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {afficherMotDePasse ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-900 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Connexion…' : 'Se connecter'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
