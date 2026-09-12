import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  SECTIONS_PRIORITAIRES_MOBILE,
  SECTIONS_PRIORITAIRES_TABLETTE,
  partitionnerNavigation,
} from '../navigation';
import PanneauPlusNavigation from './PanneauPlusNavigation';

const { prioritaires: prioritairesTablette, autres: autresTablette } = partitionnerNavigation(
  SECTIONS_PRIORITAIRES_TABLETTE
);
const { prioritaires: prioritairesMobile, autres: autresMobile } = partitionnerNavigation(
  SECTIONS_PRIORITAIRES_MOBILE
);

function BoutonSection({ id, label, Icon, isActive, onClick, className }) {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={className}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function NavigationCompacte({ activeTab, onSelect, onLogout }) {
  const [panneauOuvert, setPanneauOuvert] = useState(null);

  const selectionnerDepuisPanneau = (id) => {
    onSelect(id);
    setPanneauOuvert(null);
  };

  const deconnecterDepuisPanneau = () => {
    setPanneauOuvert(null);
    onLogout();
  };

  return (
    <>
      <nav
        aria-label="Navigation tablette"
        className="hidden items-stretch gap-1 overflow-x-auto border-b border-slate-100 bg-white px-2 py-2 md:flex min-[1366px]:hidden"
      >
        {prioritairesTablette.map((item) => (
          <BoutonSection
            key={item.id}
            {...item}
            isActive={activeTab === item.id}
            onClick={() => onSelect(item.id)}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
              activeTab === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          />
        ))}
        <button
          type="button"
          onClick={() => setPanneauOuvert('tablette')}
          aria-haspopup="dialog"
          aria-expanded={panneauOuvert === 'tablette'}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>Plus</span>
        </button>
      </nav>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-slate-200 bg-white md:hidden"
      >
        {prioritairesMobile.map((item) => (
          <BoutonSection
            key={item.id}
            {...item}
            isActive={activeTab === item.id}
            onClick={() => onSelect(item.id)}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
              activeTab === item.id ? 'text-blue-700' : 'text-slate-600'
            }`}
          />
        ))}
        <button
          type="button"
          onClick={() => setPanneauOuvert('mobile')}
          aria-haspopup="dialog"
          aria-expanded={panneauOuvert === 'mobile'}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-slate-600"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>Plus</span>
        </button>
      </nav>

      {panneauOuvert && (
        <PanneauPlusNavigation
          items={panneauOuvert === 'tablette' ? autresTablette : autresMobile}
          activeTab={activeTab}
          onSelect={selectionnerDepuisPanneau}
          onLogout={deconnecterDepuisPanneau}
          onClose={() => setPanneauOuvert(null)}
        />
      )}
    </>
  );
}
