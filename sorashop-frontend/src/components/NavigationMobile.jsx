import { MoreHorizontal } from 'lucide-react';
import { useNavigationPanneau } from '../context/NavigationPanneauContext';

export default function NavigationMobile() {
  const { activeTab, onSelect, ouvrirPanneau, panneauOuvert, prioritairesMobile } = useNavigationPanneau();

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-slate-200 bg-white md:hidden"
    >
      {prioritairesMobile.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(id)}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
              isActive ? 'text-blue-700' : 'text-slate-600'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => ouvrirPanneau('mobile')}
        aria-haspopup="dialog"
        aria-expanded={panneauOuvert === 'mobile'}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-slate-600"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span>Plus</span>
      </button>
    </nav>
  );
}
