import './style.css';

type PluginApi = {
  toolbar: {
    registerButton(button: {
      id: string;
      label: string;
      title?: string;
      order?: number;
      onClick: () => void;
    }): () => void;
  };
  dialogs: {
    registerRenderer(id: string, renderer: {
      render(context: { container: HTMLElement }): void | (() => void);
    }): () => void;
    open(id: string): void;
  };
};

declare global {
  interface Window {
    MivraExternalPlugin: {
      register(module: {
        id: string;
        activate(api: PluginApi): void | (() => void);
      }): void;
    };
  }
}

const pluginId = 'markitdown-import';
const dialogId = 'markitdown-import-dialog';

window.MivraExternalPlugin.register({
  id: pluginId,
  activate(api) {
    const disposeDialog = api.dialogs.registerRenderer(dialogId, {
      render({ container }) {
        container.innerHTML = `
          <section class="markitdown-import">
            <h2>Import to Markdown</h2>
            <input type="file" data-markitdown-import-file>
          </section>
        `;
      },
    });

    const disposeButton = api.toolbar.registerButton({
      id: 'markitdown-import-open',
      label: 'Import to Markdown',
      title: 'Импортировать файл в Markdown',
      order: 300,
      onClick: () => api.dialogs.open(dialogId),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
