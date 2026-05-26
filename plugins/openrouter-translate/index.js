(function () {
  const pluginId = 'openrouter-translate';
  const dialogId = 'openrouter-translate-dialog';
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const minDialogSize = { width: 720, height: 520 };
  const maxDialogMargin = 28;
  const storageKeys = {
    apiKey: 'mivra.openrouterTranslate.apiKey',
    rememberKey: 'mivra.openrouterTranslate.rememberKey',
    model: 'mivra.openrouterTranslate.model',
    direction: 'mivra.openrouterTranslate.direction',
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fileNameFromPath(path) {
    if (!path) return 'Без имени';
    return path.split(/[\\/]/).pop() || path;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function readStoredValue(key, fallback) {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeStoredValue(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
    }
  }

  function removeStoredValue(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
    }
  }

  function createInitialState(api) {
    const rememberKey = readStoredValue(storageKeys.rememberKey, 'false') === 'true';
    const defaultDirection = api.settings?.getLanguage?.() === 'en' ? 'ru-en' : 'en-ru';

    return {
      apiKey: rememberKey ? readStoredValue(storageKeys.apiKey, '') : '',
      rememberKey,
      model: readStoredValue(storageKeys.model, 'openai/gpt-4o-mini'),
      direction: readStoredValue(storageKeys.direction, defaultDirection),
      result: '',
      error: '',
      status: 'Готов к переводу',
      loading: false,
      applied: false,
    };
  }

  function directionLabel(direction) {
    return direction === 'ru-en' ? 'Русский → English' : 'English → Русский';
  }

  function directionInstruction(direction) {
    if (direction === 'ru-en') {
      return 'Translate the Markdown document from Russian to English.';
    }
    return 'Translate the Markdown document from English to Russian.';
  }

  function buildRequestBody(markdown, state) {
    return {
      model: state.model.trim(),
      temperature: 0.1,
      max_completion_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: [
            directionInstruction(state.direction),
            'Return only the translated Markdown document.',
            'Preserve Markdown structure and formatting.',
            'Do not translate fenced code blocks, inline code, URLs, Markdown syntax, HTML tags, identifiers, file paths, package names, or command names.',
            'Translate headings, paragraphs, list items, table text, blockquotes, and image alt text.',
            'Do not add explanations, summaries, notes, or extra wrappers.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: markdown,
        },
      ],
    };
  }

  function extractContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  async function readErrorMessage(response) {
    try {
      const data = await response.json();
      return data?.error?.message || data?.message || JSON.stringify(data);
    } catch {
      try {
        return await response.text();
      } catch {
        return '';
      }
    }
  }

  async function translateWithOpenRouter(markdown, state) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mivra.local',
          'X-OpenRouter-Title': 'Mivra OpenRouter Translate',
        },
        body: JSON.stringify(buildRequestBody(markdown, state)),
      });
    } catch (error) {
      const details = error instanceof Error && error.message ? ` (${error.message})` : '';
      throw new Error(`Не удалось выполнить сетевой запрос к OpenRouter${details}. Проверьте интернет, VPN/антивирус и разрешение https://openrouter.ai в connect-src приложения.`);
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(`OpenRouter ${response.status}: ${message || response.statusText}`);
    }

    const data = await response.json();
    const content = extractContent(data);
    if (!content) {
      throw new Error('OpenRouter вернул пустой перевод');
    }
    return content;
  }

  function markdownToHtml(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let inCodeFence = false;
    let inList = false;

    function closeList() {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^\s*(```|~~~)/.test(rawLine)) {
        closeList();
        inCodeFence = !inCodeFence;
        html.push(`<pre>${escapeHtml(rawLine)}</pre>`);
        continue;
      }
      if (inCodeFence) {
        html.push(`<pre>${escapeHtml(rawLine)}</pre>`);
        continue;
      }
      if (!line) {
        closeList();
        continue;
      }

      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 1, 4);
        html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
        continue;
      }

      const listItem = /^[-*]\s+(.+)$/.exec(line) || /^\d+\.\s+(.+)$/.exec(line);
      if (listItem) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${escapeHtml(listItem[1])}</li>`);
        continue;
      }

      closeList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }

    closeList();
    return html.join('');
  }

  function getDocumentStats(api) {
    const markdown = api.document.getContent();
    return {
      markdown,
      fileName: fileNameFromPath(api.document.getFilePath()),
      chars: markdown.length,
      lines: markdown ? markdown.split(/\r?\n/).length : 0,
    };
  }

  function maxDialogSize() {
    return {
      width: Math.max(360, window.innerWidth - maxDialogMargin * 2),
      height: Math.max(360, window.innerHeight - maxDialogMargin * 2),
    };
  }

  function clampSize(size) {
    const maxSize = maxDialogSize();
    const minWidth = Math.min(minDialogSize.width, maxSize.width);
    const minHeight = Math.min(minDialogSize.height, maxSize.height);

    return {
      width: Math.min(Math.max(minWidth, size.width), maxSize.width),
      height: Math.min(Math.max(minHeight, size.height), maxSize.height),
    };
  }

  function applyDialogSize(dialog, size) {
    dialog.style.width = `${Math.round(size.width)}px`;
    dialog.style.height = `${Math.round(size.height)}px`;
    dialog.style.maxWidth = `${maxDialogSize().width}px`;
    dialog.style.maxHeight = `${maxDialogSize().height}px`;
  }

  function makeDialogResizable(dialog, handle, getSize, setSize) {
    let resize = null;

    const onPointerMove = (event) => {
      if (!resize) return;
      const nextSize = clampSize({
        width: resize.width + event.clientX - resize.clientX,
        height: resize.height + event.clientY - resize.clientY,
      });

      setSize(nextSize);
      applyDialogSize(dialog, nextSize);
    };

    const stopResize = () => {
      if (!resize) return;
      resize = null;
      dialog.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };

    const startResize = (event) => {
      if (event.button !== 0) return;
      const currentSize = getSize() ?? {
        width: dialog.offsetWidth || 1080,
        height: dialog.offsetHeight || 720,
      };

      resize = {
        clientX: event.clientX,
        clientY: event.clientY,
        width: currentSize.width,
        height: currentSize.height,
      };

      dialog.classList.add('is-resizing');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
      event.preventDefault();
      event.stopPropagation();
    };

    handle.addEventListener('pointerdown', startResize);

    return () => {
      stopResize();
      handle.removeEventListener('pointerdown', startResize);
    };
  }

  function renderTranslate(container, api, state) {
    const stats = getDocumentStats(api);
    const directionButtons = ['en-ru', 'ru-en'].map((direction) => `
      <button
        class="openrouter-translate-segment ${state.direction === direction ? 'is-active' : ''}"
        type="button"
        data-openrouter-translate-direction="${direction}"
      >${directionLabel(direction)}</button>
    `).join('');
    const statusText = state.loading
      ? 'Запрос к OpenRouter...'
      : state.result
        ? `Готово · ${formatNumber(state.result.length)} символов · ${directionLabel(state.direction)}`
        : state.status;
    const resultHtml = state.result
      ? markdownToHtml(state.result)
      : '<p class="openrouter-translate-empty">Перевод появится здесь после запроса к OpenRouter.</p>';

    container.innerHTML = `
      <div class="openrouter-translate-overlay">
        <section class="openrouter-translate-dialog" role="dialog" aria-modal="true" aria-labelledby="openrouter-translate-title">
          <header class="openrouter-translate-header">
            <div class="openrouter-translate-title">
              <h2 id="openrouter-translate-title">OpenRouter Translate</h2>
              <p>Перевод текущего Markdown-документа через выбранную модель OpenRouter</p>
            </div>
            <button class="openrouter-translate-close" type="button" data-openrouter-translate-close>Закрыть</button>
          </header>

          <form class="openrouter-translate-body" data-openrouter-translate-form>
            <aside class="openrouter-translate-settings">
              <label class="openrouter-translate-field">
                <span>OpenRouter API key</span>
                <input data-openrouter-translate-key type="password" value="${escapeHtml(state.apiKey)}" autocomplete="off">
              </label>

              <label class="openrouter-translate-field">
                <span>Модель</span>
                <input data-openrouter-translate-model type="text" value="${escapeHtml(state.model)}">
              </label>

              <div class="openrouter-translate-field">
                <span>Направление</span>
                <div class="openrouter-translate-segments" role="group" aria-label="Направление перевода">
                  ${directionButtons}
                </div>
              </div>

              <label class="openrouter-translate-check">
                <input data-openrouter-translate-remember type="checkbox" ${state.rememberKey ? 'checked' : ''}>
                <span>Запомнить ключ на этом компьютере</span>
              </label>

              <div class="openrouter-translate-stats">
                <div class="openrouter-translate-stat-row">
                  <span>Документ</span>
                  <strong
                    class="openrouter-translate-stat-value"
                    data-openrouter-translate-document-name
                    title="${escapeHtml(stats.fileName)}"
                  >${escapeHtml(stats.fileName)}</strong>
                </div>
                <div class="openrouter-translate-stat-row">
                  <span>Объём</span>
                  <strong class="openrouter-translate-stat-value">${formatNumber(stats.chars)} символов</strong>
                </div>
                <div class="openrouter-translate-stat-row">
                  <span>Строки</span>
                  <strong class="openrouter-translate-stat-value">${formatNumber(stats.lines)}</strong>
                </div>
              </div>

              <div class="openrouter-translate-actions">
                <button class="openrouter-translate-primary" type="submit" ${state.loading ? 'disabled' : ''}>
                  ${state.loading ? 'Перевод...' : 'Перевести'}
                </button>
                <button type="button" data-openrouter-translate-apply ${state.result && !state.loading ? '' : 'disabled'}>
                  ${state.applied ? 'Применено' : 'Применить перевод'}
                </button>
              </div>
            </aside>

            <section class="openrouter-translate-result">
              <div class="openrouter-translate-result-toolbar">
                <div class="openrouter-translate-status ${state.error ? 'is-error' : ''}">
                  <span></span>
                  <strong>${escapeHtml(statusText)}</strong>
                </div>
                <div class="openrouter-translate-result-actions">
                  <button type="button" data-openrouter-translate-copy ${state.result ? '' : 'disabled'}>Скопировать</button>
                  <button type="button" data-openrouter-translate-clear ${state.result || state.error ? '' : 'disabled'}>Очистить</button>
                </div>
              </div>

              <div class="openrouter-translate-result-content" data-openrouter-translate-result>
                ${resultHtml}
              </div>

              <div class="openrouter-translate-note ${state.error ? 'is-error' : ''}">
                ${escapeHtml(state.error || 'Перевод не применяется автоматически. Проверьте результат и нажмите «Применить перевод».')}
              </div>
            </section>
          </form>

          <button
            class="openrouter-translate-resize"
            type="button"
            data-openrouter-translate-resize
            aria-label="Изменить размер окна"
          ></button>
        </section>
      </div>
    `;

    return stats;
  }

  function syncStateFromForm(container, state) {
    const apiKeyInput = container.querySelector('[data-openrouter-translate-key]');
    const modelInput = container.querySelector('[data-openrouter-translate-model]');
    const rememberInput = container.querySelector('[data-openrouter-translate-remember]');

    if (apiKeyInput instanceof HTMLInputElement) state.apiKey = apiKeyInput.value;
    if (modelInput instanceof HTMLInputElement) state.model = modelInput.value.trim();
    if (rememberInput instanceof HTMLInputElement) state.rememberKey = rememberInput.checked;
  }

  function persistSettings(state) {
    writeStoredValue(storageKeys.model, state.model);
    writeStoredValue(storageKeys.direction, state.direction);
    writeStoredValue(storageKeys.rememberKey, state.rememberKey ? 'true' : 'false');

    if (state.rememberKey && state.apiKey.trim()) {
      writeStoredValue(storageKeys.apiKey, state.apiKey.trim());
    } else {
      removeStoredValue(storageKeys.apiKey);
    }
  }

  window.MivraExternalPlugin.register({
    id: pluginId,
    activate(api) {
      const disposeDialog = api.dialogs.registerRenderer(dialogId, {
        render({ container, api }) {
          const state = createInitialState(api);
          let resizeCleanup = null;
          let dialogSize = null;
          let stats = null;

          const close = () => api.dialogs.close(dialogId);

          const rerender = () => {
            resizeCleanup?.();
            stats = renderTranslate(container, api, state);

            const dialog = container.querySelector('.openrouter-translate-dialog');
            const resizeHandle = container.querySelector('[data-openrouter-translate-resize]');
            if (dialog instanceof HTMLElement) {
              dialogSize = clampSize(dialogSize ?? {
                width: dialog.offsetWidth || 1080,
                height: dialog.offsetHeight || 720,
              });
              applyDialogSize(dialog, dialogSize);

              if (resizeHandle instanceof HTMLElement) {
                resizeCleanup = makeDialogResizable(
                  dialog,
                  resizeHandle,
                  () => dialogSize,
                  (nextSize) => {
                    dialogSize = nextSize;
                  },
                );
              }
            }

            container.querySelector('[data-openrouter-translate-close]')?.addEventListener('click', close);
            container.querySelector('[data-openrouter-translate-form]')?.addEventListener('submit', onSubmit);
            container.querySelector('[data-openrouter-translate-apply]')?.addEventListener('click', onApply);
            container.querySelector('[data-openrouter-translate-copy]')?.addEventListener('click', onCopy);
            container.querySelector('[data-openrouter-translate-clear]')?.addEventListener('click', onClear);
            container.querySelectorAll('[data-openrouter-translate-direction]').forEach((button) => {
              button.addEventListener('click', onDirectionClick);
            });
          };

          const onSubmit = async (event) => {
            event.preventDefault();
            syncStateFromForm(container, state);

            if (!state.apiKey.trim()) {
              state.error = 'Введите OpenRouter API key.';
              state.status = 'Ошибка настройки';
              rerender();
              return;
            }
            if (!state.model.trim()) {
              state.error = 'Введите id модели OpenRouter.';
              state.status = 'Ошибка настройки';
              rerender();
              return;
            }

            persistSettings(state);
            state.loading = true;
            state.applied = false;
            state.error = '';
            state.status = 'Запрос к OpenRouter...';
            rerender();

            try {
              const result = await translateWithOpenRouter(stats?.markdown ?? api.document.getContent(), state);
              state.result = result;
              state.status = 'Готово';
              state.error = '';
            } catch (error) {
              state.error = error instanceof Error ? error.message : String(error);
              state.status = 'Ошибка OpenRouter';
            } finally {
              state.loading = false;
              rerender();
            }
          };

          const onDirectionClick = (event) => {
            const button = event.currentTarget;
            if (!(button instanceof HTMLElement)) return;
            syncStateFromForm(container, state);
            state.direction = button.dataset.openrouterTranslateDirection || 'en-ru';
            state.applied = false;
            persistSettings(state);
            rerender();
          };

          const onApply = () => {
            if (!state.result || state.loading) return;
            api.document.setContent(state.result);
            state.applied = true;
            state.status = 'Перевод применён к документу';
            state.error = '';
            rerender();
          };

          const onCopy = async () => {
            if (!state.result) return;
            try {
              await navigator.clipboard?.writeText(state.result);
              state.status = 'Скопировано в буфер обмена';
              rerender();
            } catch {
              state.error = 'Не удалось скопировать перевод в буфер обмена.';
              rerender();
            }
          };

          const onClear = () => {
            state.result = '';
            state.error = '';
            state.applied = false;
            state.status = 'Готов к переводу';
            rerender();
          };

          const unsubscribe = api.document.subscribeContent(() => {
            if (!state.loading) {
              rerender();
            }
          });

          rerender();

          return () => {
            unsubscribe();
            resizeCleanup?.();
            container.innerHTML = '';
          };
        },
      });

      const disposeButton = api.toolbar.registerButton({
        id: 'openrouter-translate-open',
        label: 'Перевод',
        title: 'Перевести текущий Markdown через OpenRouter',
        order: 310,
        onClick: () => api.dialogs.open(dialogId),
      });

      return () => {
        disposeButton();
        disposeDialog();
      };
    },
  });
}());
