/** Application entry point: preferences → theme/lang → services → router. */
// UI font is bundled (no Google Fonts request) so the interface renders the same offline.
import '@fontsource/hind-siliguri/latin-400.css';
import '@fontsource/hind-siliguri/bengali-400.css';
import '@fontsource/hind-siliguri/latin-600.css';
import '@fontsource/hind-siliguri/bengali-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screens.css';
import './print/print.css';

import { applyTheme, applyDisplayPrefs } from './theme/theme.js';
import { applyLanguage } from './i18n/index.js';
import { initNetworkStatus } from './offline/network-status.js';
import { initInstall } from './pwa/install.js';
import { registerServiceWorker } from './pwa/sw-register.js';
import { initFlags } from './features/flags.js';
import { initAuth } from './auth/auth-service.js';
import { startRouter } from './app/router.js';
import { initInstallBanner } from './ui/components/install-banner.js';
import { initUpdateBanner } from './ui/components/update-banner.js';
import { initSearchShortcut } from './ui/components/search-palette.js';
import { on } from './core/events.js';
import { setState } from './core/store.js';

const hadLocalPrefs = (() => { try { return localStorage.getItem('crms.prefs') !== null; } catch { return true; } })();

applyTheme();
applyDisplayPrefs();
applyLanguage();
initNetworkStatus();
initInstall();
initInstallBanner();
initUpdateBanner();
initSearchShortcut();
registerServiceWorker();

// Start/stop background sync of the offline outbox with the signed-in, active account.
let syncedFor = null;
on('state', async (s) => {
  const active = s.authUser && s.profile?.status === 'active' ? s.profile.id : null;
  if (active === syncedFor) return;
  syncedFor = active;
  const sync = await import('./offline/sync-manager.js');
  if (active) {
    sync.startSync({ id: s.profile.id, role: s.profile.role, displayName: s.profile.displayName });
    // First sign-in on a new device: adopt the preferences saved with the account.
    if (!hadLocalPrefs && s.profile.prefs) {
      const { setPref } = await import('./core/prefs.js');
      for (const [k, v] of Object.entries(s.profile.prefs)) { try { setPref(k, v); } catch { /* unknown key */ } }
      applyTheme(); applyDisplayPrefs(); applyLanguage();
    }
  } else sync.stopSync();
});

startRouter();
initFlags();
initAuth().catch((e) => {
  console.error('[auth] initialisation failed', e);
  setState({ authResolved: true, firebaseReady: false });
});
