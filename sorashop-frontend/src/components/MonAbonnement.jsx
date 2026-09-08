import { useCallback, useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { getAll } from '../services/api';

const PAIEMENT_ABONNEMENT_STORAGE_KEY = 'iwishop_paiement_abonnement_id';

function StatutAbonnement({ info }) {
  if (!info) return null;

  if (!info.a_abonnement) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
          <CreditCard className="h-5 w-5 text-blue-600" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Aucun abonnement actif</p>
          <p className="mt-1 text-sm text-slate-500">Votre boutique ne dispose actuellement d'aucun abonnement actif.</p>
        </div>
      </div>
    );
  }

  if (info.statut === 'EXPIRE' || !info.abonnement_valide) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 sm:p-5">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span className="font-medium">Expiré</span>
      </div>
    );
  }

  const [annee, mois, jour] = info.date_fin.split('-');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 sm:p-5">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <span className="font-medium">Actif jusqu'au {jour}/{mois}/{annee}</span>
    </div>
  );
}

export default function MonAbonnement() {
  const [info, setInfo] = useState(null);
  const [formules, setFormules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formuleEnCours, setFormuleEnCours] = useState(null);
  const [erreur, setErreur] = useState('');
  const [erreurChargement, setErreurChargement] = useState('');

  const chargerAbonnement = useCallback(async () => {
    setLoading(true);
    setErreurChargement('');
    try {
      const [infoRes, formules] = await Promise.all([
        api.get('tenants/mon-abonnement/'),
        getAll('tenants/formules-abonnement/'),
      ]);
      setInfo(infoRes.data);
      setFormules(formules);
    } catch (err) {
      console.error("Erreur chargement abonnement", err);
      setErreurChargement("Impossible de charger l'abonnement. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const charger = async () => {
      await chargerAbonnement();
    };

    void charger();
  }, [chargerAbonnement]);

  const choisirFormule = (formule) => {
    setErreur('');
    setFormuleEnCours(formule.id);
    api.post('tenants/creer-paiement/', { formule_id: formule.id })
      .then((res) => {
        sessionStorage.setItem(PAIEMENT_ABONNEMENT_STORAGE_KEY, String(res.data.paiement_id));
        window.location.href = res.data.url_paiement;
      })
      .catch(() => {
        setErreur("Impossible de démarrer le paiement pour le moment. Réessaie dans un instant.");
        setFormuleEnCours(null);
      });
  };

  if (loading) return <div className="p-6 text-center text-gray-600">Chargement...</div>;

  if (erreurChargement) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{erreurChargement}</p>
          <button onClick={chargerAbonnement} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Mon abonnement</h3>
        <p className="mt-1 text-sm text-slate-500">Consultez votre abonnement et les formules disponibles pour votre boutique.</p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
      <StatutAbonnement info={info} />

      {erreur && (
        <div className="p-3 bg-red-100 text-red-800 rounded-lg text-sm">{erreur}</div>
      )}

      <div className="border-t border-slate-100 pt-5">
        <h4 className="text-base font-semibold text-slate-900">Formules disponibles</h4>
        <p className="mt-1 text-sm text-slate-500">Choisissez la formule adaptée aux besoins de votre boutique.</p>
        {formules.length === 0 ? (
          <div className="mt-4 flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
            <CreditCard className="h-7 w-7 text-blue-400" aria-hidden="true" />
            <p className="text-sm text-slate-500">Aucune formule disponible pour le moment.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {formules.map((formule) => (
              <div
                key={formule.id}
                className="flex h-full flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <p className="font-medium text-gray-800">{formule.nom}</p>
                  <p className="text-sm text-gray-500">
                    {formule.duree_jours} jours &middot; {formule.prix} FCFA
                  </p>
                </div>
                <button
                  onClick={() => choisirFormule(formule)}
                  disabled={formuleEnCours !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {formuleEnCours === formule.id ? 'Redirection...' : 'Choisir cette formule'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
