import { MoreHorizontal } from 'lucide-react';
import { useNavigationPanneau } from '../context/NavigationPanneauContext';

export default function NavigationTablette() {
  const { activeTab, onSelect, ouvrirPanneau, panneauOuvert, prioritairesTablette } = useNavigationPanneau();

  return (
    <nav
      aria-label="Navigation tablette"
      className="hidden min-w-0 flex-1 items-stretch justify-center gap-1 min-[768px]:max-[1280px]:flex"
    >
      {prioritairesTablette.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-[10px] font-semibold leading-3 text-slate-600 transition ${
              isActive
                ? 'bg-blue-50/80 text-blue-700 shadow-sm shadow-blue-100/80'
                : 'hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition ${
                isActive
                  ? 'bg-white text-blue-600 shadow-[0_3px_8px_rgba(37,99,235,0.18)] ring-blue-100'
                  : 'bg-slate-50 text-slate-500 shadow-[0_2px_5px_rgba(15,23,42,0.08)] ring-slate-200/80'
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 stroke-[2]" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => ouvrirPanneau('tablette')}
        aria-haspopup="dialog"
        aria-expanded={panneauOuvert === 'tablette'}
        className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-[10px] font-semibold leading-3 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 shadow-[0_2px_5px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80">
          <MoreHorizontal className="h-[18px] w-[18px] shrink-0 stroke-[2]" aria-hidden="true" />
        </span>
        <span>Plus</span>
      </button>
    </nav>
  );
}
