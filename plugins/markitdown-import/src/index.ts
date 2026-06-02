import { csvFileToMarkdown } from './converters/csv';
import { docxFileToMarkdown } from './converters/docx';
import { pdfFileToMarkdown } from './converters/pdf';
import { textFileToMarkdown } from './converters/text';
import { xlsxFileToMarkdown } from './converters/xlsx';
import './style.css';

export type ApplyMode = 'append' | 'replace' | 'section' | 'copy';

type AssetApi = {
  saveBytes(input: {
    bytes: Uint8Array;
    filename: string;
    alt?: string;
    kind?: 'image' | 'file';
  }): Promise<{ markdown: string }>;
};

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
      render(context: { container: HTMLElement; api: PluginApi }): void | (() => void);
    }): () => void;
    open(id: string): void;
    close(id: string): void;
  };
  document: {
    getContent(): string;
    setContent(content: string): void;
  };
  assets: AssetApi;
};

type ImportState = {
  fileName: string;
  markdown: string;
  loading: boolean;
  error: string;
  mode: ApplyMode;
};

declare global {
  interface Window {
    MivraExternalPlugin?: {
      register(module: {
        id: string;
        activate(api: PluginApi): void | (() => void);
      }): void;
    };
  }
}

const pluginId = 'markitdown-import';
const dialogId = 'markitdown-import-dialog';

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function convertFileToMarkdown(file: File, assets: AssetApi): Promise<string> {
  const extension = extensionOf(file.name);

  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    return textFileToMarkdown(file);
  }
  if (extension === 'csv') {
    return csvFileToMarkdown(file);
  }
  if (extension === 'docx') {
    return docxFileToMarkdown(file, assets);
  }
  if (extension === 'xlsx') {
    return xlsxFileToMarkdown(file);
  }
  if (extension === 'pdf') {
    return pdfFileToMarkdown(file);
  }

  throw new Error(`Формат не поддерживается: .${extension || file.name}`);
}

export function buildAppliedMarkdown(
  current: string,
  imported: string,
  fileName: string,
  mode: Exclude<ApplyMode, 'copy'>,
): string {
  if (mode === 'replace') return imported;

  const trimmedCurrent = current.trimEnd();
  if (mode === 'section') {
    const block = `---\n\n## Импортировано из ${fileName}\n\n${imported}`;
    return trimmedCurrent ? `${trimmedCurrent}\n\n${block}` : block;
  }

  return trimmedCurrent ? `${trimmedCurrent}\n\n${imported}` : imported;
}

function renderDialog(container: HTMLElement, state: ImportState): void {
  container.innerHTML = `
    <div
      class="markitdown-import__overlay"
      data-markitdown-import-overlay
      style="position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 42, 0.45);"
    >
      <section
        class="markitdown-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markitdown-import-title"
        style="display: flex; flex-direction: column; width: min(920px, calc(100vw - 48px)); max-height: min(760px, calc(100vh - 48px)); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-primary); box-shadow: var(--shadow); color: var(--text-primary);"
      >
        <header class="markitdown-import__header">
          <div>
            <h2 id="markitdown-import-title">Import to Markdown</h2>
            <span>${state.fileName ? escapeHtml(state.fileName) : 'DOCX, XLSX, PDF, TXT, MD, CSV'}</span>
          </div>
          <button type="button" class="markitdown-import__close" data-markitdown-import-close>Закрыть</button>
        </header>
        <div class="markitdown-import__body">
          <label class="markitdown-import__field">
            <span>Файл</span>
            <input type="file" accept=".docx,.xlsx,.pdf,.txt,.md,.markdown,.csv" data-markitdown-import-file>
          </label>
          <label class="markitdown-import__field">
            <span>Действие</span>
            <select data-markitdown-import-mode>
              <option value="append"${state.mode === 'append' ? ' selected' : ''}>Вставить в конец</option>
              <option value="section"${state.mode === 'section' ? ' selected' : ''}>Вставить с заголовком</option>
              <option value="replace"${state.mode === 'replace' ? ' selected' : ''}>Заменить документ</option>
              <option value="copy"${state.mode === 'copy' ? ' selected' : ''}>Скопировать</option>
            </select>
          </label>
          ${state.error ? `<p class="markitdown-import__error" data-markitdown-import-error>${escapeHtml(state.error)}</p>` : ''}
          <pre class="markitdown-import__preview" data-markitdown-import-preview>${escapeHtml(
            state.loading ? 'Конвертация...' : state.markdown,
          )}</pre>
        </div>
        <footer class="markitdown-import__footer">
          <button type="button" data-markitdown-import-apply ${state.markdown ? '' : 'disabled'}>Применить</button>
        </footer>
      </section>
    </div>
  `;
}

function renderImportDialog(container: HTMLElement, api: PluginApi): () => void {
  const state: ImportState = {
    fileName: '',
    markdown: '',
    loading: false,
    error: '',
    mode: 'append',
  };

  let disposed = false;

  const wire = () => {
    const input = container.querySelector('[data-markitdown-import-file]') as HTMLInputElement | null;
    const mode = container.querySelector('[data-markitdown-import-mode]') as HTMLSelectElement | null;
    const apply = container.querySelector('[data-markitdown-import-apply]') as HTMLButtonElement | null;
    const close = container.querySelector('[data-markitdown-import-close]') as HTMLButtonElement | null;
    const overlay = container.querySelector('[data-markitdown-import-overlay]') as HTMLDivElement | null;

    input?.addEventListener('change', onFileChange);
    mode?.addEventListener('change', onModeChange);
    apply?.addEventListener('click', onApply);
    close?.addEventListener('click', onClose);
    overlay?.addEventListener('click', onOverlayClick);
  };

  const rerender = () => {
    if (disposed) return;
    renderDialog(container, state);
    wire();
  };

  const onFileChange = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      state.error = 'Файл не выбран';
      rerender();
      return;
    }

    state.fileName = file.name;
    state.loading = true;
    state.error = '';
    state.markdown = '';
    rerender();

    try {
      const markdown = await convertFileToMarkdown(file, api.assets);
      if (!markdown.trim()) {
        throw new Error('Конвертер вернул пустой Markdown');
      }
      state.markdown = markdown;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
      rerender();
    }
  };

  const onModeChange = (event: Event) => {
    state.mode = (event.currentTarget as HTMLSelectElement).value as ApplyMode;
  };

  const onApply = async () => {
    if (!state.markdown) return;
    if (state.mode === 'copy') {
      await navigator.clipboard?.writeText(state.markdown);
      return;
    }

    api.document.setContent(buildAppliedMarkdown(
      api.document.getContent(),
      state.markdown,
      state.fileName,
      state.mode,
    ));
  };

  const onClose = () => {
    api.dialogs.close(dialogId);
  };

  const onOverlayClick = (event: Event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  rerender();

  return () => {
    disposed = true;
    document.removeEventListener('keydown', onKeyDown);
    container.innerHTML = '';
  };
}

export const markitdownImportPlugin = {
  id: pluginId,
  activate(api: PluginApi) {
    const disposeDialog = api.dialogs.registerRenderer(dialogId, {
      render({ container, api }) {
        return renderImportDialog(container, api);
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
};

window.MivraExternalPlugin?.register(markitdownImportPlugin);
