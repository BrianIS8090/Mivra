(function () {
  const pluginId = 'markdown-toc';
  const dialogId = 'markdown-toc-dialog';
  const minDialogSize = { width: 360, height: 260 };
  const maxDialogMargin = 24;

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

  function parseHeadings(markdown) {
    const headings = [];
    let inCodeFence = false;
    const lines = markdown.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (/^\s*(```|~~~)/.test(line)) {
        inCodeFence = !inCodeFence;
        continue;
      }

      if (inCodeFence) continue;

      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!match) continue;

      headings.push({
        index: headings.length,
        level: match[1].length,
        title: match[2].trim(),
        line: index + 1,
      });
    }

    return headings;
  }

  function normalizeHeadingText(value) {
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function findVisualHeading(heading) {
    const selector = '.editor-root .ProseMirror h1, .editor-root .ProseMirror h2, .editor-root .ProseMirror h3, .editor-root .ProseMirror h4, .editor-root .ProseMirror h5, .editor-root .ProseMirror h6';
    const nodes = Array.from(document.querySelectorAll(selector));
    const exact = nodes.find((node) => {
      const level = Number(node.tagName.slice(1));
      return level === heading.level && normalizeHeadingText(node.textContent) === normalizeHeadingText(heading.title);
    });

    return exact ?? nodes[heading.index] ?? null;
  }

  function flashTarget(node) {
    node.classList.add('markdown-toc-target-flash');
    window.setTimeout(() => {
      node.classList.remove('markdown-toc-target-flash');
    }, 1400);
  }

  function scrollSourceToLine(line) {
    const textarea = document.querySelector('.editor-source');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;

    const lines = textarea.value.split(/\r?\n/);
    const offset = lines.slice(0, Math.max(0, line - 1)).reduce((sum, current) => sum + current.length + 1, 0);
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 22;

    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (line - 4) * lineHeight);
    return true;
  }

  function scrollToHeading(heading) {
    if (scrollSourceToLine(heading.line)) return true;

    const visualHeading = findVisualHeading(heading);
    if (!visualHeading) return false;

    visualHeading.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashTarget(visualHeading);

    if (visualHeading instanceof HTMLElement) {
      visualHeading.setAttribute('tabindex', '-1');
      visualHeading.focus({ preventScroll: true });
    }

    return true;
  }

  function clampPosition(position, dialog) {
    const width = dialog.offsetWidth || 360;
    const height = dialog.offsetHeight || 240;
    const margin = 12;

    return {
      left: Math.min(Math.max(margin, position.left), Math.max(margin, window.innerWidth - width - margin)),
      top: Math.min(Math.max(margin, position.top), Math.max(margin, window.innerHeight - height - margin)),
    };
  }

  function maxDialogSize() {
    return {
      width: Math.max(minDialogSize.width, window.innerWidth - maxDialogMargin * 2),
      height: Math.max(minDialogSize.height, window.innerHeight - maxDialogMargin * 2),
    };
  }

  function clampSize(size) {
    const maxSize = maxDialogSize();

    return {
      width: Math.min(Math.max(minDialogSize.width, size.width), maxSize.width),
      height: Math.min(Math.max(minDialogSize.height, size.height), maxSize.height),
    };
  }

  function applyDialogSize(dialog, size) {
    dialog.style.width = `${Math.round(size.width)}px`;
    dialog.style.height = `${Math.round(size.height)}px`;
    dialog.style.maxWidth = `${maxDialogSize().width}px`;
    dialog.style.maxHeight = `${maxDialogSize().height}px`;
  }

  function applyDialogPosition(dialog, position) {
    dialog.style.left = `${Math.round(position.left)}px`;
    dialog.style.top = `${Math.round(position.top)}px`;
  }

  function centerDialog(dialog) {
    const rect = dialog.getBoundingClientRect();
    const width = rect.width || dialog.offsetWidth || 720;
    const height = rect.height || dialog.offsetHeight || 520;
    const position = clampPosition({
      left: (window.innerWidth - width) / 2,
      top: (window.innerHeight - height) / 2,
    }, dialog);
    applyDialogPosition(dialog, position);
    return position;
  }

  function makeDialogDraggable(dialog, handle, getPosition, setPosition) {
    let drag = null;

    const onPointerMove = (event) => {
      if (!drag) return;
      const next = clampPosition({
        left: drag.left + event.clientX - drag.clientX,
        top: drag.top + event.clientY - drag.clientY,
      }, dialog);

      setPosition(next);
      applyDialogPosition(dialog, next);
    };

    const stopDrag = () => {
      if (!drag) return;
      drag = null;
      dialog.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };

    const startDrag = (event) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button')) return;

      const currentPosition = getPosition() ?? centerDialog(dialog);
      drag = {
        clientX: event.clientX,
        clientY: event.clientY,
        left: currentPosition.left,
        top: currentPosition.top,
      };

      dialog.classList.add('is-dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('pointercancel', stopDrag);
      event.preventDefault();
    };

    handle.addEventListener('pointerdown', startDrag);

    return () => {
      stopDrag();
      handle.removeEventListener('pointerdown', startDrag);
    };
  }

  function makeDialogResizable(dialog, handle, getPosition, setPosition, getSize, setSize) {
    let resize = null;

    const onPointerMove = (event) => {
      if (!resize) return;

      const nextSize = clampSize({
        width: resize.width + event.clientX - resize.clientX,
        height: resize.height + event.clientY - resize.clientY,
      });
      const currentPosition = getPosition() ?? { left: dialog.offsetLeft, top: dialog.offsetTop };
      const nextPosition = clampPosition(currentPosition, dialog);

      setSize(nextSize);
      applyDialogSize(dialog, nextSize);
      setPosition(nextPosition);
      applyDialogPosition(dialog, nextPosition);
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
        width: dialog.offsetWidth,
        height: dialog.offsetHeight,
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

  function renderToc(container, api) {
    const content = api.document.getContent();
    const fileName = fileNameFromPath(api.document.getFilePath());
    const headings = parseHeadings(content);

    const items = headings.length === 0
      ? '<p class="markdown-toc-empty">В документе нет Markdown-заголовков.</p>'
      : `<ol class="markdown-toc-list">${headings.map((heading) => `
        <li class="markdown-toc-item markdown-toc-level-${heading.level}">
          <button
            type="button"
            class="markdown-toc-link"
            data-markdown-toc-index="${heading.index}"
            title="Перейти к заголовку: ${escapeHtml(heading.title)}"
          >
            <span class="markdown-toc-title">${escapeHtml(heading.title)}</span>
            <span class="markdown-toc-line">строка ${heading.line}</span>
          </button>
        </li>
      `).join('')}</ol>`;

    container.innerHTML = `
      <div class="markdown-toc-overlay" data-markdown-toc-overlay>
        <section class="markdown-toc-dialog" role="dialog" aria-modal="true" aria-labelledby="markdown-toc-title">
          <header class="markdown-toc-header" data-markdown-toc-drag-handle>
            <div>
              <h2 id="markdown-toc-title">Содержание файла</h2>
              <p>${escapeHtml(fileName)} · заголовков: ${headings.length}</p>
            </div>
            <button type="button" class="markdown-toc-close" data-markdown-toc-close>Закрыть</button>
          </header>
          <div class="markdown-toc-body">
            ${items}
          </div>
          <button
            type="button"
            class="markdown-toc-resize"
            data-markdown-toc-resize-handle
            aria-label="Изменить размер окна"
          ></button>
        </section>
      </div>
    `;

    return headings;
  }

  window.MivraExternalPlugin.register({
    id: pluginId,
    activate(api) {
      const disposeDialog = api.dialogs.registerRenderer(dialogId, {
        render({ container, api }) {
          const close = () => api.dialogs.close(dialogId);
          const onItemClick = (event) => {
            const button = event.target instanceof Element
              ? event.target.closest('[data-markdown-toc-index]')
              : null;
            if (!(button instanceof HTMLElement)) return;

            const index = Number(button.dataset.markdownTocIndex);
            const heading = headings.find((item) => item.index === index);
            if (!heading) return;

            scrollToHeading(heading);
          };
          const onOverlayClick = (event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          };
          let closeButton = null;
          let overlay = null;
          let dialog = null;
          let dragCleanup = null;
          let resizeCleanup = null;
          let dialogPosition = null;
          let dialogSize = null;
          let headings = [];

          const rerender = () => {
            closeButton?.removeEventListener('click', close);
            overlay?.removeEventListener('click', onOverlayClick);
            dragCleanup?.();
            resizeCleanup?.();
            container.removeEventListener('click', onItemClick);

            headings = renderToc(container, api);

            closeButton = container.querySelector('[data-markdown-toc-close]');
            overlay = container.querySelector('[data-markdown-toc-overlay]');
            dialog = container.querySelector('.markdown-toc-dialog');
            const dragHandle = container.querySelector('[data-markdown-toc-drag-handle]');
            const resizeHandle = container.querySelector('[data-markdown-toc-resize-handle]');

            if (dialog instanceof HTMLElement) {
              if (dialogSize) {
                dialogSize = clampSize(dialogSize);
              } else {
                dialogSize = clampSize({
                  width: dialog.offsetWidth || 720,
                  height: dialog.offsetHeight || 520,
                });
              }
              applyDialogSize(dialog, dialogSize);

              if (dialogPosition) {
                dialogPosition = clampPosition(dialogPosition, dialog);
                applyDialogPosition(dialog, dialogPosition);
              } else {
                dialogPosition = centerDialog(dialog);
              }
            }

            if (dialog instanceof HTMLElement && dragHandle instanceof HTMLElement) {
              dragCleanup = makeDialogDraggable(
                dialog,
                dragHandle,
                () => dialogPosition,
                (nextPosition) => {
                  dialogPosition = nextPosition;
                },
              );
            }

            if (dialog instanceof HTMLElement && resizeHandle instanceof HTMLElement) {
              resizeCleanup = makeDialogResizable(
                dialog,
                resizeHandle,
                () => dialogPosition,
                (nextPosition) => {
                  dialogPosition = nextPosition;
                },
                () => dialogSize,
                (nextSize) => {
                  dialogSize = nextSize;
                },
              );
            }

            closeButton?.addEventListener('click', close);
            overlay?.addEventListener('click', onOverlayClick);
            container.addEventListener('click', onItemClick);
          };

          rerender();

          const unsubscribe = api.document.subscribeContent(() => {
            rerender();
          });

          return () => {
            unsubscribe();
            closeButton?.removeEventListener('click', close);
            overlay?.removeEventListener('click', onOverlayClick);
            dragCleanup?.();
            resizeCleanup?.();
            container.removeEventListener('click', onItemClick);
            container.innerHTML = '';
          };
        },
      });

      const disposeButton = api.toolbar.registerButton({
        id: 'markdown-toc-open',
        label: 'Содержание',
        title: 'Показать содержание текущего Markdown-файла',
        order: 200,
        onClick: () => api.dialogs.open(dialogId),
      });

      return () => {
        disposeButton();
        disposeDialog();
      };
    },
  });
}());
