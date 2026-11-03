import { minorUnitFactor } from '../../domain/money/money';

/** Strict, locale-independent CSV intake. Never infer a debit/credit from a signed amount. */
export type BankStatementInput = { transactionDate: string; direction: 'credit'|'debit'; amountMinor: number; description: string; reference?: string; externalId?: string };

function columns(line: string): string[] {
  const cells: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (quoted || cell.trim() === '') quoted = !quoted;
      else throw new Error('Bank statement CSV contains an unexpected quote.');
    } else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('Bank statement CSV has an unclosed quoted field.');
  cells.push(cell.trim()); return cells;
}

export function parseBankStatementCsv(text: string, currency: string): BankStatementInput[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || lines.length > 1001) throw new Error('Add a header and between 1 and 1,000 bank statement lines.');
  const header = columns(lines.shift()!).map(x => x.toLowerCase());
  const expected = ['date', 'direction', 'amount', 'description'];
  if (expected.some((field, i) => header[i] !== field)) throw new Error('CSV columns must start with date,direction,amount,description.');
  if (header.length > 6 || (header[4] && header[4] !== 'reference') || (header[5] && header[5] !== 'externalid')) {
    throw new Error('Optional columns must be reference and externalId, in that order.');
  }
  const factor = minorUnitFactor(currency);
  const result: BankStatementInput[] = lines.map((line, index): BankStatementInput => {
    const [transactionDate, rawDirection, rawAmount, description, reference, externalId] = columns(line);
    const number = index + 2;
    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      throw new Error(`Row ${number}: enter a real date as YYYY-MM-DD.`);
    }
    const parsedDate = new Date(`${transactionDate}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== transactionDate) {
      throw new Error(`Row ${number}: enter a real date as YYYY-MM-DD.`);
    }
    const direction = rawDirection?.toLowerCase();
    if (direction !== 'credit' && direction !== 'debit') throw new Error(`Row ${number}: direction must be credit or debit.`);
    const amount = Number(rawAmount);
    const minor = Math.round(amount * factor);
    if (!rawAmount || !/^\d+(\.\d+)?$/.test(rawAmount) || !Number.isSafeInteger(minor) || minor <= 0 || Math.abs(amount * factor - minor) > 1e-6) {
      throw new Error(`Row ${number}: enter a positive amount with valid ${currency} decimal places.`);
    }
    if (!description || description.length > 300 || (reference && reference.length > 160) || (externalId && externalId.length > 160)) throw new Error(`Row ${number}: check the description and reference lengths.`);
    return { transactionDate, direction, amountMinor: minor, description, ...(reference ? { reference } : {}), ...(externalId ? { externalId } : {}) };
  });
  return result;
}
