import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { demarrerSynchronisationAutomatique } from './services/syncEngine'
import { registerSW } from 'virtual:pwa-register'

// PWA Niveau 2 : rejoue automatiquement les ventes créées hors ligne dès que
// le réseau revient. Ne fait rien tant qu'aucune vente n'est en attente.
demarrerSynchronisationAutomatique()

// Enregistrement explicite du service worker (registerType: 'prompt').
// Le SW n'est activé qu'ici, volontairement, plutôt que par l'injection
// automatique de vite-plugin-pwa (injectRegister: false dans vite.config.js) :
// cela permet de contrôler le moment de l'enregistrement et de proposer une
// mise à jour à l'utilisateur au lieu de l'appliquer silencieusement.
// N'a d'effet qu'en build (VitePWA devOptions.enabled === false en dev).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const veutMettreAJour = window.confirm(
      "Une nouvelle version de IwiShop est disponible. Recharger maintenant pour l'installer ?"
    )
    if (veutMettreAJour) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.info('IwiShop est prêt à fonctionner hors ligne.')
  },
  onRegisterError(error) {
    console.error("Échec de l'enregistrement du service worker IwiShop :", error)
  },
})

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
