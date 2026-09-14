import { Lock } from 'lucide-react';

// Affiché quand une écriture est refusée avec code PALIER_INSUFFISANT
// (cf. tenants.premium.verifier_acces_premium côté backend) - jamais pour
// une lecture, qui reste toujours autorisée quel que soit le palier.
export default function PremiumRequisBanner({ onNaviguerVersAbonnement }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <Lock className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm">La gestion des clients à crédit fait partie du palier Premium.</p>
        {onNaviguerVersAbonnement && (
          <button
            type="button"
            onClick={onNaviguerVersAbonnement}
            className="mt-2 text-sm font-semibold text-amber-900 underline hover:text-amber-950"
          >
            Découvrir le palier Premium
          </button>
        )}
      </div>
    </div>
  );
}
