// A small, strict CSV reader for the format of RFC 4180: records separated by line breaks (CRLF, or LF alone), fields
// separated by commas, a field in double quotes may hold commas, line breaks and doubled double quotes. The first record
// is the header. Every record has to have as many fields as the header. A quote inside a field that is not quoted, text
// after the closing quote, and a quote that is never closed are refused with the line, never guessed. A record that is
// entirely empty is skipped. The reader walks the text once, character by character, so no pattern can backtrack.
//
// The result is { header: [{ name, column }], records: [{ line, row, fields: [string] }] }: line is the line where the
// record starts, row is the number of the record counting the header as row 1 (the row a spreadsheet shows when no
// field holds a line break).

export const CSV_LIMITS = { maxRecords: 20_001, maxFields: 100, maxFieldLength: 20_000 };

function shown(text) {
  return String(text).replace(/[^ -~]/g, '?').slice(0, 40);
}

export function parseCsv(text, label = 'the CSV', { limits = CSV_LIMITS } = {}) {
  const s = String(text).replace(/^\ufeff/, '');
  const fail = (line, message) => {
    throw new Error(`${label}: line ${line}: ${message}`);
  };
  const raw = [];
  let fields = [];
  let field = '';
  let quoted = false; // the current field started with a quote
  let closed = false; // the closing quote of the current field has been read
  let line = 1;
  let recordLine = 1;
  let i = 0;

  let lastQuoted = false; // the last field that ended was quoted
  const endField = () => {
    if (fields.length >= limits.maxFields) fail(recordLine, `more than ${limits.maxFields} fields in one record`);
    lastQuoted = quoted;
    fields.push(field);
    field = '';
    quoted = false;
    closed = false;
  };
  const endRecord = () => {
    endField();
    if (!(fields.length === 1 && fields[0] === '' && !lastQuoted)) {
      if (raw.length >= limits.maxRecords) fail(recordLine, `more than ${(limits.maxRecords - 1).toLocaleString('en-US')} records after the header`);
      raw.push({ line: recordLine, fields });
    }
    fields = [];
  };

  while (i < s.length) {
    const c = s[i];
    if (quoted && !closed) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          closed = true;
          i += 1;
        }
        continue;
      }
      if (c === '\n') line += 1;
      else if (c === '\r' && s[i + 1] !== '\n') line += 1;
      field += c;
      if (field.length > limits.maxFieldLength) fail(recordLine, `a field longer than ${limits.maxFieldLength.toLocaleString('en-US')} characters`);
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') {
      endRecord();
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
      line += 1;
      recordLine = line;
      continue;
    }
    if (c === '"') {
      if (field === '' && !quoted) {
        quoted = true;
        i += 1;
        continue;
      }
      fail(line, quoted ? 'text after the closing quote of a field' : 'a double quote inside a field that is not quoted (quote the whole field and double the quote)');
    }
    if (closed) fail(line, `text after the closing quote of a field ("${shown(c)}")`);
    field += c;
    if (field.length > limits.maxFieldLength) fail(recordLine, `a field longer than ${limits.maxFieldLength.toLocaleString('en-US')} characters`);
    i += 1;
  }
  if (quoted && !closed) fail(recordLine, 'a quoted field is not closed');
  if (field !== '' || fields.length > 0 || quoted) endRecord();

  if (raw.length === 0) throw new Error(`${label}: the file holds no header`);
  const [head, ...rest] = raw;
  const seen = new Set();
  const header = head.fields.map((name, column) => {
    const clean = name.trim().toLowerCase().replace(/[ -]/g, '_');
    if (clean === '') fail(head.line, `column ${column + 1} of the header has no name`);
    if (seen.has(clean)) fail(head.line, `the column "${shown(clean)}" appears twice in the header`);
    seen.add(clean);
    return { name: clean, column };
  });
  let row = 1;
  const records = rest.map((r) => {
    row += 1;
    if (r.fields.length !== header.length) fail(r.line, `the record has ${r.fields.length} ${r.fields.length === 1 ? 'field' : 'fields'} and the header has ${header.length}`);
    return { line: r.line, row, fields: r.fields };
  });
  return { header, records };
}
