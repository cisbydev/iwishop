import { useEffect, useState } from 'react';
import {
  FileBarChart,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings as SettingsIcon,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Truck,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react';

const NAVIGATION_ITEMS = [
  { id: 'dashboard', label: 'Tableau de Bord', Icon: LayoutDashboard },
  { id: 'products', label: 'Produits & Stocks', Icon: Package },
  { id: 'categories', label: 'Catégories', Icon: Tag },
  { id: 'stock', label: 'Stock', Icon: Warehouse },
  { id: 'suppliers', label: 'Fournisseurs', Icon: Truck },
  { id: 'purchases', label: 'Achats', Icon: ShoppingBag },
  { id: 'expenses', label: 'Dépenses', Icon: Wallet },
  { id: 'reports', label: 'Rapports', Icon: FileBarChart },
  { id: 'settings', label: 'Paramètres', Icon: SettingsIcon },
  { id: 'sales', label: 'Ventes', Icon: ShoppingCart },
  { id: 'history', label: 'Historique', Icon: History },
];

export default function MobileNavigation({ activeTab, onSelect, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectTab = (tab) => {
    onSelect(tab);
    setIsOpen(false);
  };

  const logout = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div className="border-b border-slate-100 bg-white min-[1366px]:hidden">
      <div className="px-4 py-2">
        <button
          type="button"
          aria-label={isOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation'}
          aria-expanded={isOpen}
          aria-controls="navigation-mobile"
          onClick={() => setIsOpen((open) => !open)}
          className="min-h-11 w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
        >
          <span className="flex items-center gap-2"><Menu className="w-5 h-5" /> Menu</span>
          {isOpen ? <X className="w-5 h-5" aria-hidden="true" /> : null}
        </button>
      </div>

      {isOpen && (
        <nav
          id="navigation-mobile"
          aria-label="Navigation mobile"
          className="max-h-[calc(100vh-9rem)] overflow-y-auto border-t border-gray-100 px-4 py-3"
        >
          <div className="space-y-1">
            {NAVIGATION_ITEMS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => selectTab(id)}
                  className={`min-h-11 w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium rounded-md transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" /> {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={logout}
            className="min-h-11 w-full mt-3 flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-700 border-t border-gray-100"
          >
            <LogOut className="w-5 h-5" /> Déconnexion
          </button>
        </nav>
      )}
    </div>
  );
}
