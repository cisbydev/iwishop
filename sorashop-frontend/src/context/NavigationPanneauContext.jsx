import { createContext, useContext, useMemo, useState } from 'react';
import {
  SECTIONS_PRIORITAIRES_MOBILE,
  SECTIONS_PRIORITAIRES_TABLETTE,
  partitionnerNavigation,
} from '../navigation';
import PanneauPlusNavigation from '../components/PanneauPlusNavigation';

const { prioritaires: prioritairesTablette, autres: autresTablette } = partitionnerNavigation(
  SECTIONS_PRIORITAIRES_TABLETTE
);
const { prioritaires: prioritairesMobile, autres: autresMobile } = partitionnerNavigation(
  SECTIONS_PRIORITAIRES_MOBILE
);

const NavigationPanneauContext = createContext(null);

export function NavigationPanneauProvider({
  activeTab,
  onSelect,
  onLogout,
  nomUtilisateur,
  initialeUtilisateur,
  children,
}) {
  const [panneauOuvert, setPanneauOuvert] = useState(null);

  const fermerPanneau = () => setPanneauOuvert(null);

  const selectionnerDepuisPanneau = (id) => {
    onSelect(id);
    fermerPanneau();
  };

  const deconnecterDepuisPanneau = () => {
    fermerPanneau();
    onLogout();
  };

  const value = useMemo(
    () => ({
      activeTab,
      onSelect,
      panneauOuvert,
      ouvrirPanneau: setPanneauOuvert,
      prioritairesTablette,
      prioritairesMobile,
    }),
    [activeTab, onSelect, panneauOuvert]
  );

  return (
    <NavigationPanneauContext.Provider value={value}>
      {children}
      {panneauOuvert && (
        <PanneauPlusNavigation
          items={panneauOuvert === 'tablette' ? autresTablette : autresMobile}
          activeTab={activeTab}
          onSelect={selectionnerDepuisPanneau}
          onLogout={deconnecterDepuisPanneau}
          onClose={fermerPanneau}
          nomUtilisateur={nomUtilisateur}
          initialeUtilisateur={initialeUtilisateur}
        />
      )}
    </NavigationPanneauContext.Provider>
  );
}

export function useNavigationPanneau() {
  const contexte = useContext(NavigationPanneauContext);
  if (!contexte) {
    throw new Error('useNavigationPanneau doit être utilisé à l’intérieur de NavigationPanneauProvider');
  }
  return contexte;
}
