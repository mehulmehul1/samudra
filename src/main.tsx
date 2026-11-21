import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { MedusaStudioApp } from './studio/MedusaStudioApp';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <MedusaStudioApp />
    </React.StrictMode>,
  );
}
