import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PDF_CODE_FONT } from './pdfFonts';
import type { ExportPdfSettings, RenderContext } from './types';

export { PDF_CODE_FONT } from './pdfFonts';

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; checked?: boolean }> }
  | { type: 'image'; alt: string; src: string };

type PreviewPage = {
  blocks: MarkdownBlock[];
  breakBefore: boolean;
  titlePage: boolean;
};

type PdfInlineSpan = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  font?: string;
  color?: string;
  link?: string;
  decoration?: 'underline';
};

const PAGE_SIZES_MM = {
  a4: { label: 'A4', width: 210, height: 297 },
  letter: { label: 'LETTER', width: 216, height: 279 },
  a5: { label: 'A5', width: 148, height: 210 },
} as const;

const MM_TO_PT = 72 / 25.4;
const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)\s+/u;

function mmToPt(value: number): number {
  return Math.round(value * MM_TO_PT * 100) / 100;
}

function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function titleFromPath(filePath: string | null): string {
  if (!filePath) return 'Без имени';
  return filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Без имени';
}

export function buildExportPdfFileName(settings: ExportPdfSettings, filePath: string | null): string {
  const title = (settings.titlePage.title || titleFromPath(filePath)).trim() || 'document';
  return `${title.replace(/[<>:"/\\|?*]+/g, '_')}.pdf`;
}

function renderInlineHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function plainInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

function pushInlineSpan(spans: PdfInlineSpan[], text: string, style: Omit<PdfInlineSpan, 'text'> = {}): void {
  if (text.length === 0) return;
  spans.push(Object.keys(style).length > 0 ? { text, ...style } : { text });
}

function richInline(value: string, settings: ExportPdfSettings): PdfInlineSpan[] {
  const spans: PdfInlineSpan[] = [];
  const tokenPattern = /!\[([^\]]*)]\(([^)]+)\)|\[([^\]]+)]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let cursor = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    pushInlineSpan(spans, value.slice(cursor, index));

    if (match[1] !== undefined) {
      pushInlineSpan(spans, match[1] || match[2]);
    } else if (match[3] !== undefined) {
      pushInlineSpan(spans, match[3], {
        color: settings.colors.accent,
        decoration: 'underline',
        link: match[4],
      });
    } else if (match[5] !== undefined) {
      pushInlineSpan(spans, match[5], { font: PDF_CODE_FONT });
    } else if (match[6] !== undefined) {
      pushInlineSpan(spans, match[6], { bold: true });
    } else if (match[7] !== undefined) {
      pushInlineSpan(spans, match[7], { italics: true });
    }

    cursor = index + match[0].length;
  }

  pushInlineSpan(spans, value.slice(cursor));
  return spans.length > 0 ? spans : [{ text: plainInline(value) }];
}

function prefixedRichInline(prefix: string, value: string, settings: ExportPdfSettings): PdfInlineSpan[] {
  return prefix ? [{ text: prefix }, ...richInline(value, settings)] : richInline(value, settings);
}

function safeSvgColor(color: string, fallback: string): string {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color) ? color : fallback;
}

