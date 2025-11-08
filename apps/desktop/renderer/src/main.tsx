import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) {
  const div = document.createElement('div');
  div.id = 'root';
  document.body.appendChild(div);
  createRoot(div).render(<App />);
} else {
  createRoot(root).render(<App />);
}
