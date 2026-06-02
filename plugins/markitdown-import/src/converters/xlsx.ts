import * as XLSX from 'xlsx';

export type XlsxColumnOption = {
  index: number;
  label: string;
};

export type XlsxCellData = {
  value: unknown;
  formatted?: string;
  format?: string;
  type?: string;
};

export type XlsxCellInput = unknown | XlsxCellData;

export type XlsxSheetData = {
  name: string;
  rows: XlsxCellInput[][];
};

export type XlsxWorkbookData = {
  sheets: XlsxSheetData[];
  columns: XlsxColumnOption[];
};

function isCellData(value: unknown): value is XlsxCellData {
  return Boolean(
    value
      && typeof value === 'object'
      && 'value' in value
      && ('formatted' in value || 'format' in value || 'type' in value),
  );
}

function formatExcelDuration(value: number, format?: string): string | null {
  if (!format || !/\[[h]+\]/i.test(format) || !/m/i.test(format)) return null;

  const sign = value < 0 ? '-' : '';
  const totalMinutes = Math.floor(Math.abs(value) * 24 * 60 + 1e-7);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');

  if (format.includes(':')) {
    return `${sign}${hours}:${minutes}`;
  }

  return `${sign}${hours} ч. ${minutes} м.`;
}

function cellDisplayText(value: XlsxCellInput): string {
  if (!isCellData(value)) {
    return String(value ?? '').trim();
  }

  if (typeof value.formatted === 'string' && value.formatted.trim().length > 0) {
    return value.formatted.trim();
  }

  if (typeof value.value === 'number') {
    const duration = formatExcelDuration(value.value, value.format);
    if (duration !== null) return duration;

    if (value.format && value.format !== 'General') {
      try {
        return XLSX.SSF.format(value.format, value.value).trim();
      } catch {
        return String(value.value).trim();
      }
    }
  }

  return String(value.value ?? '').trim();
}

function escapeCell(value: XlsxCellInput): string {
  return cellDisplayText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function trimRows(rows: XlsxCellInput[][]): XlsxCellInput[][] {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cellDisplayText(cell).length > 0));
  if (nonEmptyRows.length === 0) return [];

  const maxWidth = Math.max(...nonEmptyRows.map((row) => row.length));
  let firstCol = 0;
  let lastCol = maxWidth - 1;

  while (firstCol <= lastCol && nonEmptyRows.every((row) => !cellDisplayText(row[firstCol]))) {
    firstCol += 1;
  }
  while (lastCol >= firstCol && nonEmptyRows.every((row) => !cellDisplayText(row[lastCol]))) {
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

function filterColumns(rows: XlsxCellInput[][], excludedColumns: Set<number>): XlsxCellInput[][] {
  if (excludedColumns.size === 0) return rows;
  return rows.map((row) => row.filter((_cell, index) => !excludedColumns.has(index)));
}

export function sheetRowsToMarkdown(sheetName: string, rows: XlsxCellInput[][], options?: XlsxMarkdownOptions): string {
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

export function xlsxColumnOptionsFromRows(rows: XlsxCellInput[][]): XlsxColumnOption[] {
  const trimmed = trimRows(rows);
  if (trimmed.length === 0) return [];

  const width = Math.max(...trimmed.map((row) => row.length));
  const header = trimmed[0] ?? [];

  return Array.from({ length: width }, (_value, index) => {
    const letter = columnLetter(index);
    const title = cellDisplayText(header[index]) || `Столбец ${letter}`;
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

function xlsxSheetToRows(sheet: XLSX.WorkSheet): XlsxCellInput[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const rows: XlsxCellInput[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: XlsxCellInput[] = [];

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;

      row.push(cell ? {
        value: cell.v,
        formatted: typeof cell.w === 'string' ? cell.w : undefined,
        format: typeof cell.z === 'string' ? cell.z : undefined,
        type: typeof cell.t === 'string' ? cell.t : undefined,
      } : undefined);
    }

    rows.push(row);
  }

  return rows;
}

export async function xlsxFileToWorkbook(file: File): Promise<XlsxWorkbookData> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellText: true,
  });
  const sheets = workbook.SheetNames
    .map((sheetName): XlsxSheetData => {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsxSheetToRows(sheet);
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
