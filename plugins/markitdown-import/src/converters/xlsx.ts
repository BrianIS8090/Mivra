import * as XLSX from 'xlsx';

export type XlsxColumnOption = {
  index: number;
  label: string;
};

export type XlsxSheetData = {
  name: string;
  rows: unknown[][];
};

export type XlsxWorkbookData = {
  sheets: XlsxSheetData[];
  columns: XlsxColumnOption[];
};

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

type XlsxMarkdownOptions = {
  excludedColumns?: Set<number> | number[];
};

function excludedColumnSet(options?: XlsxMarkdownOptions): Set<number> {
  const excluded = options?.excludedColumns;
  if (!excluded) return new Set();
  return excluded instanceof Set ? excluded : new Set(excluded);
}

function filterColumns(rows: unknown[][], excludedColumns: Set<number>): unknown[][] {
  if (excludedColumns.size === 0) return rows;
  return rows.map((row) => row.filter((_cell, index) => !excludedColumns.has(index)));
}

export function sheetRowsToMarkdown(sheetName: string, rows: unknown[][], options?: XlsxMarkdownOptions): string {
  const trimmed = trimRows(rows);
  const filtered = filterColumns(trimmed, excludedColumnSet(options));
  if (filtered.length === 0 || filtered.every((row) => row.length === 0)) return `## ${sheetName}`;

  const width = Math.max(...filtered.map((row) => row.length));
  const normalized = filtered.map((row) =>
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

function columnLetter(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function xlsxColumnOptionsFromRows(rows: unknown[][]): XlsxColumnOption[] {
  const trimmed = trimRows(rows);
  if (trimmed.length === 0) return [];

  const width = Math.max(...trimmed.map((row) => row.length));
  const header = trimmed[0] ?? [];

  return Array.from({ length: width }, (_value, index) => {
    const letter = columnLetter(index);
    const title = String(header[index] ?? '').trim() || `Столбец ${letter}`;
    return {
      index,
      label: `${letter} — ${title}`,
    };
  });
}

export function xlsxWorkbookToMarkdown(workbook: XlsxWorkbookData, options?: XlsxMarkdownOptions): string {
  return workbook.sheets
    .map((sheet) => sheetRowsToMarkdown(sheet.name, sheet.rows, options))
    .join('\n\n')
    .trim();
}

export async function xlsxFileToWorkbook(file: File): Promise<XlsxWorkbookData> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets = workbook.SheetNames
    .map((sheetName): XlsxSheetData => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
      return { name: sheetName, rows };
    });

  const firstSheetWithColumns = sheets.find((sheet) => xlsxColumnOptionsFromRows(sheet.rows).length > 0);

  return {
    sheets,
    columns: firstSheetWithColumns ? xlsxColumnOptionsFromRows(firstSheetWithColumns.rows) : [],
  };
}

export async function xlsxFileToMarkdown(file: File, options?: XlsxMarkdownOptions): Promise<string> {
  return xlsxWorkbookToMarkdown(await xlsxFileToWorkbook(file), options);
}
