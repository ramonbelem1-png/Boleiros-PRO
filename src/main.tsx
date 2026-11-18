import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

declare const __APP_VERSION__: string;

// Global error logger for debugging issues on remote mobile devices
window.addEventListener('error', (event) => {
  console.error('[Window Error]:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  const reasonMsg = String((event.reason as any)?.message || event.reason || '');
  if (reasonMsg.includes('WebSocket closed without opened')) {
    event.preventDefault();
    return;
  }
  console.error('[Unhandled Promise Rejection]:', event.reason);
});

// Clean temporary cache-bust query params (?v=... / ?t=...) without reloading
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('v') || url.searchParams.has('t')) {
    url.searchParams.delete('v');
    url.searchParams.delete('t');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }
} catch (_) {}

// Silent version check in production: refreshes automatically if a new build was published
let checkingUpdate = false;
async function checkForNewBuild() {
  if (checkingUpdate) return;
  if (typeof __APP_VERSION__ === 'undefined' || __APP_VERSION__ === 'dev') return;
  checkingUpdate = true;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.version && data.version !== 'dev' && data.version !== __APP_VERSION__) {
      const lastAutoRefresh = Number(sessionStorage.getItem('auto_version_refresh_at') || '0');
      if (Date.now() - lastAutoRefresh < 30000) return;
      sessionStorage.setItem('auto_version_refresh_at', String(Date.now()));

      if ('caches' in window) {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
      window.location.replace(window.location.pathname + '?v=' + Date.now());
    }
  } catch (_) {
    // Ignore transient offline errors
  } finally {
    checkingUpdate = false;
  }
}

checkForNewBuild();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForNewBuild();
  }
});

const rootElement = document.getElementById('root');
if (rootElement) {
  // Clear any chunk auto reload flags on successful mount
  try {
    sessionStorage.removeItem('auto_chunk_reload');
  } catch (_) {}

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
