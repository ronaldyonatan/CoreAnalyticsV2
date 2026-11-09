/** A small expression/SELECT grammar compiled to data, never executable SQL. */
export type Expression = { kind: string; [key: string]: unknown };
type Token = { kind: string; value: string };
const FUNCTIONS: Record<string, [number, number]> = {
  abs: [1, 1], ceil: [1, 1], ceiling: [1, 1], floor: [1, 1], round: [1, 1], sqrt: [1, 1], power: [2, 2],
  lower: [1, 1], upper: [1, 1], trim: [1, 1], length: [1, 1], coalesce: [2, 10], concat: [2, 10],
  year: [1, 1], month: [1, 1], dayofmonth: [1, 1],
};
export class ExpressionParser {
  tokens: Token[] = [];
  index = 0;
  count = 0;
  columns?: string[];
  constructor(source: string, columns?: string[]) {
    this.columns = columns;
    if (!source.trim() || source.length > 4000) throw new Error('Isi ekspresi atau SELECT, maksimal 4000 karakter.');
    const pattern = /\s+|'(?:''|[^'])*'|`(?:``|[^`])*`|"(?:""|[^"])*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_]*|<=|>=|<>|!=|\*\*|[+\-*/%(),;=<>]/uy;
    let position = 0;
    while (position < source.length) {
      pattern.lastIndex = position;
      const match = pattern.exec(source);
      if (!match) throw new Error(`Sintaks tidak didukung pada posisi ${position + 1}.`);
      position = pattern.lastIndex;
      const raw = match[0];
      if (!raw.trim()) continue;
      const kind = raw[0] === "'" ? 'string' : ['`', '"'].includes(raw[0]) ? 'quoted' : /^\d|^\./.test(raw) ? 'number' : /^[\p{L}_]/u.test(raw) ? 'word' : 'symbol';
      const value = kind === 'string' || kind === 'quoted' ? raw.slice(1, -1).split(raw[0] + raw[0]).join(raw[0]) : raw;
      this.tokens.push({ kind, value });
      if (this.tokens.length > 600) throw new Error('Ekspresi terlalu panjang.');
    }
  }
  peek(word: string) { const token = this.tokens[this.index]; return token?.kind !== 'quoted' && token?.kind !== 'string' && token?.value.toUpperCase() === word.toUpperCase(); }
  take(word: string) { if (this.peek(word)) { this.index++; return true; } return false; }
  expect(word: string) { if (!this.take(word)) throw new Error(`Diperlukan ${word}.`); }
  identifier() {
    const token = this.tokens[this.index++];
    if (!token || !['word', 'quoted'].includes(token.kind) || !token.value.trim() || token.value.length > 128) throw new Error('Nama kolom tidak valid.');
    return token.value;
  }
  expression(minimum = 0, depth = 0): Expression {
    if (depth > 20 || ++this.count > 256) throw new Error('Ekspresi terlalu kompleks.');
    const token = this.tokens[this.index++];
    if (!token) throw new Error('Ekspresi belum lengkap.');
    let left: Expression;
    if (token.value === '(' && token.kind === 'symbol') { left = this.expression(0, depth + 1); this.expect(')'); }
    else if (token.kind === 'string') {
      if (token.value.length > 256) throw new Error('Nilai teks maksimal 256 karakter.');
      left = { kind: 'literal', value: token.value };
    } else if (token.kind === 'number') {
      const value = Number(token.value); if (!Number.isFinite(value)) throw new Error('Angka harus finite.');
      left = { kind: 'literal', value };
    } else if (token.kind === 'symbol' && ['+', '-'].includes(token.value)) left = { kind: 'unary', op: token.value, arg: this.expression(6, depth + 1) };
    else if (token.kind === 'word' && token.value.toUpperCase() === 'NOT') left = { kind: 'unary', op: 'NOT', arg: this.expression(3, depth + 1) };
    else if (token.kind === 'word' && ['NULL', 'TRUE', 'FALSE'].includes(token.value.toUpperCase())) left = { kind: 'literal', value: token.value.toUpperCase() === 'NULL' ? null : token.value.toUpperCase() === 'TRUE' };
    else if (['word', 'quoted'].includes(token.kind)) {
      if (token.kind === 'word' && this.take('(')) {
        const name = token.value.toLowerCase(); const limits = FUNCTIONS[name];
        if (!limits) throw new Error(`Fungsi ${name} belum tersedia.`);
        const args = [this.expression(0, depth + 1)];
        while (this.take(',')) args.push(this.expression(0, depth + 1));
        this.expect(')');
        if (args.length < limits[0] || args.length > limits[1]) throw new Error(`Jumlah argumen ${name} tidak sesuai.`);
        left = { kind: 'call', name, args };
      } else {
        if (this.columns && !this.columns.includes(token.value)) throw new Error(`Kolom ${token.value} tidak tersedia.`);
        left = { kind: 'column', name: token.value };
      }
    } else throw new Error('Ekspresi tidak valid.');
    const priorities: Record<string, number> = { OR: 1, AND: 2, '=': 3, '!=': 3, '<>': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '%': 5, '**': 6 };
    while (this.index < this.tokens.length) {
      const next = this.tokens[this.index];
      if (!['word', 'symbol'].includes(next.kind)) break;
      const op = next.value.toUpperCase();
      if (op === 'IS' && minimum <= 3) { this.index++; const negate = this.take('NOT'); this.expect('NULL'); left = { kind: 'is_null', arg: left, negate }; continue; }
      const priority = priorities[op]; if (!priority || priority < minimum) break;
      this.index++; left = { kind: 'binary', op, left, right: this.expression(op === '**' ? priority : priority + 1, depth + 1) };
    }
    return left;
  }
}
export function parseFormula(source: string, columns?: string[]) {
  const parser = new ExpressionParser(source, columns); const result = parser.expression();
  if (parser.index !== parser.tokens.length) throw new Error('Periksa sisa ekspresi formula.');
  return result;
}
export function compileQueries(source: string, available?: string[], script = false) {
  const parser = new ExpressionParser(source, available);
  const steps: Record<string, unknown>[] = [];
  let columns = available?.slice();
  while (parser.index < parser.tokens.length) {
    parser.columns = columns; parser.count = 0;
    parser.expect('SELECT');
    const select: Record<string, unknown>[] = []; let output: string[] | undefined = [];
    do {
      if (parser.take('*')) { select.push({ star: true }); output = columns && output ? [...output, ...columns] : undefined; }
      else {
        const expression = parser.expression();
        const name = parser.take('AS') ? parser.identifier() : expression.kind === 'column' ? String(expression.name) : '';
        if (!name) throw new Error('Gunakan AS untuk memberi nama hasil ekspresi SELECT.');
        select.push({ name, expression }); output?.push(name);
      }
      if (select.length > 30) throw new Error('SELECT maksimal 30 kolom.');
    } while (parser.take(','));
    parser.expect('FROM');
    if (parser.identifier().toLowerCase() !== 'input') throw new Error('SELECT hanya membaca tabel sampel input.');
    const where = parser.take('WHERE') ? parser.expression() : null;
    parser.columns = output;
    const order: { column: string; direction: string }[] = [];
    if (parser.take('ORDER')) {
      parser.expect('BY');
      do {
        const column = parser.identifier();
        if (output && !output.includes(column)) throw new Error('ORDER BY harus memakai kolom hasil SELECT.');
        const direction = parser.take('DESC') ? 'desc' : (parser.take('ASC'), 'asc');
        order.push({ column, direction });
      } while (parser.take(','));
    }
    const integer = () => { const token = parser.tokens[parser.index++]; const value = Number(token?.value); if (token?.kind !== 'number' || !Number.isInteger(value) || value < 0 || value > 50) throw new Error('LIMIT dan OFFSET harus 0–50.'); return value; };
    const limit = parser.take('LIMIT') ? integer() : null;
    const offset = parser.take('OFFSET') ? integer() : 0;
    if (output && (!output.length || output.length > 30 || new Set(output.map(name => name.toLowerCase())).size !== output.length)) throw new Error('Nama kolom SELECT harus unik; maksimal 30 kolom.');
    steps.push({ type: 'query', select, where, order, limit, offset }); columns = output;
    if (parser.index < parser.tokens.length) parser.expect(';');
    if (!script && parser.index < parser.tokens.length) throw new Error('Gunakan SQL Script untuk beberapa SELECT.');
    if (steps.length > 30) throw new Error('SQL Script maksimal 30 SELECT.');
  }
  return { steps, columns };
}
