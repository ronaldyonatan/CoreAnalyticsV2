import { useEffect, useRef, useState } from 'react';
import OwnershipPicker from './OwnershipPicker';

/** Defers ownership RPC for catalog entries until they're visible.
 * Object authorization is always enforced server-side; this component is presentation only. */
export default function OwnershipGrid({ objectType, objectId, fallbackOwner }: {
  objectType: 'DATASET' | 'CONNECTION' | 'PIPELINE' | 'SCHEDULE' | 'CHART';
  objectId: string;
  fallbackOwner?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const target = ref.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [objectId, objectType]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(objectId || '')) {
    return <span className="studio-owner-unavailable" title="Ownership ID belum tersedia">—</span>;
  }
  return <span ref={ref} className="studio-owner-inline">{visible ? <OwnershipPicker objectType={objectType} objectId={objectId} fallbackOwner={fallbackOwner}/> : <span className="studio-owner-loading" title="Memuat pemilik…">◌</span>}</span>;
}
