/** Small RFC 4180 reader for bounded finance imports. Quoted names and newlines are preserved. */
export function parseBulkCsv(source: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  function cell() {
    row.push(field);
    field = '';
    closed = false;
  }
  function record() {
    cell();
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === ',') {
      cell();
      continue;
    }
    if (char === '\r' || char === '\n') {
      record();
      if (char === '\r' && source[index + 1] === '\n') index++;
      continue;
    }
    if (closed) {
      if (/\s/.test(char)) continue;
      throw new Error('Unexpected text after a quoted field');
    }
    if (char === '"') {
      if (field.trim()) throw new Error('A quote must begin a field');
      field = '';
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('A quoted field was not closed');
  if (field.length || row.length || closed) record();
  const headers = records.shift()?.map((value) => value.replace(/^\uFEFF/, '').trim());
  if (
    !headers?.length ||
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('CSV requires unique non-empty headers');
  if (headers.length > 30 || records.length > 100)
    throw new Error('Use at most 100 rows and 30 columns');
  return records.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Row ${index + 1} has the wrong number of fields`);
    return Object.fromEntries(headers.map((key, column) => [key, cells[column]!.trim()]));
  });
}
