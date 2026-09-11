import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { demarrerSynchronisationAutomatique } from './services/syncEngine'

// PWA Niveau 2 : rejoue automatiquement les ventes créées hors ligne dès que
// le réseau revient. Ne fait rien tant qu'aucune vente n'est en attente.
demarrerSynchronisationAutomatique()

// Demande au navigateur de ne pas éligibiliser le stockage de cette origine
// (IndexedDB comprise) à une purge automatique sous pression d'espace disque -
// une vente en attente ne doit jamais disparaître silencieusement. L'API est
// absente de certains navigateurs et la permission peut être refusée : dans
// les deux cas, on continue sans bloquer le démarrage de l'application.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
