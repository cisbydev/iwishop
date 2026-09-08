import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import DemandeAccesPage from './components/DemandeAccesPage';
import AdminPlateformePage from './components/AdminPlateformePage';
import RetourPaiement from './components/RetourPaiement';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Categories from './components/Categories';
import Stock from './components/Stock';
import Suppliers from './components/Suppliers';
import Purchases from './components/Purchases';
import Expenses from './components/Expenses';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Sales from './components/Sales';
import SalesHistory from './components/SalesHistory';
import { SettingsProvider } from './context/SettingsContext';
import { useSettings } from './context/settingsContextValue';
import { SupportViewProvider } from './context/SupportViewContext';
import { useSupportView } from './context/supportViewContextValue';
import { AuthProvider, useAuth } from './context/AuthContext';
import SupportViewBanner from './components/SupportViewBanner';
import AbonnementBanner from './components/AbonnementBanner';
import GlobalBanners from './components/GlobalBanners';
import MobileNavigation from './components/MobileNavigation';
import { LayoutDashboard, Package, Tag, Warehouse, Truck, ShoppingBag, Wallet, FileBarChart, Settings as SettingsIcon, ShoppingCart, History, LogOut } from 'lucide-react';
import logoParDefaut from './assets/iwishop-logo-removebg-preview.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/';
const SERVER_BASE_URL = API_URL.replace(/api\/?$/, '');

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

function resoudreUrlLogo(logo) {
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  return `${SERVER_BASE_URL}${logo.startsWith('/') ? logo.slice(1) : logo}`;
}

function DesktopNavigation({ activeTab, onSelect }) {
  return (
    <nav aria-label="Navigation principale" className="hidden min-w-0 flex-1 items-stretch justify-center gap-1 min-[1366px]:flex">
      {NAVIGATION_ITEMS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex h-[88px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-semibold leading-3 text-slate-600 transition min-[1600px]:text-xs ${
              isActive
                ? 'bg-blue-50/80 text-blue-700 shadow-sm shadow-blue-100/80 after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-blue-600'
                : 'hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition ${
              isActive
                ? 'bg-white text-blue-600 shadow-[0_3px_8px_rgba(37,99,235,0.18)] ring-blue-100'
                : 'bg-slate-50 text-slate-500 shadow-[0_2px_5px_rgba(15,23,42,0.08)] ring-slate-200/80'
            }`}>
              <Icon className="h-[30px] w-[30px] shrink-0 stroke-[2] min-[1600px]:h-8 min-[1600px]:w-8" aria-hidden="true" />
            </span>
            <span className="max-w-full">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { parametres, utilisateur } = useSettings();
  const { quitter: quitterVueSupport } = useSupportView();
  const { logout } = useAuth();

  const handleLogout = async () => {
    quitterVueSupport();
    await logout();
  };

  const nomBoutique = parametres?.nom_boutique || 'iwiShop';
  const logoUrl = resoudreUrlLogo(parametres?.logo) || logoParDefaut;
  const nomUtilisateur = utilisateur?.username || 'Utilisateur';
  const initialeUtilisateur = nomUtilisateur.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <GlobalBanners>
        <SupportViewBanner />
        <AbonnementBanner />
      </GlobalBanners>
      <header className="flex min-h-16 items-center gap-3 border-b border-slate-200/70 bg-white px-4 sm:px-6 min-[1366px]:min-h-[104px] min-[1366px]:gap-4">
        <h1 className="flex min-w-0 flex-1 items-center gap-3 min-[1366px]:w-14 min-[1366px]:flex-none min-[1366px]:justify-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-100 min-[1366px]:h-14 min-[1366px]:w-14 min-[1366px]:rounded-xl min-[1366px]:bg-white min-[1366px]:shadow-[0_3px_10px_rgba(15,23,42,0.10)] min-[1366px]:ring-slate-200/80">
            <img
              src={logoUrl}
              alt="Logo IwiShop"
              className="h-9 w-9 object-contain min-[1366px]:h-12 min-[1366px]:w-12"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = logoParDefaut;
              }}
            />
          </div>
          <span className="block min-w-0 truncate text-lg font-bold tracking-tight text-slate-900 min-[1366px]:hidden" title={nomBoutique}>{nomBoutique}</span>
        </h1>

        <DesktopNavigation activeTab={activeTab} onSelect={setActiveTab} />

        <div className="hidden shrink-0 items-center gap-2 min-[1366px]:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100 shadow-sm shadow-blue-100/70" aria-hidden="true">
            {initialeUtilisateur}
          </span>
          <span className="max-w-20 truncate text-sm font-semibold text-slate-700 min-[1600px]:max-w-28" title={nomUtilisateur}>
            {nomUtilisateur}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="flex h-10 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 min-[1600px]:px-3"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      <MobileNavigation
        activeTab={activeTab}
        onSelect={setActiveTab}
        onLogout={handleLogout}
      />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          {activeTab === 'dashboard' && <Dashboard onNouvelleVente={() => setActiveTab('sales')} />}
          {activeTab === 'sales' && <Sales />}
          {activeTab === 'products' && <Products />}
          {activeTab === 'categories' && <Categories />}
          {activeTab === 'stock' && <Stock />}
          {activeTab === 'suppliers' && <Suppliers />}
          {activeTab === 'purchases' && <Purchases />}
          {activeTab === 'expenses' && <Expenses />}
          {activeTab === 'reports' && <Reports />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'history' && <SalesHistory />}
        </div>
      </main>
    </div>
  );
}

function AccueilApp() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SupportViewProvider>
        <Routes>
          <Route path="/" element={<AccueilApp />} />
          <Route path="/demande-acces" element={<DemandeAccesPage />} />
          <Route path="/admin-plateforme" element={<AdminPlateformePage />} />
          <Route path="/abonnement/retour" element={<RetourPaiement />} />
        </Routes>
      </SupportViewProvider>
    </AuthProvider>
  );
}
