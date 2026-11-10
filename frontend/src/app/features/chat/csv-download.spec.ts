import { csvCell } from './csv-download';

describe('csvCell', () => {
  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('Hello, "world"')).toBe('"Hello, ""world"""');
    expect(csvCell(8)).toBe('"8"');
  });

  it('writes null / undefined as empty cells', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('escapes values Excel would run as formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-2')).toBe('"\'-2"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('leaves normal text alone', () => {
    expect(csvCell('My first post')).toBe('"My first post"');
  });
});
