import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppIntlProvider } from './i18n';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
ReactDOM.createRoot(root).render(<React.StrictMode><AppIntlProvider><App /></AppIntlProvider></React.StrictMode>);
