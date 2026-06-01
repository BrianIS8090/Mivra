import * as XLSX from 'xlsx';

function escapeCell(value: unknown): string {
  return String(value ?? '').trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function trimRows(rows: unknown[][]): unknown[][] {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0));
  if (nonEmptyRows.length === 0) return [];

  const maxWidth = Math.max(...nonEmptyRows.map((row) => row.length));
  let firstCol = 0;
  let lastCol = maxWidth - 1;

  while (firstCol <= lastCol && nonEmptyRows.every((row) => !String(row[firstCol] ?? '').trim())) {
    firstCol += 1;
  }
  while (lastCol >= firstCol && nonEmptyRows.every((row) => !String(row[lastCol] ?? '').trim())) {
    lastCol -= 1;
  }

  return nonEmptyRows.map((row) => row.slice(firstCol, lastCol + 1));
}

export function sheetRowsToMarkdown(sheetName: string, rows: unknown[][]): string {
  const trimmed = trimRows(rows);
  if (trimmed.length === 0) return `## ${sheetName}`;

  const width = Math.max(...trimmed.map((row) => row.length));
  const normalized = trimmed.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index])),
  );
  const [header, ...body] = normalized;

  return [
    `## ${sheetName}`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export async function xlsxFileToMarkdown(file: File): Promise<string> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
      return sheetRowsToMarkdown(sheetName, rows);
    })
    .join('\n\n')
    .trim();
}
