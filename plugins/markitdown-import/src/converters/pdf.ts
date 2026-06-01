export function pdfPagesToMarkdown(pages: string[]): string {
  return pages
    .map((page, index) => `<!-- page ${index + 1} -->\n\n${page.trim()}`)
    .filter((page) => page.trim().length > 0)
    .join('\n\n');
}

export async function pdfFileToMarkdown(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), useWorkerFetch: false });
  const pdf = await task.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(text);
  }

  const markdown = pdfPagesToMarkdown(pages);
  if (!markdown) {
    throw new Error('pdf_text_layer_missing');
  }
  return markdown;
}
