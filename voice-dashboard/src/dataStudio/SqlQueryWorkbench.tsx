import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, completionKeymap, type CompletionContext } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting, syntaxTree, indentOnInput, bracketMatching } from '@codemirror/language';
import { MSSQL, PostgreSQL, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import { UniverseDatabaseSourceIcon } from '../design-system/components/universe/UniverseDatabaseMark';
import './sql-query-workbench.css';

type Source = { schema: string; name: string; type: string };
type Preview = { columns: string[]; rows: unknown[][]; has_more: boolean };
type ColumnSuggestion = { schema: string; table: string; name: string };
type SearchColumns = (prefix: string, signal: AbortSignal) => Promise<ColumnSuggestion[]>;

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#6ecbff', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ffd28a' },
  { tag: tags.number, color: '#cba9ff' },
  { tag: [tags.lineComment, tags.blockComment], color: '#86a194', fontStyle: 'italic' },
  { tag: tags.operator, color: '#97deeb' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: '#8ce1ca' },
]);

function SqlEditor({ value, onChange, onRun, sources, sourceColumns, columns, searchColumns, connectionType, autofocus }: {
  value: string; onChange: (value: string) => void; onRun: () => void;
  sources: Source[]; sourceColumns: Record<string, string[]>; columns: string[]; searchColumns: SearchColumns; connectionType: string; autofocus: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange); changed.current = onChange;
  const run = useRef(onRun); run.current = onRun;
  const language = useMemo(() => new Compartment(), []);
  const resultCompletion = useMemo(() => new Compartment(), []);

  useEffect(() => {
    if (!element.current) return;
    const instance = new EditorView({
      parent: element.current,
      state: EditorState.create({ doc: value, extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), drawSelection(),
        indentOnInput(), bracketMatching(), syntaxHighlighting(highlight), autocompletion({ activateOnTypingDelay: 300 }),
        language.of(sql({ dialect: MSSQL })), resultCompletion.of([]),
        EditorState.transactionFilter.of(transaction => transaction.newDoc.length <= 32000 ? transaction : []),
        keymap.of([{ key: 'Mod-Enter', run: () => { run.current(); return true; } }, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': 'SQL query', 'spellcheck': 'false' }),
        EditorView.updateListener.of(update => { if (update.docChanged) changed.current(update.state.doc.toString()); }),
      ] }),
    });
    view.current = instance;
    if (autofocus) instance.focus();
    return () => { view.current = null; instance.destroy(); };
    // The document is controlled separately; changing it must not recreate the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = view.current;
    if (instance && instance.state.doc.toString() !== value) {
      instance.dispatch({ changes: { from: 0, to: instance.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const schema: Record<string, Record<string, string[]>> = Object.create(null);
    for (const source of sources) (schema[source.schema] ??= Object.create(null))[source.name] = sourceColumns[`${source.schema.toLocaleLowerCase()}.${source.name.toLocaleLowerCase()}`] ?? [];
    const allColumns = [...new Set([...columns, ...Object.values(sourceColumns).flat()])];
    const completion = (context: CompletionContext) => {
      const word = context.matchBefore(/[\p{L}\p{N}_$]+/u);
      if (!word && !context.explicit) return null;
      return { from: word?.from ?? context.pos, options: allColumns.map(column => ({
        label: column, type: 'property', detail: 'kolom yang dimuat',
        apply: /^[A-Za-z_][\w$]*$/.test(column) ? column : `[${column.replace(/]/g, ']]')}]`,
      })) };
    };
    const remoteCompletion = async (context: CompletionContext) => {
      const word = context.matchBefore(/[\p{L}\p{N}_$]+/u);
      if (!word || word.text.length < 2) return null;
      for (let node = syntaxTree(context.state).resolveInner(context.pos, -1); node; node = node.parent!) {
        if (/string|comment/i.test(node.name)) return null;
      }
      const controller = new AbortController();
      context.addEventListener('abort', () => controller.abort(), { onDocChange: true });
      try {
        const items = await searchColumns(word.text, controller.signal);
        if (context.aborted) return null;
        return { from: word.from, options: items.map(item => ({
          label: item.name, type: 'property', detail: `${item.schema}.${item.table}`,
          apply: /^[A-Za-z_][\w$]*$/.test(item.name) ? item.name : `[${item.name.replace(/]/g, ']]')}]`,
        })) };
      } catch { return null; }
    };
    const postgres = ['postgres', 'postgresql'].includes(connectionType.toLowerCase());
    view.current?.dispatch({ effects: [
      language.reconfigure(sql({ dialect: postgres ? PostgreSQL : MSSQL, schema, defaultSchema: postgres ? 'public' : 'dbo' })),
      resultCompletion.reconfigure(EditorState.languageData.of(() => [{ autocomplete: completion }, { autocomplete: remoteCompletion }])),
    ] });
  }, [sources, sourceColumns, columns, searchColumns, connectionType, language, resultCompletion]);

  return <div ref={element} className="sql-workbench-code" />;
}

export default function SqlQueryWorkbench({ value, onChange, onRun, busy, preview, knownColumns, sourceColumns, sources, searchColumns, connectionType, error, usesConnectionCredentials, saveAvailable }: {
  value: string; onChange: (value: string) => void; onRun: () => void; busy: boolean;
  preview: Preview | null; knownColumns: string[]; sourceColumns: Record<string, string[]>; sources: Source[]; searchColumns: SearchColumns; connectionType: string; error: string; usesConnectionCredentials: boolean; saveAvailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const connector = connectionType.toLowerCase();
  const databaseLabel = ['postgres', 'postgresql'].includes(connector) ? 'PostgreSQL' : ['sqlserver', 'sql_server', 'mssql'].includes(connector) ? 'SQL Server' : 'SQL';
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setExpanded(false); requestAnimationFrame(() => button.current?.focus()); };
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  const workbench = <div className={`sql-workbench${expanded ? ' is-expanded' : ''}`} ref={dialog}
    role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? 'SQL query editor' : undefined}
    onKeyDown={event => {
      if (!expanded || event.key !== 'Tab' || event.defaultPrevented) return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [contenteditable="true"], [tabindex="0"]') ?? []).filter(item => item.offsetParent !== null);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }}>
    <div className="sql-workbench-toolbar"><div className="sql-workbench-title"><span className="sql-workbench-db-icon" aria-hidden="true"><UniverseDatabaseSourceIcon type={connectionType}/></span><div><strong>{databaseLabel} query</strong><small>Ctrl/Cmd + Enter untuk preview · Ctrl/⌘ + Space untuk saran</small></div></div>
      <button type="button" ref={button} className="datasets-action" onClick={() => expanded ? close() : setExpanded(true)}>{expanded ? '✕ Tutup editor' : '⛶ Perbesar editor'}</button></div>
    <SqlEditor key={expanded ? 'expanded' : 'inline'} value={value} onChange={onChange} onRun={onRun} sources={sources} sourceColumns={sourceColumns} columns={knownColumns} searchColumns={searchColumns} connectionType={connectionType} autofocus={expanded}/>
    {usesConnectionCredentials && <p className="sql-workbench-notice" role="note"><strong>DEV: SQL berjalan dengan seluruh izin akun Connection.</strong> Preview dan ingest dapat mengubah atau menghapus data jika akun memiliki izin tersebut. Result set terakhir digunakan; pemisah GO belum didukung. {saveAvailable ? 'Saat dijalankan, worker mengeksekusi skrip sekali untuk setiap job.' : 'Penyimpanan dataset menunggu metadata dan gateway siap.'}</p>}
    <div className="sql-workbench-run"><button type="button" className="datasets-action" disabled={!value.trim() || busy} onClick={onRun}>{busy ? 'Menjalankan preview…' : '▶ Uji query & preview'}</button><small>Saran kolom dicari dari database aktif setelah 2 karakter.</small></div>
    {error && <p className="sql-workbench-error" role="alert">{error}</p>}
    <div className="sql-workbench-results"><div className="sql-workbench-results-heading"><strong>Hasil preview</strong><span>{preview ? `${preview.rows.length} baris${preview.has_more ? ' · ada hasil lain' : ''}` : 'Jalankan query untuk melihat data'}</span></div>
      {preview && <div className="sql-workbench-table" role="region" aria-label="Grid hasil preview" tabIndex={0}><table><thead><tr><th scope="col">#</th>{preview.columns.map((column,index) => <th scope="col" key={`${index}-${column}`}>{column}</th>)}</tr></thead><tbody>{preview.rows.map((row,index) => <tr key={index}><th scope="row">{index + 1}</th>{row.map((cell,i) => <td key={i}>{cell === null ? <span className="sql-workbench-null">NULL</span> : String(cell)}</td>)}</tr>)}</tbody></table></div>}
    </div>
  </div>;
  if (!expanded) return workbench;
  return createPortal(<div className="sql-workbench-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>{workbench}</div>, document.body);
}
