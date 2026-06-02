import { normalizeTextMarkdown, readFileText } from './text';

function escapeCell(value: string): string {
  return value.trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function parseSimpleCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

export function csvTextToMarkdown(csv: string): string {
  const rows = normalizeTextMarkdown(csv)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(parseSimpleCsvLine);

  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? '')),
  );
  const [header, ...body] = normalized;

  return [
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export async function csvFileToMarkdown(file: File): Promise<string> {
  return csvTextToMarkdown(await readFileText(file));
}
