import mermaid from 'mermaid';

let counter = 0;

// Определяет текущую тему по атрибуту data-theme на <html>
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// Инициализирует mermaid с учётом текущей темы
function ensureInit() {
  const theme = isDarkTheme() ? 'dark' : 'default';
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
    flowchart: { htmlLabels: false },
    sequence: { useMaxWidth: true },
  });
}

// Генерирует уникальный ID для рендеринга
export function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${counter++}`;
}

// Рендерит mermaid-диаграмму асинхронно через колбэк applyPreview
// Возвращает undefined — Milkdown покажет индикатор загрузки
export function renderMermaidPreview(
  content: string,
  applyPreview: (el: HTMLElement) => void,
): undefined | null {
  if (!content.trim()) return null;

  ensureInit();

  const id = generateMermaidId();

  mermaid.render(id, content.trim()).then(({ svg }) => {
    const container = document.createElement('div');
    container.className = 'mermaid-preview';
    container.innerHTML = svg;
    applyPreview(container);
  }).catch(() => {
    const container = document.createElement('div');
    container.className = 'mermaid-preview mermaid-preview-error';
    container.textContent = 'Ошибка синтаксиса Mermaid';
    applyPreview(container);
  });

  return undefined;
}
