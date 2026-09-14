import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppIntlProvider } from './i18n';
import { isTauri } from '@tauri-apps/api/core';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppIntlProvider>
      <App />
    </AppIntlProvider>
  </React.StrictMode>,
);

if (!isTauri() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
