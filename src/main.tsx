import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { EditorProvider } from './components/Editor/EditorContext';
import { ToastContainer } from './components/Toast/ToastContainer';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <EditorProvider>
      <App />
      <ToastContainer />
    </EditorProvider>
  </React.StrictMode>,
);
