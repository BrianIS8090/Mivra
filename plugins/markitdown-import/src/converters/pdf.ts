import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

type PdfJsWithWorkerOptions = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

export function pdfPagesToMarkdown(pages: string[]): string {
  return pages
    .map((page, index) => `<!-- page ${index + 1} -->\n\n${page.trim()}`)
    .filter((page) => page.trim().length > 0)
    .join('\n\n');
}

export function configurePdfWorker(
  pdfjs: PdfJsWithWorkerOptions,
  workerUrl: string = pdfWorkerUrl,
  moduleUrl: string = import.meta.url,
): void {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(workerUrl, moduleUrl).toString();
}

export async function pdfFileToMarkdown(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  configurePdfWorker(pdfjs);
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
