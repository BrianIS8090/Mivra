export function normalizeTextMarkdown(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

export async function textFileToMarkdown(file: File): Promise<string> {
  return normalizeTextMarkdown(await file.text());
}
