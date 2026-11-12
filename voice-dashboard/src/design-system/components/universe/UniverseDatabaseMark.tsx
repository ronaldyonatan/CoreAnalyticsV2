import type { CSSProperties } from 'react';
/** Shared dataset-accurate source mark, reused across Catalog and Connections. */
export function UniverseDatabaseSourceIcon({ type }: { type: string }) {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'postgresql' || normalized === 'postgres') {
    // Distinct elephant-inspired silhouette, not a copied brand asset.
    return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 11V7a8 8 0 0 1 16 0v7c0 2-1 3-3 3h-2"/><path d="M8 13v5c0 2 1 3 3 3s3-1 3-3v-7"/><path d="M14 15c2 0 3 1 3 3M6 8h.01M18 8h.01"/><path d="M4 14c-2 0-2 3 0 4h3"/></svg>;
  }
  if (normalized === 'sqlserver' || normalized === 'sql_server' || normalized === 'mssql') {
    // SQL Server-inspired red ribbon mark. Original artwork, not an official Microsoft brand asset.
    return <svg width="25" height="25" viewBox="0 0 32 32" fill="none" aria-hidden="true" role="img">
      <path d="M5 9.2C10.5 3.2 20.7 3.4 27.5 8.3C22 7.3 17.2 8.4 12.6 11.2L6.4 15.1C5.2 13.3 4.8 11.5 5 9.2Z" fill="#E74856"/>
      <path d="M27.5 8.3C28.8 10.4 28.5 13.1 26.2 15.6C23.8 18.3 20.6 19.5 16.4 21.3C12.7 22.9 9.4 24.8 7.5 27.5C5.9 25.7 5.4 23.4 6.3 21.2C7.3 18.8 10.2 16.7 14.2 14.8C19.4 12.3 23.6 10.8 27.5 8.3Z" fill="#D62D3C"/>
      <path d="M7.5 27.5C13.2 29.5 22.1 27.7 26.6 22.8C27.4 21.9 27.9 20.9 28.1 19.8C24.5 22.5 20.1 23.8 15.4 25.4C12.4 26.4 9.9 27.1 7.5 27.5Z" fill="#A91D2B"/>
      <path d="M6.4 15.1C7.6 17 9.3 18.1 11.4 18.7C9.1 20.2 7.2 21.9 6.3 23.9C4.1 21.5 3.8 18.2 6.4 15.1Z" fill="#F16A73"/>
    </svg>;
  }
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/><path d="M16 10l3-3m-3 0h3v3"/></svg>;
}
export function UniverseDatabaseMark({type,title}:{type:string;title?:string}) {
 const style: CSSProperties = {
   display:'inline-flex',alignItems:'center',justifyContent:'center',width:35,height:35,flexShrink:0,
   borderRadius:11,color:'var(--studio-info, var(--color-info, #35b8e6))',
   background:'color-mix(in srgb, var(--studio-info, var(--color-info, #35b8e6)) 12%, transparent)',
   border:'1px solid color-mix(in srgb, currentColor 20%, transparent)'
 };
 return <span className="universe-database-mark" title={title || type} style={style}>
   <UniverseDatabaseSourceIcon type={type}/>
 </span>;
}
