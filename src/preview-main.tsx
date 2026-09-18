import React from 'react';
import ReactDOM from 'react-dom/client';
import { gsap } from 'gsap';
import App from './App';
import { AppIntlProvider } from './i18n';
import './styles.css';

type PreviewTimeline = {
  call: (callback: () => void, params: unknown[], position: number) => PreviewTimeline;
  to: (
    target: object | string,
    vars: {
      duration: number;
      ease: string;
      opacity?: number;
      onUpdate?: () => void;
      value?: number;
    },
    position: number,
  ) => PreviewTimeline;
};
declare global {
  interface Window {
    __timelines: Record<string, PreviewTimeline>;
    __JEXFOLD_PREVIEW_LOCALE__?: 'en' | 'ru';
  }
}

const root = document.getElementById('app-root');
if (!root) throw new Error('Missing preview application root');

localStorage.setItem('jexfold.language.v1', window.__JEXFOLD_PREVIEW_LOCALE__ ?? 'ru');
localStorage.setItem(
  'jexfold.preferences.v1',
  JSON.stringify({
    mode: 'jpegToJxl',
    outputDir: '',
    effort: 7,
    performance: 'maximum',
    preserveMetadata: true,
    skipLarger: false,
  }),
);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppIntlProvider>
      <App />
    </AppIntlProvider>
  </React.StrictMode>,
);

const setPreview = (phase: 'empty' | 'queued' | 'converting' | 'complete', progress = 0) => {
  window.__jexfoldPreviewController?.setPhase(phase);
  window.__jexfoldPreviewController?.setProgress(progress);
};

const buildTimeline = () => {
  const tl = gsap.timeline({ paused: true });
  const progress = { value: 0 };

  tl.call(() => setPreview('empty', 0), [], 0)
    .to('.app-shell', { opacity: 0, duration: 0.16, ease: 'power2.out' }, 0.64)
    .call(() => setPreview('queued', 0), [], 0.8)
    .to('.app-shell', { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.8)
    .call(() => setPreview('converting', 0), [], 1.8)
    .to(
      progress,
      {
        value: 100,
        duration: 2.6,
        ease: 'none',
        onUpdate: () => window.__jexfoldPreviewController?.setProgress(progress.value),
      },
      2.2,
    )
    .call(() => setPreview('complete', 100), [], 4.8)
    .to('.app-shell', { opacity: 0, duration: 0.16, ease: 'power2.out' }, 6.18)
    .call(() => setPreview('empty', 0), [], 6.34)
    .to('.app-shell', { opacity: 1, duration: 0.2, ease: 'power2.out' }, 6.38);

  window.__timelines['jexfold-readme-preview'] = tl;
};

setTimeout(() => {
  buildTimeline();
}, 100);
