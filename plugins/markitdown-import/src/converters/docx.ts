import * as mammoth from 'mammoth';

type AssetApi = {
  saveBytes(input: {
    bytes: Uint8Array;
    filename: string;
    alt?: string;
    kind?: 'image' | 'file';
  }): Promise<{ markdown: string }>;
};

function extFromContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/svg+xml') return 'svg';
  return contentType.split('/')[1] || 'png';
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(markdownFromNode).join('');
  }

  const children = () => Array.from(node.childNodes).map(markdownFromNode).join('');
  const content = children().trim();

  switch (node.tagName.toLowerCase()) {
    case 'h1':
      return `# ${content}\n\n`;
    case 'h2':
      return `## ${content}\n\n`;
    case 'h3':
      return `### ${content}\n\n`;
    case 'h4':
      return `#### ${content}\n\n`;
    case 'p':
      return content ? `${content}\n\n` : '';
    case 'strong':
    case 'b':
      return `**${children()}**`;
    case 'em':
    case 'i':
      return `*${children()}*`;
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return href ? `[${content || href}](${href})` : content;
    }
    case 'img':
      return node.getAttribute('src') ?? '';
    case 'ul':
      return `${Array.from(node.children).map((child) => `- ${markdownFromNode(child).trim()}`).join('\n')}\n\n`;
    case 'ol':
      return `${Array.from(node.children).map((child, index) => `${index + 1}. ${markdownFromNode(child).trim()}`).join('\n')}\n\n`;
    case 'li':
      return children();
    case 'table':
      return `${tableToMarkdown(node)}\n\n`;
    case 'br':
      return '\n';
    default:
      return children();
  }
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      normalizeMarkdown(markdownFromNode(cell)).replace(/\|/g, '\\|'),
    ),
  ).filter((row) => row.length > 0);

  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  const [header, ...body] = normalized;

  return [
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function htmlToMarkdown(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return normalizeMarkdown(Array.from(document.body.childNodes).map(markdownFromNode).join(''));
}

export async function docxImageToMarkdown(input: {
  contentType: string;
  altText?: string;
  arrayBuffer: ArrayBuffer;
  index: number;
  assets: AssetApi;
}): Promise<string> {
  const ext = extFromContentType(input.contentType);
  const filename = `docx-image-${input.index}.${ext}`;
  const result = await input.assets.saveBytes({
    bytes: new Uint8Array(input.arrayBuffer),
    filename,
    alt: input.altText || `image ${input.index}`,
    kind: 'image',
  });
  return result.markdown;
}

export async function docxFileToMarkdown(file: File, assets: AssetApi): Promise<string> {
  let imageIndex = 0;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      imageIndex += 1;
      const markdown = await docxImageToMarkdown({
        contentType: image.contentType,
        altText: image.altText,
        arrayBuffer: await image.readAsArrayBuffer(),
        index: imageIndex,
        assets,
      });
      return { src: markdown };
    }),
  });

  return htmlToMarkdown(result.value);
}
