import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global error logger for debugging issues on remote mobile devices
window.addEventListener('error', (event) => {
  console.error('[Window Error]:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]:', event.reason);
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
