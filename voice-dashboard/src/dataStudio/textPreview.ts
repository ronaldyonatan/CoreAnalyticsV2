export const TEXT_STEPS = ['Combine Columns', 'Replace Text', 'Split Column', 'String Operations', 'Text Formatting'];
export type TextRule = {
  id: string; column: string; find: string; replace: string; output: string; operation: string;
  numberHandling?: string; start?: number; length?: number; side?: string; width?: number; trim?: string;
};
export type TextData = {
  label: string; textColumns?: string[]; textOutput?: string; textDelimiter?: string;
  textRemove?: boolean; textKeepExtra?: boolean; filterColumn?: string; splitNames?: string[]; textRules?: TextRule[];
};

/** Also used by the editor to propagate the schema of every upstream Text node. */
export function compileText(data: TextData, available?: string[]) {
  let columns = available?.slice();
  const steps: Record<string, unknown>[] = [];
  const source = (name: string) => {
    if (!name || (columns && !columns.includes(name))) throw new Error(`${data.label}: pilih kolom sumber yang tersedia.`);
  };
  const add = (name: string, overwrite?: string) => {
    if (!name || name.length > 128 || (name !== overwrite && columns?.some(column => column.toLowerCase() === name.toLowerCase()))) {
      throw new Error(`${data.label}: nama kolom hasil harus unik dan maksimal 128 karakter.`);
    }
    if (columns && name !== overwrite) columns.push(name);
    if (columns && columns.length > 30) throw new Error('Preview mendukung maksimal 30 kolom hasil.');
  };
  const integer = (value: number | undefined, label: string) => {
    if (!Number.isInteger(value) || value! < 1 || value! > 256) throw new Error(`${data.label}: ${label} harus 1–256.`);
    return value!;
  };
  if (data.label === 'Combine Columns') {
    const names = data.textColumns ?? [];
    if (names.length < 2 || names.length > 30 || new Set(names).size !== names.length) throw new Error('Combine Columns: pilih minimal dua kolom berbeda sesuai urutan.');
    names.forEach(source);
    const output = data.textOutput?.trim() ?? '';
    if ((data.textDelimiter ?? '').length > 256) throw new Error('Pemisah maksimal 256 karakter.');
    // Validate collisions before removing sources so no source is silently overwritten.
    if (columns?.some(name => name.toLowerCase() === output.toLowerCase())) throw new Error('Combine Columns: gunakan nama kolom hasil baru.');
    if (data.textRemove) columns = columns?.filter(name => !names.includes(name));
    add(output);
    steps.push({ type: 'combine', columns: names, output, delimiter: data.textDelimiter ?? '', remove_sources: !!data.textRemove });
  } else if (data.label === 'Split Column') {
    const column = data.filterColumn ?? '';
    source(column);
    const outputs = (data.splitNames ?? []).map(name => name.trim());
    const delimiter = data.textDelimiter ?? ',';
    if (!outputs.length || outputs.length > 30 || !delimiter || delimiter.length > 256 || new Set(outputs.map(name => name.toLowerCase())).size !== outputs.length) throw new Error('Split Column: isi pemisah dan nama kolom hasil yang unik.');
    if (columns && outputs.some(name => columns!.some(existing => existing.toLowerCase() === name.toLowerCase()))) throw new Error('Split Column: gunakan nama kolom hasil baru.');
    if (data.textRemove) columns = columns?.filter(name => name !== column);
    outputs.forEach(name => add(name));
    steps.push({ type: 'split', column, outputs, delimiter, keep_extra: !!data.textKeepExtra, remove_source: !!data.textRemove });
  } else {
    const rules = data.textRules ?? [];
    if (!rules.length || rules.length > 30) throw new Error(`${data.label}: tambahkan 1–30 aturan.`);
    for (const rule of rules) {
      source(rule.column);
      if (data.label === 'Replace Text') {
        if (!rule.find || rule.find.length > 256 || rule.replace.length > 256) throw new Error('Replace Text: isi teks yang dicari (maksimal 256 karakter).');
        steps.push({ type: 'replace', column: rule.column, find: rule.find, replacement: rule.replace });
      } else if (data.label === 'Text Formatting') {
        if (!['', 'lower', 'upper', 'capitalize_first'].includes(rule.operation) || !['', 'remove_numbers', 'only_numbers'].includes(rule.numberHandling ?? '') || (!rule.operation && !rule.numberHandling)) throw new Error('Text Formatting: pilih format huruf atau perlakuan angka.');
        steps.push({ type: 'format', column: rule.column, case: rule.operation, numbers: rule.numberHandling ?? '' });
      } else if (data.label === 'String Operations') {
        const output = rule.output.trim();
        add(output, rule.column);
        const step: Record<string, unknown> = { type: 'string', column: rule.column, output, op: rule.operation };
        if (rule.operation === 'substring') {
          step.start = integer(rule.start, 'posisi awal'); step.length = integer(rule.length, 'panjang');
        } else if (rule.operation === 'right_left_substring') {
          if (!['left', 'right'].includes(rule.side ?? '')) throw new Error('Pilih arah pengambilan teks.');
          step.side = rule.side; step.length = integer(rule.length, 'panjang');
        } else if (rule.operation === 'trim_spaces') {
          if (!['both', 'left', 'right'].includes(rule.trim ?? '')) throw new Error('Pilih sisi spasi yang dibuang.');
          step.trim = rule.trim;
        } else if (rule.operation === 'pad_with_space') {
          if (!['left', 'right'].includes(rule.side ?? '')) throw new Error('Pilih sisi penambahan spasi.');
          step.side = rule.side; step.width = integer(rule.width, 'panjang akhir');
        } else throw new Error('String Operations: pilih operasi yang tersedia.');
        steps.push(step);
      } else throw new Error('Operasi Text tidak tersedia.');
    }
  }
  return { steps, columns };
}
