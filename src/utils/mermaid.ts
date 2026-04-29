import mermaid from 'mermaid';

let counter = 0;

// Generation-counter на каждый блок — защита от race condition при быстрой смене
// содержимого: если новый mermaid.render для того же блока стартовал раньше,
// чем разрезолвился предыдущий, результат старого render'а отбрасывается.
const renderGen = new WeakMap<(el: HTMLElement) => void, number>();

// Определяет текущую тему по атрибуту data-theme на <html>
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// Инициализирует mermaid с учётом текущей темы.
// htmlLabels: false — глобальная настройка (flowchart.htmlLabels устарел в v11),
// принудительно SVG <text> вместо foreignObject,
// чтобы CSS Milkdown не ломал текст в узлах flowchart.
function ensureInit() {
  const theme = isDarkTheme() ? 'dark' : 'default';
  mermaid.initialize({
    startOnLoad: false,
    theme,
    htmlLabels: false,
    fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
  });
}

// Генерирует уникальный ID для рендеринга
export function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${counter++}`;
}

// Рендерит mermaid-диаграмму асинхронно через колбэк applyPreview.
export function renderMermaidPreview(
  content: string,
  applyPreview: (el: HTMLElement) => void,
): undefined | null {
  if (!content.trim()) return null;

  ensureInit();

  const myGen = (renderGen.get(applyPreview) ?? 0) + 1;
  renderGen.set(applyPreview, myGen);

  const id = generateMermaidId();

  mermaid.render(id, content.trim()).then(({ svg }) => {
    if (renderGen.get(applyPreview) !== myGen) return; // устаревший результат
    const container = document.createElement('div');
    container.className = 'mermaid-preview';
    container.innerHTML = svg;
    applyPreview(container);
  }).catch(() => {
    if (renderGen.get(applyPreview) !== myGen) return;
    const container = document.createElement('div');
    container.className = 'mermaid-preview mermaid-preview-error';
    container.textContent = 'Ошибка синтаксиса Mermaid';
    applyPreview(container);
  });

  return undefined;
}
