import { useEffect, useState } from 'react';
import api from '../services/api';
import { useSettings } from '../context/settingsContextValue';
import { useSupportView } from '../context/supportViewContextValue';
import { getErrorMessage } from '../services/errorUtils';
import { formatCurrency, formatDate } from '../utils/formatters';
import { libelleModePaiement } from '../utils/modesPaiement';
import TitreImpression from './TitreImpression';
import { Info } from 'lucide-react';

// Affichage seul : tous les montants et totaux viennent de l'API
// (reports/caisse.py) - aucun calcul côté client.
export default function JournalCaisse() {
  const { parametres, aAccesPremium } = useSettings();
  const devise = parametres?.devise || 'FCFA';
  const { actif: modeSupport, boutiqueId } = useSupportView();
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [journal, setJournal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  // Sans dates : le serveur prend "aujourd'hui" dans son fuseau (celui des
  // boutiques), pas celui du navigateur.
  const charger = async (debut, fin) => {
    setLoading(true);
    setErreur('');
    try {
      const params = debut && fin ? { date_debut: debut, date_fin: fin } : {};
      const response = await api.get('reports/journal-caisse/', { params });
      setJournal(response.data);
      setDateDebut(response.data.date_debut);
      setDateFin(response.data.date_fin);
    } catch (err) {
      console.error('Erreur chargement journal de caisse', err);
      setErreur(getErrorMessage(err, 'Impossible de charger le journal de caisse. Vérifiez votre connexion puis réessayez.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadJournal = async () => {
      await charger();
    };

    void loadJournal();
  }, [modeSupport, boutiqueId]);

  // Les remboursements de dettes n'existent qu'avec le crédit client
  // (Premium) : colonne masquée hors Premium, sauf s'il y a quand même des
  // remboursements sur la période (boutique repassée en Essentiel).
  const afficherRemboursements = aAccesPremium !== false || Number(journal?.entrees.remboursements) !== 0;

  // Sur les nombres de lignes, jamais sur les montants : une vente à crédit
  // sans acompte ou un remboursement annulé par sa correction font 0 en
  // montant mais restent des mouvements à afficher. nombre_remboursements
  // absent (backend antérieur) : pas d'état vide, faute de pouvoir l'affirmer.
  const aucunMouvement = journal !== null
    && journal.informations.nombre_ventes === 0
    && journal.entrees.nombre_remboursements === 0
    && journal.sorties.nombre_achats === 0
    && journal.sorties.nombre_depenses === 0;
  const solde = Number(journal?.solde_periode);
  const couleurSolde = solde < 0 ? 'text-red-600' : solde > 0 ? 'text-emerald-600' : 'text-slate-700';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="caisse-date-debut" className="mb-1 block text-sm font-medium text-slate-700">Date de début</label>
              <input
                id="caisse-date-debut"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="caisse-date-fin" className="mb-1 block text-sm font-medium text-slate-700">Date de fin</label>
              <input
                id="caisse-date-fin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => charger()}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:flex-none"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => charger(dateDebut, dateFin)}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:flex-none"
            >
              Appliquer
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Période de 31 jours au maximum.</p>
      </section>

      {loading ? (
        <div className="p-6 text-center text-gray-600">Chargement du journal de caisse...</div>
      ) : erreur ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {erreur}
        </div>
      ) : (
        <>
          <TitreImpression
            titre="Journal de caisse"
            nomBoutique={journal.boutique_nom}
            dateDebut={journal.date_debut}
            dateFin={journal.date_fin}
          />
          {/* Déjà dans le titre imprimé. */}
          <p className="text-sm text-slate-500 print:hidden">
            Période affichée : <span className="font-medium text-slate-700">{formatDate(journal.date_debut)}</span> au{' '}
            <span className="font-medium text-slate-700">{formatDate(journal.date_fin)}</span>
          </p>

          {aucunMouvement ? (
            <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              Aucun mouvement sur cette période.
            </section>
          ) : (
            <>
              {/* Solde de la période */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-sm font-medium text-slate-500">Solde de la période</p>
                <p className={`mt-1 text-3xl font-bold ${couleurSolde}`}>
                  {formatCurrency(journal.solde_periode, devise)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Argent encaissé moins argent sorti sur la période. Ce n'est pas le contenu de votre caisse :
                  le fond de caisse de départ n'est pas enregistré dans iwiShop.
                </p>
              </section>

              {/* Entrées par mode */}
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 px-5 py-4 text-base font-semibold text-slate-900 sm:px-6">Entrées</h3>
                {/* Téléphone : une carte par mode (le tableau à 4 colonnes est
                    illisible à 375 px). Les modes à 0 sont omis pour alléger. */}
                <ul aria-label="Entrées par mode" className="divide-y divide-slate-100 sm:hidden">
                  {journal.entrees.par_mode.filter((ligne) => Number(ligne.total) !== 0).map((ligne) => (
                    <li key={ligne.mode_paiement ?? 'non-precise'} className="px-5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-slate-900">{libelleModePaiement(ligne.mode_paiement)}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(ligne.total, devise)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Ventes {formatCurrency(ligne.ventes, devise)}
                        {afficherRemboursements && <> · Remboursements {formatCurrency(ligne.remboursements, devise)}</>}
                      </p>
                    </li>
                  ))}
                  {journal.entrees.par_mode.every((ligne) => Number(ligne.total) === 0) && (
                    <li className="px-5 py-3 text-sm text-slate-500">Aucune entrée sur la période.</li>
                  )}
                  <li className="flex items-baseline justify-between gap-3 bg-slate-50 px-5 py-3 font-semibold text-slate-900">
                    <span>Total encaissé</span>
                    <span>{formatCurrency(journal.entrees.total, devise)}</span>
                  </li>
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-medium sm:px-6">Mode</th>
                        <th className="px-3 py-3 text-right font-medium">Ventes</th>
                        {afficherRemboursements && <th className="px-3 py-3 text-right font-medium">Remboursements de dettes</th>}
                        <th className="px-5 py-3 text-right font-medium sm:px-6">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {journal.entrees.par_mode.map((ligne) => (
                        <tr key={ligne.mode_paiement ?? 'non-precise'}>
                          <td className="px-5 py-3 text-slate-700 sm:px-6">{libelleModePaiement(ligne.mode_paiement)}</td>
                          <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(ligne.ventes, devise)}</td>
                          {afficherRemboursements && (
                            <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(ligne.remboursements, devise)}</td>
                          )}
                          <td className="px-5 py-3 text-right font-medium text-slate-900 sm:px-6">{formatCurrency(ligne.total, devise)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold text-slate-900">
                      <tr>
                        <td className="px-5 py-3 sm:px-6">Total encaissé</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(journal.entrees.ventes, devise)}</td>
                        {afficherRemboursements && (
                          <td className="px-3 py-3 text-right">{formatCurrency(journal.entrees.remboursements, devise)}</td>
                        )}
                        <td className="px-5 py-3 text-right sm:px-6">{formatCurrency(journal.entrees.total, devise)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
                  Ventes : montant reçu moins la monnaie rendue ; pour une vente à crédit, seul l'acompte est compté.
                </p>
              </section>

              {/* Sorties */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-base font-semibold text-slate-900">Sorties</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-600">Achats ({journal.sorties.nombre_achats})</dt>
                    <dd className="font-medium text-slate-900">{formatCurrency(journal.sorties.achats, devise)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-600">Dépenses ({journal.sorties.nombre_depenses})</dt>
                    <dd className="font-medium text-slate-900">{formatCurrency(journal.sorties.depenses, devise)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-slate-100 pt-2 font-semibold">
                    <dt className="text-slate-900">Total sorti</dt>
                    <dd className="text-slate-900">{formatCurrency(journal.sorties.total, devise)}</dd>
                  </div>
                </dl>
                <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <Info className="h-4 w-4 shrink-0" />
                  Les achats et les dépenses sont considérés comme payés comptant : leur mode de paiement n'est pas enregistré.
                </p>
              </section>

              {/* Informations */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-base font-semibold text-slate-900">À savoir</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>{journal.informations.nombre_ventes} vente(s) sur la période.</li>
                  <li>
                    Vendu à crédit sur la période : <span className="font-medium text-slate-900">{formatCurrency(journal.informations.credit_accorde, devise)}</span>
                  </li>
                  {/* Absent tant que le backend n'est pas déployé : ligne masquée. */}
                  {journal.informations.credit_restant_du != null && (
                    <li>
                      Dont encore dû aujourd'hui : <span className="font-medium text-slate-900">{formatCurrency(journal.informations.credit_restant_du, devise)}</span>
                    </li>
                  )}
                  {journal.informations.ventes_synchronisees_en_differe > 0 && (
                    <li>
                      {journal.informations.ventes_synchronisees_en_differe} vente(s) faite(s) hors connexion, comptée(s) au jour de leur synchronisation.
                    </li>
                  )}
                  <li>Les ventes, achats et dépenses annulés sont retirés du jour où ils avaient été enregistrés.</li>
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
