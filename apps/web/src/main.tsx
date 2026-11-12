import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initApi } from './api/services';
import { App } from './app/App';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

void initApi().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
