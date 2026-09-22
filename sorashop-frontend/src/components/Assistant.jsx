import { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { useSettings } from '../context/settingsContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { poserQuestion } from '../services/assistant';

const SUGGESTIONS = [
  "Quel est mon chiffre d'affaires ce mois ?",
  "Qui me doit de l'argent ?",
  "Quels produits sont en rupture ?",
];

// Bouton flottant + panneau de chat pour Iwi, l'assistant IA.
// Rendu une seule fois, globalement, plutôt que comme un onglet de
// navigation : il doit rester accessible depuis n'importe quel écran sans
// perdre le travail en cours sur l'onglet actif.
export default function Assistant() {
  const { utilisateur } = useSettings();
  const estProprietaire = utilisateur?.est_proprietaire;

  const [ouvert, setOuvert] = useState(false);
  const [question, setQuestion] = useState('');
  const [historique, setHistorique] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  // Fonctionnalité réservée au propriétaire : pour un employé, le bouton
  // flottant n'existe simplement pas (rien à cacher/afficher conditionnellement).
  if (!estProprietaire) {
    return null;
  }

  const handleEnvoyer = async (e) => {
    e.preventDefault();
    const questionEnvoyee = question.trim();
    if (!questionEnvoyee || chargement) return;

    setChargement(true);
    setErreur('');
    try {
      const { reponse } = await poserQuestion(questionEnvoyee);
      setHistorique((h) => [...h, { id: `${Date.now()}`, question: questionEnvoyee, reponse }]);
      setQuestion('');
    } catch (err) {
      setErreur(
        err.response?.status === 429
          ? "Limite quotidienne de questions à l'assistant atteinte. Réessayez demain."
          : getErrorMessage(err, "Iwi n'a pas pu répondre pour le moment. Réessayez plus tard.")
      );
    } finally {
      setChargement(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label="Ouvrir Iwi, l'assistant IA"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 md:bottom-6 md:right-6"
      >
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Iwi, l'assistant IA"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 sm:items-end sm:justify-end sm:p-4"
        >
          <div className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[32rem] sm:max-w-md sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-blue-50/60 px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" /> Iwi
              </h2>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer Iwi"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {historique.length === 0 && !chargement && (
                <p className="text-sm text-slate-500">
                  Bonjour, je suis Iwi. Posez-moi une question sur votre boutique : chiffre d'affaires, clients en dette, stock...
                </p>
              )}

              {historique.length > 0 && (
                <div className="space-y-4">
                  {historique.map((echange) => (
                    <div key={echange.id} className="space-y-2">
                      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">
                        {echange.question}
                      </p>
                      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {echange.reponse}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {chargement && <p className="mt-4 text-sm text-slate-500">Iwi réfléchit...</p>}

              {erreur && (
                <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {erreur}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuestion(suggestion)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <form onSubmit={handleEnvoyer} className="flex items-end gap-2">
                <label htmlFor="assistant-question" className="sr-only">Votre question</label>
                <textarea
                  id="assistant-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={1}
                  placeholder="Ex : Quel est mon bénéfice net ce mois-ci ?"
                  className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={chargement || !question.trim()}
                  aria-label="Envoyer la question"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
