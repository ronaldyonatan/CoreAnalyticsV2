import type { ButtonHTMLAttributes, ComponentPropsWithRef, FormHTMLAttributes, HTMLAttributes, LabelHTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';
/** Shared structural primitives. Existing feature callbacks remain owned by their modules. */
export function UniverseHeader({children,className='',...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <header {...props} data-universe-part="header" className={`universe-header ${className}`.trim()}>{children}</header>;
}
export function UniverseToolbar({children,className='',...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}) {
  return <div {...props} data-universe-part="toolbar" className={`universe-toolbar ${className}`.trim()}>{children}</div>;
}
export function UniverseTable({children,className='',...props}:TableHTMLAttributes<HTMLTableElement>&{children:ReactNode}) {
  return <table {...props} data-universe-part="table" className={`universe-table ${className}`.trim()}>{children}</table>;
}
export function UniverseInspector({children,className='',...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <aside {...props} data-universe-part="inspector" className={`universe-inspector ${className}`.trim()}>{children}</aside>;
}

/** Shared catalog row, form section, and compact menu for subsequent feature migration. */
export function UniverseCatalogRow({children,className='',...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}) {
  return <div {...props} data-universe-part="catalog-row" className={`universe-catalog-row ${className}`.trim()}>{children}</div>;
}
export function UniverseFormSection({children,className='',...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <section {...props} data-universe-part="form-section" className={`universe-form-section ${className}`.trim()}>{children}</section>;
}
export function UniverseQuickMenu({children,className='',...props}:ComponentPropsWithRef<'div'>&{children:ReactNode}) {
  return <div {...props} data-universe-part="quick-menu" className={`universe-quick-menu ${className}`.trim()}>{children}</div>;
}

/** One row/button contract for navigable catalog and selectable history entries. */
export function UniverseCatalogButton({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{children:ReactNode}) {
  return <button {...props} data-universe-part="catalog-button" className={`universe-catalog-button ${className}`.trim()}>{children}</button>;
}
/** Native form behavior and validation remain unchanged, only the shared surface is applied. */
export function UniverseForm({children,className='',...props}:FormHTMLAttributes<HTMLFormElement>&{children:ReactNode}) {
  return <form {...props} data-universe-part="form" className={`universe-form ${className}`.trim()}>{children}</form>;
}
export function UniverseField({children,className='',...props}:LabelHTMLAttributes<HTMLLabelElement>&{children:ReactNode}) {
  return <label {...props} data-universe-part="field" className={`universe-field ${className}`.trim()}>{children}</label>;
}
export function UniverseTabs({children,className='',...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <nav {...props} data-universe-part="tabs" className={`universe-tabs ${className}`.trim()}>{children}</nav>;
}
export function UniversePanel({children,className='',...props}:ComponentPropsWithRef<'div'>&{children:ReactNode}) {
  return <div {...props} data-universe-part="panel" className={`universe-panel ${className}`.trim()}>{children}</div>;
}

/** Shared vertical collection for catalog buttons, cards and menu-attached rows. */
export function UniverseCatalogList({children,className='',...props}:ComponentPropsWithRef<'div'>&{children:ReactNode}) {
  return <div {...props} data-universe-part="catalog-list" className={`universe-catalog-list ${className}`.trim()}>{children}</div>;
}

/** Opt-in theme-aware scope for future CoreAnalytics menus outside Data Universe. */
export function UniverseScope({children,className='',...props}:ComponentPropsWithRef<'div'>&{children:ReactNode}) {
  return <div {...props} data-core-ui="unified" className={`universe-scope ${className}`.trim()}>{children}</div>;
}
