import { useEffect } from 'react';
import { LogOut, X } from 'lucide-react';

export default function PanneauPlusNavigation({ items, activeTab, onSelect, onLogout, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plus de sections"
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
    >
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />

      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl md:rounded-2xl md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Plus</h2>
          <button
            type="button"
            aria-label="Fermer le panneau"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {items.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelect(id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium transition ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="text-center leading-tight">{label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 pt-4 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" /> Déconnexion
        </button>
      </div>
    </div>
  );
}