function pdfIconSvg(icon: string, accentColor: string): string {
  const accent = safeSvgColor(accentColor, '#2563eb');
  const brain = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="9" cy="8" r="5" fill="#ff8ac8"/><circle cx="15" cy="8" r="5" fill="#ff73bd"/><circle cx="8" cy="14" r="5" fill="#f65ab3"/><circle cx="16" cy="14" r="5" fill="#ec4899"/><path d="M9 5c-2 1-3 3-2 5m5-6c-1 2-1 4 1 5m5-2c-2 0-3 1-4 3m-8 4c2-1 4-1 5 1m2 4c1-2 3-3 5-3" fill="none" stroke="#d94697" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const target = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="11" cy="13" r="8" fill="#fee2e2"/><circle cx="11" cy="13" r="6" fill="#fb7185"/><circle cx="11" cy="13" r="3.5" fill="#ffffff"/><circle cx="11" cy="13" r="1.8" fill="#2563eb"/><path d="M14 10l6-6m-3 0h3v3" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const rocket = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M13 4c3-1 6 0 7 1 1 4-1 8-4 11l-6-6c1-3 2-5 3-6z" fill="${accent}"/><path d="M9 10l-4 1-2 4 5-1m6 1l-1 5 4-2 1-4" fill="#93c5fd"/><circle cx="15.5" cy="8.5" r="1.8" fill="#ffffff"/><path d="M8 16l-3 3" stroke="#f97316" stroke-width="2" stroke-linecap="round"/></svg>`;
  const bulb = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M8 13a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z" fill="#fde68a"/><path d="M9 18h6m-5 3h4" stroke="#b45309" stroke-width="1.8" stroke-linecap="round"/><path d="M12 2v2m8 6h2M2 10h2m2-6l1.5 1.5M18 4l-1.5 1.5" stroke="#f59e0b" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const clipboard = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6"/><rect x="8" y="2.5" width="8" height="4" rx="1.5" fill="#f59e0b"/><path d="M8 10h8M8 14h8M8 18h5" stroke="${accent}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const warning = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="#facc15"/><path d="M12 8v6m0 3h.01" stroke="#78350f" stroke-width="2" stroke-linecap="round"/></svg>`;
  const check = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M7 12.5l3 3L17.5 8" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const lock = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="${accent}"/><path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15" r="1.5" fill="#ffffff"/></svg>`;
  const book = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 5c3-1 5-.5 8 1v14c-3-1.5-5-2-8-1V5z" fill="#60a5fa"/><path d="M12 6c3-1.5 5-2 8-1v14c-3-1-5-.5-8 1V6z" fill="#2563eb"/><path d="M12 6v14" stroke="#ffffff" stroke-width="1.4"/></svg>`;
  const star = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9L12 3z" fill="#f59e0b"/></svg>`;
  const gear = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#ffffff"/><path d="M12 2l2 3 3-1 1 3 3 1-1 4 2 2-2 2 1 4-3 1-1 3-3-1-2 3-2-3-3 1-1-3-3-1 1-4-2-2 2-2-1-4 3-1 1-3 3 1 2-3z" fill="${accent}"/><circle cx="12" cy="12" r="3.2" fill="#ffffff"/></svg>`;
  const info = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${accent}"/><path d="M12 10v7m0-10h.01" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/></svg>`;

  const icons: Record<string, string> = {
    '🧠': brain,
    '🎯': target,
    '🚀': rocket,
    '💡': bulb,
    '📋': clipboard,
    '⚠️': warning,
    '✅': check,
    '🔒': lock,
    '📚': book,
    '⭐': star,
    '⚙️': gear,
    'ℹ️': info,
  };

  return icons[icon] ?? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="${accent}"/><path d="M12 6l1.5 4.5L18 12l-4.5 1.5L12 18l-1.5-4.5L6 12l4.5-1.5L12 6z" fill="#ffffff"/></svg>`;
}

function splitLeadingIcon(value: string): { icon: string; text: string } | null {
  const match = LEADING_EMOJI_RE.exec(value);
  if (!match) return null;
  return {
    icon: match[1],
    text: value.slice(match[0].length).trimStart(),
  };
}

function leadingIconColumns(
  icon: { icon: string; text: string },
  settings: ExportPdfSettings,
  margin: [number, number, number, number],
  prefix = '',
): Content {
  const fontSize = settings.typography.fontSize;
  const iconSize = Math.max(13, Math.min(18, fontSize * 1.15));
  const columns: unknown[] = [];

  if (prefix) {
    columns.push({
      width: 'auto',
      text: prefix,
      font: settings.typography.bodyFont,
      fontSize,
      lineHeight: settings.typography.lineHeight,
      color: settings.colors.text,
    });
  }

  columns.push(
    {
      width: iconSize + 2,
      stack: [{
        svg: pdfIconSvg(icon.icon, settings.colors.accent),
        width: iconSize,
        height: iconSize,
        margin: [0, Math.max(0, (fontSize - iconSize) / 2), 0, 0],
      }],
    },
    {
      width: '*',
      text: richInline(icon.text, settings) as unknown as Content,
      font: settings.typography.bodyFont,
      fontSize,
      lineHeight: settings.typography.lineHeight,
      color: settings.colors.text,
    },
  );

  return {
    columns,
    columnGap: 4,
    margin,
  } as Content;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      index += 1;
      continue;
    }

    const codeStart = /^```(\w+)?/.exec(trimmed);
    if (codeStart) {
      flushParagraph();
      const language = codeStart[1] ?? '';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', language, code: code.join('\n') });
      index += 1;
      continue;
    }

    const image = /^!\[([^\]]*)]\(([^)]+)\)$/.exec(trimmed);
    if (image) {
      flushParagraph();
      blocks.push({ type: 'image', alt: image[1], src: image[2] });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quote.join(' ') });
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      const rows = [parseTableRow(trimmed)];
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|') && lines[index].trim() !== '') {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const listStart = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (listStart) {
      flushParagraph();
      const ordered = /\d+\./.test(listStart[2]);
      const items: Array<{ text: string; checked?: boolean }> = [];
      while (index < lines.length) {
        const match = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(lines[index]);
        if (!match || /\d+\./.test(match[2]) !== ordered) break;
        const checklist = /^\[( |x|X)]\s+(.+)$/.exec(match[3]);
        items.push(checklist
          ? { text: checklist[2], checked: checklist[1].toLowerCase() === 'x' }
          : { text: match[3] });
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function blockWeight(block: MarkdownBlock): number {
  switch (block.type) {
    case 'heading':
      return block.level === 1 ? 6 : 4;
    case 'paragraph':
      return Math.max(2, Math.ceil(block.text.length / 95));
    case 'blockquote':
      return Math.max(3, Math.ceil(block.text.length / 85));
    case 'code':
      return Math.max(4, block.code.split('\n').length + 2);
    case 'table':
      return block.rows.length + 3;
    case 'list':
      return block.items.length + 1;
    case 'image':
      return 9;
  }
}

function pageCapacity(settings: ExportPdfSettings): number {
  const base = settings.page.size === 'a5' ? 28 : 44;
  const marginPenalty = Math.round((settings.page.margins.top + settings.page.margins.bottom - 35) / 5);
  const fontPenalty = Math.round((settings.typography.fontSize - 12) * 1.5);
  return Math.max(16, base - marginPenalty - fontPenalty);
}

function paginateBlocks(markdown: string, settings: ExportPdfSettings): PreviewPage[] {
  const pages: PreviewPage[] = [];
  const blocks = parseMarkdown(markdown);
  let current: PreviewPage = { blocks: [], breakBefore: false, titlePage: false };
  let used = 0;
  const capacity = pageCapacity(settings);

  if (settings.titlePage.enabled) {
    pages.push({ blocks: [], breakBefore: false, titlePage: true });
  }

  for (const block of blocks) {
    const weight = blockWeight(block);
    const needsH1Break = settings.pageBreaks.beforeH1
      && block.type === 'heading'
      && block.level === 1
      && current.blocks.length > 0;
    const needsCapacityBreak = current.blocks.length > 0 && used + weight > capacity;

    if (needsH1Break || needsCapacityBreak) {
      pages.push(current);
      current = { blocks: [], breakBefore: needsH1Break, titlePage: false };
      used = 0;
    }

    current.blocks.push(block);
    used += weight;
  }

  if (current.blocks.length > 0 || pages.length === 0) {
    pages.push(current);
  }

  return pages;
}

export function estimatePreviewPages(markdown: string, settings: ExportPdfSettings): number {
  return paginateBlocks(markdown, settings).length;
}

function pageSizeCss(settings: ExportPdfSettings): string {
  const size = PAGE_SIZES_MM[settings.page.size];
  const width = settings.page.orientation === 'portrait' ? size.width : size.height;
  const height = settings.page.orientation === 'portrait' ? size.height : size.width;
  return `width:${width}mm;min-height:${height}mm;`;
}

function pageStyleCss(settings: ExportPdfSettings): string {
  return `${pageSizeCss(settings)}--pdf-text:${settings.colors.text};--pdf-heading:${settings.colors.heading};--pdf-accent:${settings.colors.accent};--pdf-bg:${settings.colors.background};--pdf-body-font:${settings.typography.bodyFont};--pdf-heading-font:${settings.typography.headingFont};--pdf-font-size:${settings.typography.fontSize}px;--pdf-line-height:${settings.typography.lineHeight};--pdf-paragraph-spacing:${settings.typography.paragraphSpacing}px;--pdf-code-bg:${settings.markdown.codeBlocks.background};--pdf-code-border:${settings.markdown.codeBlocks.borderColor};--pdf-quote-bg:${settings.markdown.blockquotes.background};--pdf-quote-bar:${settings.markdown.blockquotes.barColor};`;
}

function renderTitlePageHtml(settings: ExportPdfSettings, context: RenderContext): string {
  const title = settings.titlePage.title || titleFromPath(context.filePath);
  return `<section class="export-pdf-title-page export-pdf-title-page-${settings.titlePage.style}">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(settings.titlePage.author)}</p>
    <p>${escapeHtml(settings.titlePage.date)}</p>
  </section>`;
}

function renderBlockHtml(block: MarkdownBlock, imageNumber: number, settings: ExportPdfSettings): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${renderInlineHtml(block.text)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${renderInlineHtml(block.text)}</p>`;
    case 'blockquote':
      return `<blockquote>${renderInlineHtml(block.text)}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
    case 'table':
      return `<table><tbody>${block.rows.map((row, rowIndex) => `<tr>${row.map((cell) => {
        const tag = rowIndex === 0 ? 'th' : 'td';
        return `<${tag}>${renderInlineHtml(cell)}</${tag}>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => {
        const checked = item.checked === undefined
          ? ''
          : `<span class="export-pdf-check export-pdf-check-${settings.markdown.lists.checklistStyle}">${item.checked ? '✓' : ''}</span>`;
        return `<li>${checked}${renderInlineHtml(item.text)}</li>`;
      }).join('')}</${tag}>`;
    }
    case 'image':
      if (!settings.markdown.images.enabled) return '';
      return `<figure class="export-pdf-image export-pdf-image-${settings.markdown.images.align}">
        <img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" style="max-width:${settings.markdown.images.maxWidthPercent}%;border-radius:${settings.markdown.images.borderRadius}px;">
        ${settings.markdown.images.captions ? `<figcaption>Рисунок ${imageNumber}: ${escapeHtml(block.alt || block.src)}</figcaption>` : ''}
      </figure>`;
  }
}

export function renderPreviewHtml(
  markdown: string,
  settings: ExportPdfSettings,
  context: RenderContext,
): string {
  const pages = paginateBlocks(markdown, settings);
  let imageNumber = 0;

  return `<div class="export-pdf-preview-summary">Листов: ${pages.length}</div>
  <div class="export-pdf-page-stack">
    ${pages.map((page, index) => {
      const body = page.titlePage
        ? renderTitlePageHtml(settings, context)
        : page.blocks.map((block) => {
          if (block.type === 'image') imageNumber += 1;
          return renderBlockHtml(block, imageNumber, settings);
        }).join('\n');

      return `<article class="document-preview-page export-pdf-preview-page${page.breakBefore ? ' document-preview-page-break' : ''}" style="${pageStyleCss(settings)}">
        <div class="document-preview-page-label">Лист ${index + 1} из ${pages.length}</div>
        <section class="export-pdf-page-paper" style="padding:${settings.page.margins.top}mm ${settings.page.margins.right}mm ${settings.page.margins.bottom}mm ${settings.page.margins.left}mm;">
          ${body}
        </section>
      </article>`;
    }).join('\n')}
  </div>`;
}

function contentWidthPt(settings: ExportPdfSettings): number {
  const size = PAGE_SIZES_MM[settings.page.size];
  const widthMm = settings.page.orientation === 'portrait' ? size.width : size.height;
  return mmToPt(widthMm - settings.page.margins.left - settings.page.margins.right);
}

function buildPageNumber(currentPage: number, pageCount: number, settings: ExportPdfSettings): string {
  switch (settings.pageNumbers.format) {
    case 'total':
      return `${currentPage} / ${pageCount}`;
    case 'short':
      return `Стр. ${currentPage}`;
    case 'full':
      return `Страница ${currentPage} из ${pageCount}`;
    case 'simple':
      return String(currentPage);
  }
}

function headerFooterColumns(
  left: string,
  center: string,
  right: string,
  settings: ExportPdfSettings,
): Content {
  return {
    columns: [
      { text: left, alignment: 'left', color: settings.colors.text },
      { text: center, alignment: 'center', color: settings.colors.text },
      { text: right, alignment: 'right', color: settings.colors.text },
    ],
    font: settings.typography.bodyFont,
    fontSize: Math.max(8, settings.typography.fontSize - 3),
  } as Content;
}

function buildHeaderOrFooter(
  placement: 'top' | 'bottom',
  currentPage: number,
  pageCount: number,
  settings: ExportPdfSettings,
): Content {
  const isTop = placement === 'top';
  const headerFooter = isTop ? settings.header : settings.footer;
  const position = settings.pageNumbers.position;
  const showPageNumber = settings.pageNumbers.enabled
    && position.startsWith(placement)
    && !(settings.pageNumbers.hideOnFirstPage && currentPage === 1);
  const pageNumber = showPageNumber ? buildPageNumber(currentPage, pageCount, settings) : '';

  if (!headerFooter.enabled && !showPageNumber) return { text: '' };

  const left = position.endsWith('left') ? pageNumber : headerFooter.leftText;
  const center = position.endsWith('center') ? pageNumber : '';
  const right = position.endsWith('right') ? pageNumber : headerFooter.rightText;
  const line = headerFooter.line
    ? [{
      canvas: [{
        type: 'line',
        x1: 0,
        y1: 0,
        x2: contentWidthPt(settings),
        y2: 0,
        lineWidth: 0.5,
        lineColor: settings.colors.accent,
      }],
    } as Content]
    : [];

  const stack = isTop
    ? [headerFooterColumns(left, center, right, settings), ...line]
    : [...line, headerFooterColumns(left, center, right, settings)];

  return {
    margin: [
      mmToPt(settings.page.margins.left),
      isTop ? 10 : 0,
      mmToPt(settings.page.margins.right),
      isTop ? 0 : 10,
    ],
    stack,
  } as Content;
}

function headingSize(level: number, settings: ExportPdfSettings): number {
  return Math.max(settings.typography.fontSize + 1, settings.typography.fontSize + 8 - level);
}

function tableLayout(settings: ExportPdfSettings): 'lightHorizontalLines' | 'noBorders' | undefined {
  if (settings.markdown.tables.borderStyle === 'rows') return 'lightHorizontalLines';
  if (settings.markdown.tables.borderStyle === 'minimal') return 'noBorders';
  return undefined;
}

function tableScale(settings: ExportPdfSettings): number {
  const scalePercent = settings.markdown.tables.scalePercent ?? 100;
  return Math.min(100, Math.max(50, scalePercent)) / 100;
}

function normalizeTableRows(rows: string[][]): string[][] {
  const columns = Math.max(1, ...rows.map((row) => row.length));

  return rows.map((row) => [
    ...row,
    ...Array.from({ length: columns - row.length }, () => ''),
  ]);
}

function codeLines(block: MarkdownBlock): string[] {
  if (block.type !== 'code') return [];
  const lines = block.code.split('\n');
  return lines.length > 0 ? lines : [''];
}

function codeLineNumberWidth(lines: string[], fontSize: number): number {
  return Math.max(26, String(lines.length).length * fontSize * 0.7 + 16);
}

function codeBlockBody(block: MarkdownBlock, settings: ExportPdfSettings): Content {
  const lines = codeLines(block);
  const fontSize = settings.typography.fontSize * settings.markdown.codeBlocks.fontSizePercent / 100;
  const numberWidth = codeLineNumberWidth(lines, fontSize);

  return {
    table: {
      widths: [numberWidth, '*'],
      body: lines.map((line, index) => [
        {
          text: String(index + 1),
          alignment: 'right',
          color: '#64748b',
          fillColor: '#e5e7eb',
          font: PDF_CODE_FONT,
          fontSize,
          lineHeight: 1.25,
          margin: [0, 2, 7, 2],
        },
        {
          text: line || ' ',
          color: settings.colors.text,
          fillColor: settings.markdown.codeBlocks.background,
          font: PDF_CODE_FONT,
          fontSize,
          lineHeight: 1.25,
          preserveLeadingSpaces: true,
          margin: [8, 2, 0, 2],
        },
      ]),
    },
    layout: 'noBorders',
  } as Content;
}

function blockToPdfContent(
  block: MarkdownBlock,
  settings: ExportPdfSettings,
  imageNumber: number,
  isFirstBodyBlock: boolean,
): Content[] {
  const unbreakable = settings.pageBreaks.avoidInsideBlocks;
  const commonMargin: [number, number, number, number] = [0, 0, 0, settings.typography.paragraphSpacing];

  switch (block.type) {
    case 'heading': {
      const text = plainInline(block.text);
      const icon = splitLeadingIcon(text);
      const fontSize = headingSize(block.level, settings);
      const margin: [number, number, number, number] = block.level === 1 ? [0, 4, 0, 10] : [0, 6, 0, 6];
      const pageBreak = settings.pageBreaks.beforeH1 && block.level === 1 && !isFirstBodyBlock ? 'before' : undefined;

      if (icon) {
        const iconSize = Math.max(15, Math.min(24, fontSize * 0.9));
        return [{
          columns: [
            {
              width: iconSize + 2,
              stack: [{
                svg: pdfIconSvg(icon.icon, settings.colors.accent),
                width: iconSize,
                height: iconSize,
                margin: [0, Math.max(0, (fontSize - iconSize) / 2), 0, 0],
              }],
            },
            {
              width: '*',
              text: icon.text,
              color: settings.colors.heading,
              font: settings.typography.headingFont,
              bold: true,
              fontSize,
              lineHeight: settings.typography.lineHeight,
            },
          ],
          columnGap: 6,
          margin,
          pageBreak,
        } as Content];
      }

      return [{
        text,
        color: settings.colors.heading,
        font: settings.typography.headingFont,
        bold: true,
        fontSize,
        lineHeight: settings.typography.lineHeight,
        margin,
        pageBreak,
      } as Content];
    }
    case 'paragraph':
      return [{
        text: richInline(block.text, settings) as unknown as Content,
        color: settings.colors.text,
        font: settings.typography.bodyFont,
        fontSize: settings.typography.fontSize,
        lineHeight: settings.typography.lineHeight,
        alignment: settings.typography.textAlign,
        margin: commonMargin,
        leadingIndent: settings.typography.firstLineIndent ? mmToPt(settings.typography.firstLineIndentMm) : 0,
      } as Content];
    case 'blockquote':
      return [{
        table: {
          widths: [4, '*'],
          body: [[
            { text: '', fillColor: settings.markdown.blockquotes.barColor },
            {
              text: richInline(block.text, settings) as unknown as Content,
              font: settings.typography.bodyFont,
              italics: settings.markdown.blockquotes.italic,
              fillColor: settings.markdown.blockquotes.background,
              margin: [8, 6, 8, 6],
            },
          ]],
        },
        layout: 'noBorders',
        margin: commonMargin,
        unbreakable,
      } as Content];
    case 'code': {
      const label = block.language === 'mermaid'
        ? `Mermaid (${settings.markdown.mermaid.theme})`
        : block.language;
      return [{
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              ...(label ? [{ text: label, color: settings.colors.accent, bold: true, margin: [0, 0, 0, 4] }] : []),
              codeBlockBody(block, settings),
            ],
            fillColor: settings.markdown.codeBlocks.background,
            margin: [0, 0, 0, 0],
          }]],
        },
        layout: {
          hLineColor: () => settings.markdown.codeBlocks.borderColor,
          vLineColor: () => settings.markdown.codeBlocks.borderColor,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
        margin: commonMargin,
        unbreakable,
      } as Content];
    }
    case 'table': {
      const scale = tableScale(settings);
      const rows = normalizeTableRows(block.rows);
      const columns = Math.max(1, rows[0]?.length ?? 1);
      const tableWidth = contentWidthPt(settings) * scale;
      const columnWidth = roundPt(tableWidth / columns);
      const padding = roundPt(settings.markdown.tables.cellPadding * scale);
      const verticalPadding = roundPt(padding / 2);
      const fontSize = roundPt(settings.typography.fontSize * scale);

      return [{
        table: {
          headerRows: rows.length > 1 ? 1 : 0,
          widths: Array.from({ length: columns }, () => columnWidth),
          body: rows.map((row, rowIndex) => row.map((cell) => ({
            text: richInline(cell, settings) as unknown as Content,
            bold: rowIndex === 0,
            font: settings.typography.bodyFont,
            fontSize,
            fillColor: settings.markdown.tables.zebra && rowIndex > 0 && rowIndex % 2 === 0
              ? settings.markdown.tables.zebraColor
              : undefined,
            margin: [padding, verticalPadding, padding, verticalPadding],
          }))),
        },
        layout: tableLayout(settings),
        alignment: 'center',
        margin: commonMargin,
        unbreakable,
      } as Content];
    }
    case 'list': {
      const items = block.items.map((item) => {
        const prefix = item.checked === undefined
          ? ''
          : `${settings.markdown.lists.checklistStyle === 'round' ? '◯' : '☐'}${item.checked ? ' ✓' : ''} `;
        const icon = splitLeadingIcon(item.text);
        if (icon) {
          return leadingIconColumns(icon, settings, [0, 0, 0, settings.markdown.lists.spacing], prefix);
        }
        return {
          text: prefixedRichInline(prefix, item.text, settings) as unknown as Content,
          font: settings.typography.bodyFont,
          margin: [0, 0, 0, settings.markdown.lists.spacing],
        };
      });
      const listContent = {
        margin: commonMargin,
        color: settings.colors.text,
        markerColor: settings.colors.accent,
        ...(block.ordered ? { ol: items } : { ul: items }),
      };
      return [listContent as unknown as Content];
    }
    case 'image': {
      if (!settings.markdown.images.enabled) return [];
      const canEmbed = /^(data:image\/|https?:\/\/)/.test(block.src);
      const imageWidth = contentWidthPt(settings) * settings.markdown.images.maxWidthPercent / 100;
      const imageContent: Content = canEmbed
        ? {
          image: block.src,
          width: imageWidth,
          alignment: settings.markdown.images.align,
          margin: [0, 4, 0, settings.markdown.images.captions ? 4 : settings.typography.paragraphSpacing],
        } as Content
        : {
          text: `Изображение: ${block.alt || block.src}`,
          color: settings.colors.accent,
          italics: true,
          margin: commonMargin,
        } as Content;
      const caption = settings.markdown.images.captions
        ? [{
          text: `Рисунок ${imageNumber}: ${block.alt || block.src}`,
          alignment: settings.markdown.images.align,
          color: settings.colors.text,
          font: settings.typography.bodyFont,
          fontSize: Math.max(8, settings.typography.fontSize - 2),
          margin: [0, 0, 0, settings.typography.paragraphSpacing],
        } as Content]
        : [];
      return [imageContent, ...caption];
    }
  }
}

