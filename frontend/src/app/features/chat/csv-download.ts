import { ChatDownload } from '../../core/models';

/**
 * Turns a ChatDownload table into a .csv file and saves it (opens in Excel).
 * - Quotes every cell and doubles inner quotes (RFC 4180).
 * - Prefixes cells starting with = + - @ (and tab/CR) with ' so Excel never runs them as formulas
 *   ("CSV injection": post titles are user input).
 * - Starts with a UTF-8 BOM so Excel shows non-English characters correctly.
 */
export function downloadCsv(file: ChatDownload): void {
  const lines = [file.columns, ...file.rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
