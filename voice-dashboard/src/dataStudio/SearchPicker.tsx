import { useId, useRef, useState } from 'react';

type Option = { value: string; label: string; detail?: string };
export default function SearchPicker({ label, placeholder, options, value, onSelect, onSearch, disabled, loading, hasMore, onMore }: {
  label: string; placeholder: string; options: Option[]; value: string; onSelect: (value: string) => void; onSearch?: (text: string) => void; disabled?: boolean; loading?: boolean; hasMore?: boolean; onMore?: () => void;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = options.find(option => option.value === value);
  const shown = onSearch || !editing ? options : options.filter(option => `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(text.toLowerCase()));
  const visible = onSearch ? shown : shown.slice(0, 50);
  const choose = (option: Option) => { onSelect(option.value); setText(option.label); setEditing(false); setOpen(false); setActive(-1); };
  return <div className="datasets-picker" ref={container} onBlur={event => { if (event.relatedTarget && container.current?.contains(event.relatedTarget)) return; setOpen(false); setEditing(false); setText(selected?.label ?? ''); }}><label htmlFor={id}>{label}</label><div className="datasets-picker-control"><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} autoComplete="off" maxLength={onSearch ? 128 : 255} disabled={disabled} value={editing ? text : selected?.label ?? text} placeholder={placeholder}
    onFocus={() => { setOpen(true); setActive(-1); }}
    onChange={event => { setText(event.target.value); setEditing(true); setOpen(true); setActive(-1); onSelect(''); onSearch?.(event.target.value); }}
    onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.currentTarget.blur(); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(visible.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); } else if (event.key === 'Enter' && open && active >= 0 && visible[active]) { event.preventDefault(); choose(visible[active]); } }} /><span aria-hidden="true">⌄</span></div>
    {open && !disabled && <div className="datasets-picker-menu" onMouseDown={event => event.preventDefault()}><div id={`${id}-list`} role="listbox" aria-label={label}>{visible.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} id={`${id}-option-${index}`} key={option.value} className={index === active ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</button>)}</div>{loading ? <p role="status">Memuat…</p> : !shown.length ? <p>Tidak ada hasil yang cocok.</p> : null}{onMore && hasMore && <button type="button" className="datasets-picker-more" onClick={onMore}>Muat lebih banyak</button>}{!onSearch && shown.length > 50 && <p>Ketik untuk mempersempit {shown.length} hasil.</p>}</div>}
  </div>;
}