export function buildPdfDocumentDefinition(
  markdown: string,
  settings: ExportPdfSettings,
  context: RenderContext,
): TDocumentDefinitions {
  const title = settings.titlePage.title || titleFromPath(context.filePath);
  const blocks = parseMarkdown(markdown);
  const content: Content[] = [];
  let imageNumber = 0;

  if (settings.titlePage.enabled) {
    content.push({
      stack: [
        { text: title, style: 'title' },
        { text: settings.titlePage.author, style: 'subtitle' },
        { text: settings.titlePage.date, style: 'subtitle' },
      ],
      pageBreak: blocks.length > 0 ? 'after' : undefined,
      margin: [0, 120, 0, 0],
    } as Content);
  }

  blocks.forEach((block, index) => {
    if (block.type === 'image') imageNumber += 1;
    content.push(...blockToPdfContent(block, settings, imageNumber, index === 0));
  });

  return {
    pageSize: PAGE_SIZES_MM[settings.page.size].label,
    pageOrientation: settings.page.orientation,
    pageMargins: [
      mmToPt(settings.page.margins.left),
      mmToPt(settings.page.margins.top),
      mmToPt(settings.page.margins.right),
      mmToPt(settings.page.margins.bottom),
    ],
    header: (currentPage: number, pageCount: number) => buildHeaderOrFooter('top', currentPage, pageCount, settings),
    footer: (currentPage: number, pageCount: number) => buildHeaderOrFooter('bottom', currentPage, pageCount, settings),
    content,
    defaultStyle: {
      font: settings.typography.bodyFont,
      fontSize: settings.typography.fontSize,
      color: settings.colors.text,
      lineHeight: settings.typography.lineHeight,
    },
    styles: {
      title: {
        font: settings.typography.headingFont,
        fontSize: Math.max(24, settings.typography.fontSize + 14),
        bold: true,
        color: settings.colors.heading,
        alignment: settings.titlePage.style === 'modern' ? 'left' : 'center',
        margin: [0, 0, 0, 20],
      },
      subtitle: {
        font: settings.typography.bodyFont,
        fontSize: settings.typography.fontSize,
        color: settings.colors.text,
        alignment: settings.titlePage.style === 'modern' ? 'left' : 'center',
        margin: [0, 0, 0, 6],
      },
    },
    info: {
      title,
      author: settings.titlePage.author || undefined,
    },
  };
}
