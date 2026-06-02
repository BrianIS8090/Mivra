export function normalizeTextMarkdown(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.readAsText(file);
  });
}

export async function textFileToMarkdown(file: File): Promise<string> {
  return normalizeTextMarkdown(await readFileText(file));
}
