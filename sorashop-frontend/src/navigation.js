import {
  LayoutDashboard,
  Package,
  Tag,
  Warehouse,
  Truck,
  ShoppingBag,
  Wallet,
  FileBarChart,
  Settings as SettingsIcon,
  ShoppingCart,
  History,
  Users,
} from 'lucide-react';

export const NAVIGATION_ITEMS = [
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
  { id: 'clients', label: 'Clients', Icon: Users },
];

// L'Assistant IA n'est pas dans la navigation principale : il est accessible
// via un bouton flottant (voir components/Assistant.jsx), affiché sur tous
// les écrans plutôt qu'onglet par onglet.

export const SECTIONS_PRIORITAIRES_TABLETTE = ['dashboard', 'sales', 'products', 'stock', 'purchases', 'history'];

export const SECTIONS_PRIORITAIRES_MOBILE = ['dashboard', 'sales', 'products'];

export function partitionnerNavigation(idsPrioritaires) {
  const itemsParId = new Map(NAVIGATION_ITEMS.map((item) => [item.id, item]));
  const prioritaires = idsPrioritaires.map((id) => itemsParId.get(id)).filter(Boolean);
  const idsPrioritairesSet = new Set(idsPrioritaires);
  const autres = NAVIGATION_ITEMS.filter((item) => !idsPrioritairesSet.has(item.id));
  return { prioritaires, autres };
}
