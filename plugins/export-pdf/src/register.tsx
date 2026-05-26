import React from 'react';
import { createRoot } from 'react-dom/client';
import type {} from '../../../src/plugins/externalPluginTypes';
import type { MivraPluginApi } from '../../../src/plugins/types';
import { ExportPdfDialog } from './ExportPdfDialog';

const DIALOG_ID = 'export-pdf-dialog';

window.MivraExternalPlugin?.register({
  id: 'export-pdf',
  activate(api: MivraPluginApi): () => void {
    const disposeDialog = api.dialogs.registerRenderer(DIALOG_ID, {
      render({ container }) {
        const root = createRoot(container);
        root.render(<ExportPdfDialog api={api} />);
        return () => root.unmount();
      },
    });

    const disposeButton = api.toolbar.registerButton({
      id: 'open-export-pdf',
      label: 'Export PDF',
      title: 'Экспортировать документ в PDF',
      order: 10,
      onClick: () => api.dialogs.open(DIALOG_ID),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
