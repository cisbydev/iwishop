import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../services/api';

export default function AbonnementBanner() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api.get('tenants/mon-abonnement/')
      .then((response) => setInfo(response.data))
      .catch(() => {});
  }, []);

  if (
    !info ||
    !info.a_abonnement ||
    !info.abonnement_valide ||
    info.jours_restants === null ||
    info.jours_restants > 3
  ) {
    return null;
  }

  const texteJours = info.jours_restants <= 0
    ? "aujourd'hui"
    : `dans ${info.jours_restants} jour${info.jours_restants > 1 ? 's' : ''}`;

  return (
    <div className="bg-orange-500 text-white px-4 py-2 flex items-center gap-2 sticky top-0 z-50 shadow-md">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium">
        Votre abonnement expire {texteJours} — pensez à le renouveler.
      </span>
    </div>
  );
}
