import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import DemandeAccesPage from './components/DemandeAccesPage';
import AdminPlateformePage from './components/AdminPlateformePage';
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
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { SupportViewProvider, useSupportView } from './context/SupportViewContext';
import SupportViewBanner from './components/SupportViewBanner';
import AbonnementBanner from './components/AbonnementBanner';
import { LayoutDashboard, Package, Tag, Warehouse, Truck, ShoppingBag, Wallet, FileBarChart, Settings as SettingsIcon, ShoppingCart, History, LogOut } from 'lucide-react';
import logoParDefaut from './assets/iwishop-logo-removebg-preview.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/';
const SERVER_BASE_URL = API_URL.replace(/api\/?$/, '');

function resoudreUrlLogo(logo) {
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  return `${SERVER_BASE_URL}${logo.startsWith('/') ? logo.slice(1) : logo}`;
}

function AppContent({ onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { parametres } = useSettings();
  const { quitter: quitterVueSupport } = useSupportView();

  const handleLogout = () => {
    quitterVueSupport();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    onLogout();
  };

  const nomBoutique = parametres?.nom_boutique || 'iwiShop';
  const logoUrl = resoudreUrlLogo(parametres?.logo) || logoParDefaut;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SupportViewBanner />
      <AbonnementBanner />
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden bg-white flex items-center justify-center border border-gray-200">
            <img src={logoUrl} alt="Logo" className="w-4/5 h-4/5 object-contain" />
          </div>
          {nomBoutique}
        </h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 transition"
        >
          <LogOut className="w-4 h-4" /> Déconnexion
        </button>
      </header>

      <nav className="bg-white border-b px-6 flex gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Tableau de Bord
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'products'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-4 h-4" /> Produits & Stocks
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'categories'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag className="w-4 h-4" /> Catégories
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'stock'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Warehouse className="w-4 h-4" /> Stock
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'suppliers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" /> Fournisseurs
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'purchases'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> Achats
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Wallet className="w-4 h-4" /> Dépenses
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'reports'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileBarChart className="w-4 h-4" /> Rapports
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <SettingsIcon className="w-4 h-4" /> Paramètres
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'sales'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart className="w-4 h-4" /> Ventes
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <History className="w-4 h-4" /> Historique
        </button>
      </nav>

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
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
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem('access_token')
  );


  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <SettingsProvider>
      <AppContent onLogout={() => setIsAuthenticated(false)} />
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <SupportViewProvider>
      <Routes>
        <Route path="/" element={<AccueilApp />} />
        <Route path="/demande-acces" element={<DemandeAccesPage />} />
        <Route path="/admin-plateforme" element={<AdminPlateformePage />} />
      </Routes>
    </SupportViewProvider>
  );
}
