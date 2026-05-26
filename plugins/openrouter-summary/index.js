(function () {
  const pluginId = 'openrouter-summary';
  const dialogId = 'openrouter-summary-dialog';
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const minDialogSize = { width: 720, height: 520 };
  const maxDialogMargin = 28;
  const storageKeys = {
    apiKey: 'mivra.openrouterSummary.apiKey',
    rememberKey: 'mivra.openrouterSummary.rememberKey',
    model: 'mivra.openrouterSummary.model',
    mode: 'mivra.openrouterSummary.mode',
    language: 'mivra.openrouterSummary.language',
    volume: 'mivra.openrouterSummary.volume',
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

  function countHeadings(markdown) {
    let inCodeFence = false;
    let count = 0;
    const lines = markdown.split(/\r?\n/);

    for (const line of lines) {
      if (/^\s*(```|~~~)/.test(line)) {
        inCodeFence = !inCodeFence;
        continue;
      }
      if (!inCodeFence && /^#{1,6}\s+/.test(line)) {
        count += 1;
      }
    }

    return count;
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
      // localStorage может быть недоступен в некоторых WebView-режимах.
    }
  }

  function removeStoredValue(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // localStorage может быть недоступен в некоторых WebView-режимах.
    }
  }

  function createInitialState(api) {
    const rememberKey = readStoredValue(storageKeys.rememberKey, 'false') === 'true';

    return {
      apiKey: rememberKey ? readStoredValue(storageKeys.apiKey, '') : '',
      rememberKey,
      model: readStoredValue(storageKeys.model, 'openai/gpt-4o-mini'),
      mode: readStoredValue(storageKeys.mode, 'brief'),
      language: readStoredValue(storageKeys.language, api.settings?.getLanguage?.() === 'en' ? 'en' : 'ru'),
      volume: Number(readStoredValue(storageKeys.volume, '3')) || 3,
      result: '',
      error: '',
      status: 'Готов к суммаризации',
      loading: false,
      copied: false,
    };
  }

  function modeLabel(mode) {
    if (mode === 'detailed') return 'Подробно';
    if (mode === 'actions') return 'Действия';
    return 'Кратко';
  }

  function languageInstruction(language) {
    if (language === 'en') return 'Answer in English.';
    if (language === 'document') return 'Answer in the same language as the document.';
    return 'Отвечай на русском языке.';
  }

  function volumeInstruction(volume) {
    if (volume <= 1) return 'Сделай очень короткую выжимку в 3-5 предложений.';
    if (volume === 2) return 'Сделай компактную выжимку с ключевыми пунктами.';
    if (volume === 4) return 'Сделай расширенное резюме с контекстом и важными деталями.';
    if (volume >= 5) return 'Сделай максимально подробное структурированное резюме.';
    return 'Сделай среднее по объёму структурированное резюме.';
  }

  function modeInstruction(mode) {
    if (mode === 'detailed') {
      return 'Верни подробное структурированное резюме с разделами: краткий смысл, ключевые тезисы, риски, важные детали.';
    }
    if (mode === 'actions') {
      return 'Верни список практических действий и решений. Группируй по приоритету, не добавляй лишнюю теорию.';
    }
    return 'Верни короткую сводку, ключевые выводы и что важно проверить дальше.';
  }

  function buildRequestBody(markdown, state) {
    return {
      model: state.model.trim(),
      temperature: 0.2,
      max_completion_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: [
            'Ты помогаешь суммаризировать Markdown-документы внутри редактора Mivra.',
            'Сохраняй точность, не выдумывай факты, явно отделяй выводы от исходного содержания.',
            languageInstruction(state.language),
            volumeInstruction(state.volume),
            modeInstruction(state.mode),
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Суммаризируй этот Markdown-документ:\n\n${markdown}`,
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

  async function summarizeWithOpenRouter(markdown, state) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mivra.local',
          'X-OpenRouter-Title': 'Mivra OpenRouter Summary',
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
      throw new Error('OpenRouter вернул пустой ответ');
    }
    return content;
  }

  function markdownToHtml(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let inList = false;

    function closeList() {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
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

      const listItem = /^[-*]\s+(.+)$/.exec(line);
      if (listItem) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${escapeHtml(listItem[1])}</li>`);
        continue;
      }

      const numberedItem = /^\d+\.\s+(.+)$/.exec(line);
      if (numberedItem) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${escapeHtml(numberedItem[1])}</li>`);
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
      headings: countHeadings(markdown),
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
        width: dialog.offsetWidth || 1180,
        height: dialog.offsetHeight || 760,
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

  function renderSummary(container, api, state) {
    const stats = getDocumentStats(api);
    const statusText = state.loading
      ? 'Запрос к OpenRouter...'
      : state.result
        ? `Готово · ${formatNumber(state.result.length)} символов · ${state.model}`
        : state.status;
    const modeButtons = ['brief', 'detailed', 'actions'].map((mode) => `
      <button
        class="openrouter-summary-segment ${state.mode === mode ? 'is-active' : ''}"
        type="button"
        data-openrouter-summary-mode="${mode}"
      >${modeLabel(mode)}</button>
    `).join('');
    const resultHtml = state.result
      ? markdownToHtml(state.result)
      : '<p class="openrouter-summary-empty">Результат появится здесь после запроса к OpenRouter.</p>';

    container.innerHTML = `
      <div class="openrouter-summary-overlay">
        <section class="openrouter-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="openrouter-summary-title">
          <header class="openrouter-summary-header">
            <div class="openrouter-summary-title">
              <h2 id="openrouter-summary-title">OpenRouter Summary</h2>
              <p>Суммаризация текущего Markdown-файла через выбранную модель OpenRouter</p>
            </div>
            <button class="openrouter-summary-close" type="button" data-openrouter-summary-close>Закрыть</button>
          </header>

          <form class="openrouter-summary-body" data-openrouter-summary-form>
            <aside class="openrouter-summary-settings">
              <label class="openrouter-summary-field">
                <span>OpenRouter API key</span>
                <input data-openrouter-summary-key type="password" value="${escapeHtml(state.apiKey)}" autocomplete="off">
              </label>

              <label class="openrouter-summary-field">
                <span>Модель</span>
                <input data-openrouter-summary-model type="text" value="${escapeHtml(state.model)}">
              </label>

              <div class="openrouter-summary-field">
                <span>Формат результата</span>
                <div class="openrouter-summary-segments" role="group" aria-label="Формат результата">
                  ${modeButtons}
                </div>
              </div>

              <label class="openrouter-summary-field">
                <span>Язык ответа</span>
                <select data-openrouter-summary-language>
                  <option value="ru" ${state.language === 'ru' ? 'selected' : ''}>Русский</option>
                  <option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option>
                  <option value="document" ${state.language === 'document' ? 'selected' : ''}>Как в документе</option>
                </select>
              </label>

              <label class="openrouter-summary-field">
                <span>Объём</span>
                <span class="openrouter-summary-range">
                  <input data-openrouter-summary-volume type="range" min="1" max="5" value="${state.volume}">
                  <strong data-openrouter-summary-volume-label>${state.volume}/5</strong>
                </span>
              </label>

              <label class="openrouter-summary-check">
                <input data-openrouter-summary-remember type="checkbox" ${state.rememberKey ? 'checked' : ''}>
                <span>Запомнить ключ на этом компьютере</span>
              </label>

              <div class="openrouter-summary-stats">
                <div class="openrouter-summary-stat-row">
                  <span>Документ</span>
                  <strong
                    class="openrouter-summary-stat-value"
                    data-openrouter-summary-document-name
                    title="${escapeHtml(stats.fileName)}"
                  >${escapeHtml(stats.fileName)}</strong>
                </div>
                <div class="openrouter-summary-stat-row">
                  <span>Объём</span>
                  <strong class="openrouter-summary-stat-value">${formatNumber(stats.chars)} символов</strong>
                </div>
                <div class="openrouter-summary-stat-row">
                  <span>Заголовки</span>
                  <strong class="openrouter-summary-stat-value">${formatNumber(stats.headings)}</strong>
                </div>
              </div>

              <div class="openrouter-summary-actions">
                <button class="openrouter-summary-primary" type="submit" ${state.loading ? 'disabled' : ''}>
                  ${state.loading ? 'Суммаризация...' : 'Суммаризировать'}
                </button>
              </div>
            </aside>

            <section class="openrouter-summary-result">
              <div class="openrouter-summary-result-toolbar">
                <div class="openrouter-summary-status ${state.error ? 'is-error' : ''}">
                  <span></span>
                  <strong>${escapeHtml(statusText)}</strong>
                </div>
                <div class="openrouter-summary-result-actions">
                  <button type="button" data-openrouter-summary-copy ${state.result ? '' : 'disabled'}>Скопировать</button>
                  <button type="button" data-openrouter-summary-clear ${state.result || state.error ? '' : 'disabled'}>Очистить</button>
                </div>
              </div>

              <div class="openrouter-summary-result-content" data-openrouter-summary-result>
                ${resultHtml}
              </div>

              <div class="openrouter-summary-note ${state.error ? 'is-error' : ''}">
                ${escapeHtml(state.error || 'Ошибки OpenRouter 401, 402, 429 и сетевые таймауты будут отображаться здесь.')}
              </div>
            </section>
          </form>

          <button
            class="openrouter-summary-resize"
            type="button"
            data-openrouter-summary-resize
            aria-label="Изменить размер окна"
          ></button>
        </section>
      </div>
    `;

    return stats;
  }

  function syncStateFromForm(container, state) {
    const apiKeyInput = container.querySelector('[data-openrouter-summary-key]');
    const modelInput = container.querySelector('[data-openrouter-summary-model]');
    const languageSelect = container.querySelector('[data-openrouter-summary-language]');
    const volumeInput = container.querySelector('[data-openrouter-summary-volume]');
    const rememberInput = container.querySelector('[data-openrouter-summary-remember]');

    if (apiKeyInput instanceof HTMLInputElement) state.apiKey = apiKeyInput.value;
    if (modelInput instanceof HTMLInputElement) state.model = modelInput.value.trim();
    if (languageSelect instanceof HTMLSelectElement) state.language = languageSelect.value;
    if (volumeInput instanceof HTMLInputElement) state.volume = Number(volumeInput.value) || 3;
    if (rememberInput instanceof HTMLInputElement) state.rememberKey = rememberInput.checked;
  }

  function persistSettings(state) {
    writeStoredValue(storageKeys.model, state.model);
    writeStoredValue(storageKeys.mode, state.mode);
    writeStoredValue(storageKeys.language, state.language);
    writeStoredValue(storageKeys.volume, String(state.volume));
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
            stats = renderSummary(container, api, state);

            const dialog = container.querySelector('.openrouter-summary-dialog');
            const resizeHandle = container.querySelector('[data-openrouter-summary-resize]');
            if (dialog instanceof HTMLElement) {
              if (!dialogSize) {
                dialogSize = clampSize({
                  width: dialog.offsetWidth || 1180,
                  height: dialog.offsetHeight || 760,
                });
              } else {
                dialogSize = clampSize(dialogSize);
              }
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

            container.querySelector('[data-openrouter-summary-close]')?.addEventListener('click', close);
            container.querySelector('[data-openrouter-summary-form]')?.addEventListener('submit', onSubmit);
            container.querySelector('[data-openrouter-summary-copy]')?.addEventListener('click', onCopy);
            container.querySelector('[data-openrouter-summary-clear]')?.addEventListener('click', onClear);
            container.querySelector('[data-openrouter-summary-volume]')?.addEventListener('input', onVolumeInput);
            container.querySelectorAll('[data-openrouter-summary-mode]').forEach((button) => {
              button.addEventListener('click', onModeClick);
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
            state.error = '';
            state.status = 'Запрос к OpenRouter...';
            rerender();

            try {
              const result = await summarizeWithOpenRouter(stats?.markdown ?? api.document.getContent(), state);
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

          const onModeClick = (event) => {
            const button = event.currentTarget;
            if (!(button instanceof HTMLElement)) return;
            syncStateFromForm(container, state);
            state.mode = button.dataset.openrouterSummaryMode || 'brief';
            persistSettings(state);
            rerender();
          };

          const onVolumeInput = (event) => {
            if (!(event.currentTarget instanceof HTMLInputElement)) return;
            const label = container.querySelector('[data-openrouter-summary-volume-label]');
            if (label) {
              label.textContent = `${event.currentTarget.value}/5`;
            }
          };

          const onCopy = async () => {
            if (!state.result) return;
            try {
              await navigator.clipboard?.writeText(state.result);
              state.status = 'Скопировано в буфер обмена';
              rerender();
            } catch {
              state.error = 'Не удалось скопировать результат в буфер обмена.';
              rerender();
            }
          };

          const onClear = () => {
            state.result = '';
            state.error = '';
            state.status = 'Готов к суммаризации';
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
        id: 'openrouter-summary-open',
        label: 'Суммаризация',
        title: 'Суммаризировать текущий Markdown через OpenRouter',
        order: 300,
        onClick: () => api.dialogs.open(dialogId),
      });

      return () => {
        disposeButton();
        disposeDialog();
      };
    },
  });
}());
