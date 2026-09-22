import { useState } from 'react';
import { Lock, Send, Sparkles } from 'lucide-react';
import { useSettings } from '../context/settingsContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { poserQuestion } from '../services/assistant';

const SUGGESTIONS = [
  "Quel est mon chiffre d'affaires ce mois ?",
  "Qui me doit de l'argent ?",
  "Quels produits sont en rupture ?",
];

export default function Assistant() {
  const { utilisateur } = useSettings();
  const estProprietaire = utilisateur?.est_proprietaire;

  const [question, setQuestion] = useState('');
  const [historique, setHistorique] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  if (!estProprietaire) {
    return (
      <div className="mx-auto w-full max-w-[45rem]">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Lock className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assistant IA</h2>
            <p className="mt-1 text-sm text-slate-600">
              Cette fonctionnalité est réservée au propriétaire de la boutique.
            </p>
          </div>
        </div>
      </div>
    );
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
          : getErrorMessage(err, "L'assistant n'a pas pu répondre pour le moment. Réessayez plus tard.")
      );
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[45rem] space-y-6">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          <Sparkles className="h-6 w-6 text-blue-600" aria-hidden="true" /> Assistant IA
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Posez une question sur votre boutique : chiffre d'affaires, clients en dette, stock...
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {historique.length > 0 && (
          <div className="mb-4 space-y-4">
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

        {chargement && <p className="mb-4 text-sm text-slate-500">L'assistant réfléchit...</p>}

        {erreur && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {erreur}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
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

        <form onSubmit={handleEnvoyer} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="assistant-question" className="sr-only">Votre question</label>
          <textarea
            id="assistant-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Ex : Quel est mon bénéfice net ce mois-ci ?"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={chargement || !question.trim()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 sm:self-auto"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> {chargement ? 'Envoi...' : 'Demander'}
          </button>
        </form>
      </section>
    </div>
  );
}
