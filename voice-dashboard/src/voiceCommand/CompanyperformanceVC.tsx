import { useEffect, useRef } from 'react';
import {
  COMPANY_PERFORMANCE_VOICE_COMMANDS,
  containsVoicePhrase,
  normalizeVoiceTranscript,
  resolveVoiceCommand,
} from './voiceCommandRegistry';

interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}

interface UseVoiceCommandCompanyPerformanceProps {
  healthcareList: HealthcareItem[];
  selectedHealthcareId: string;
  onHealthcareChange?: (id: string) => void;
  isCompareMode: boolean;
  setIsCompareMode: (compare: boolean) => void;
  setPanel1Mode: (mode: 'BAR' | 'RADIANT') => void;
  activeGraphs: number[];
  switchLayoutWithFade: (graphs: number[]) => void;
  setLeftHealthcareId: (id: string) => void;
  setRightHealthcareId: (id: string) => void;
  leftHealthcareId: string;
  SciFiAudio: {
    playBeep: (freq: number, type: OscillatorType, duration: number, vol: number) => void;
  };
}

const PNL_TARGETS: Record<string, { targetKey: string; exactMatch?: string }> = {
  cp_pnl_gross_profit: { targetKey: 'gross-profit', exactMatch: 'gross-profit' },
  cp_pnl_operating_profit: { targetKey: 'operating-profit', exactMatch: 'operating-profit' },
  cp_pnl_eat: { targetKey: 'eat', exactMatch: 'eat' },
  cp_pnl_ebit: { targetKey: 'ebit', exactMatch: 'ebit' },
  cp_pnl_ebt: { targetKey: 'ebt', exactMatch: 'ebt' },
  cp_pnl_cogs: { targetKey: 'c-o-g-s', exactMatch: 'c-o-g-s' },
  cp_pnl_revenue: { targetKey: 'revenue' },
};

function isComparePnlTranscript(transcript: string) {
  const hasCompareWord =
    containsVoicePhrase(transcript, 'bandingkan') ||
    containsVoicePhrase(transcript, 'compare') ||
    containsVoicePhrase(transcript, 'versus') ||
    containsVoicePhrase(transcript, 'vs');

  const hasPnlIntent =
    containsVoicePhrase(transcript, 'detail pnl') ||
    containsVoicePhrase(transcript, 'pnl') ||
    containsVoicePhrase(transcript, 'p n l') ||
    containsVoicePhrase(transcript, 'profit and loss') ||
    containsVoicePhrase(transcript, 'profit loss') ||
    containsVoicePhrase(transcript, 'detail profit and loss') ||
    containsVoicePhrase(transcript, 'laporan laba rugi') ||
    containsVoicePhrase(transcript, 'laba rugi');

  return hasCompareWord && hasPnlIntent;
}


const COMPANY_GRAPH_CODE_MAP: Record<string, number> = {
  a: 1,
  '1': 1,
  satu: 1,
  b: 2,
  '2': 2,
  dua: 2,
  c: 3,
  '3': 3,
  tiga: 3,
  d: 4,
  '4': 4,
  empat: 4,
};

const COMPANY_GRAPH_SEMANTIC_MAP: Array<{ graph: number; phrases: string[] }> = [
  { graph: 1, phrases: ['quarterly revenue', 'quarter revenue', 'revenue intelligence', 'pendapatan kuartal'] },
  { graph: 2, phrases: ['revenue summary', 'executive revenue', 'exsum revenue'] },
  { graph: 3, phrases: ['material summary', 'executive material', 'exsum material', 'material cost'] },
  { graph: 4, phrases: ['doctor fee summary', 'doctor fee', 'exsum doctor fee'] },
];

/**
 * Company Performance supports multi-panel layouts. This parser intentionally
 * lives only in the Company Performance voice handler, so graph codes A-D can
 * never leak into Daily Tracking or another dashboard.
 */
function resolveCompanyGraphSelection(transcript: string): number[] | null {
  const normalized = normalizeVoiceTranscript(transcript);
  if (!normalized) return null;

  const selected = new Set<number>();
  const hasGraphContext =
    containsVoicePhrase(normalized, 'grafik') ||
    containsVoicePhrase(normalized, 'panel');

  if (hasGraphContext) {
    normalized.split(' ').forEach((token) => {
      const graph = COMPANY_GRAPH_CODE_MAP[token];
      if (graph) selected.add(graph);
    });
  }

  // Named graph combinations are also accepted, for example:
  // "Quarterly Revenue dan Material Summary".
  const semanticMatches: number[] = [];
  COMPANY_GRAPH_SEMANTIC_MAP.forEach(({ graph, phrases }) => {
    if (phrases.some((phrase) => containsVoicePhrase(normalized, phrase))) {
      semanticMatches.push(graph);
    }
  });

  // One semantic graph is handled by the normal registry command so names such
  // as "Quarterly Revenue" keep their dedicated behavior. Two or more names
  // are a layout-combination request.
  if (semanticMatches.length >= 2) {
    semanticMatches.forEach((graph) => selected.add(graph));
  }

  if (!selected.size) return null;
  return Array.from(selected).sort((a, b) => a - b);
}

function healthcareAliases(name: string) {
  const normalized = normalizeVoiceTranscript(name.replace(/@/g, ' '));
  const pieces = normalized.split(' ').filter(Boolean);
  const generic = new Set(['rs', 'mata', 'jec', 'eye', 'center', 'rumah', 'sakit']);
  const meaningful = pieces.filter((piece) => !generic.has(piece));

  const aliases = new Set<string>([normalized]);
  if (meaningful.length) aliases.add(meaningful.join(' '));
  if (meaningful.length) aliases.add(meaningful[meaningful.length - 1]);
  return Array.from(aliases).filter((alias) => alias.length >= 3);
}

function findMentionedHealthcare(transcript: string, healthcareList: HealthcareItem[], allowAmbiguous = false) {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);
  const matches: Array<{ id: string; index: number; aliasLength: number }> = [];

  // Short aliases such as “Kedoya” are convenient, but only safe when unique.
  // If two master records share an alias, require a longer/full healthcare name
  // rather than silently selecting the wrong node.
  const aliasOwners = new Map<string, Set<string>>();
  healthcareList.forEach((healthcare) => {
    healthcareAliases(healthcare.healthcareName).forEach((alias) => {
      const owners = aliasOwners.get(alias) ?? new Set<string>();
      owners.add(healthcare.healthcareID);
      aliasOwners.set(alias, owners);
    });
  });

  healthcareList.forEach((healthcare) => {
    let bestIndex = -1;
    let bestLength = -1;
    healthcareAliases(healthcare.healthcareName).forEach((alias) => {
      if (!allowAmbiguous && (aliasOwners.get(alias)?.size ?? 0) > 1) return;
      const index = ` ${normalizedTranscript} `.indexOf(` ${alias} `);
      if (index >= 0 && alias.length > bestLength) {
        bestIndex = index;
        bestLength = alias.length;
      }
    });
    if (bestIndex >= 0) matches.push({ id: healthcare.healthcareID, index: bestIndex, aliasLength: bestLength });
  });

  // A site can match both its full and short name; keep one best match per healthcare ID.
  const byId = new Map<string, { id: string; index: number; aliasLength: number }>();
  matches.forEach((match) => {
    const current = byId.get(match.id);
    if (!current || match.aliasLength > current.aliasLength) byId.set(match.id, match);
  });
  return Array.from(byId.values()).sort((a, b) => a.index - b.index);
}

export function useVoiceCommandCompanyPerformance({
  healthcareList,
  selectedHealthcareId,
  onHealthcareChange,
  isCompareMode,
  setIsCompareMode,
  setPanel1Mode,
  activeGraphs,
  switchLayoutWithFade,
  setLeftHealthcareId,
  setRightHealthcareId,
  leftHealthcareId,
  SciFiAudio,
}: UseVoiceCommandCompanyPerformanceProps) {
  const lastHandledRef = useRef<{ transcript: string; at: number }>({ transcript: '', at: 0 });
  const previousLayoutRef = useRef<number[] | null>(null);

  useEffect(() => {
    // Keep voice healthcare selection on the same state path as the manual selector.
    // This updates both the local Company Performance state and the parent/global selector.
    const selectPrimaryHealthcare = (id: string) => {
      setLeftHealthcareId(id);
      onHealthcareChange?.(id);
    };

    const scrollPnl = (target: { targetKey: string; exactMatch?: string }) => {
      SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);
      window.setTimeout(() => {
        (window as any).__isVoiceScrolling = true;

        const leftContainer = document.querySelector<HTMLElement>('.left-pnl-scroll');
        const rightContainer = document.querySelector<HTMLElement>('.right-pnl-scroll');
        const fallback = document.querySelector<HTMLElement>('.company-pnl-scroll');
        const containers = isCompareMode
          ? [leftContainer, rightContainer].filter(Boolean) as HTMLElement[]
          : [leftContainer || fallback].filter(Boolean) as HTMLElement[];

        containers.forEach((container) => {
          let targetRow: HTMLElement | null = null;
          if (target.exactMatch) {
            targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-slug="${target.exactMatch}"]`);
          }
          if (!targetRow) {
            targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-total="true"][data-pnl-slug*="${target.targetKey}"]`);
          }
          if (!targetRow) {
            targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-slug*="${target.targetKey}"]`);
          }
          if (!targetRow) return;

          const containerRect = container.getBoundingClientRect();
          const rowRect = targetRow.getBoundingClientRect();
          const thead = container.querySelector<HTMLElement>('thead');
          const stickyHeaderHeight = thead?.offsetHeight ?? 38;
          const relativeTop = rowRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({
            top: Math.max(0, relativeTop - stickyHeaderHeight),
            behavior: 'smooth',
          });
        });

        window.setTimeout(() => {
          (window as any).__isVoiceScrolling = false;
        }, 1000);
      }, 80);
    };

    const normalizeLayout = (graphs: number[]) =>
      Array.from(new Set(graphs.filter((graph) => graph >= 1 && graph <= 5))).sort((a, b) => a - b);

    const switchVoiceLayout = (graphs: number[]) => {
      const current = normalizeLayout(activeGraphs);
      const next = normalizeLayout(graphs);

      const isSame =
        current.length === next.length &&
        current.every((graph, index) => graph === next[index]);

      if (!isSame) {
        previousLayoutRef.current = [...current];
      }

      switchLayoutWithFade(next);
    };

    const restorePreviousVoiceLayout = () => {
      const previous = previousLayoutRef.current;
      if (!previous?.length) {
        switchLayoutWithFade([1, 2, 3, 4]);
        return;
      }

      const current = normalizeLayout(activeGraphs);
      previousLayoutRef.current = [...current];
      switchLayoutWithFade(previous);
    };

    const tryLandscapeLock = () => {
      if (typeof window === 'undefined' || window.innerWidth > 767) return;
      if (!document.fullscreenElement) return;

      const orientation = window.screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };

      orientation?.lock?.('landscape').catch(() => {
        // Orientation lock is browser/device dependent. Responsive layout remains usable.
      });
    };

    const handleVoiceCommand = (event: Event) => {
      const rawTranscript = String((event as CustomEvent<string>).detail ?? '');
      const transcript = normalizeVoiceTranscript(rawTranscript);
      if (!transcript) return;

      // Browser recognition can occasionally emit the same final phrase twice.
      const now = Date.now();
      if (
        lastHandledRef.current.transcript === transcript &&
        now - lastHandledRef.current.at < 1100
      ) return;
      lastHandledRef.current = { transcript, at: now };

      // Resolve healthcare names before normal command matching. This is
      // important for phrases such as:
      // "Bandingkan detail PNL Menteng dan Kedoya".
      // Without this guard, the generic "detail pnl" command wins first.
      const mentionedSites = findMentionedHealthcare(transcript, healthcareList);

      const hasCompareWord =
        containsVoicePhrase(transcript, 'bandingkan') ||
        containsVoicePhrase(transcript, 'compare') ||
        containsVoicePhrase(transcript, 'versus') ||
        containsVoicePhrase(transcript, 'vs');

      // Handle "all" selector commands before the generic resolver.
      // This guarantees phrases such as "Tampilkan semua cabang" reset
      // both the local selector and the parent/global healthcare selection.
      const resetHealthcareIntent = [
        'semua healthcare',
        'tampilkan semua healthcare',
        'munculkan semua healthcare',
        'seluruh healthcare',
        'all healthcare',
        'hapus filter healthcare',
        'semua cabang',
        'tampilkan semua cabang',
        'munculkan semua cabang',
        'seluruh cabang',
        'hapus filter cabang',
        'semua unit bisnis',
        'tampilkan semua unit bisnis',
        'munculkan semua unit bisnis',
        'seluruh unit bisnis',
        'hapus filter unit bisnis',
        'semua business unit',
        'tampilkan semua business unit',
        'munculkan semua business unit',
        'semua site',
        'tampilkan semua site',
        'munculkan semua site',
        'seluruh site',
        'hapus filter site',
        'semua node',
        'tampilkan semua node',
        'munculkan semua node',
        'reset healthcare',
        'reset cabang',
        'reset unit bisnis',
        'reset site',
        'reset node',
      ].some((phrase) => containsVoicePhrase(transcript, phrase));

      if (resetHealthcareIntent) {
        selectPrimaryHealthcare('');
        setRightHealthcareId('');
        if (isCompareMode) setIsCompareMode(false);
        SciFiAudio.playBeep(500, 'sine', 0.1, 0.05);
        return;
      }

      // Compare Detail P&L must run before the generic P&L command resolver.
      // This keeps phrases such as:
      // "Bandingkan detail PNL Menteng dan Kedoya"
      // from being swallowed by the simpler "Detail PNL" command.
      if (isComparePnlTranscript(transcript) && mentionedSites.length >= 2) {
        const [leftSite, rightSite] = mentionedSites;

        setIsCompareMode(true);
        setLeftHealthcareId(leftSite.id);
        setRightHealthcareId(rightSite.id);

        // switchLayoutWithFade already delays the actual layout swap, giving
        // React enough time to commit compare mode + left/right healthcare first.
        switchVoiceLayout([5]);

        SciFiAudio.playBeep(680, 'square', 0.1, 0.05);
        return;
      }

      // Layout combinations are resolved before normal commands. The mapping is
      // local to Company Performance: A=Quarterly Revenue, B=Revenue Summary,
      // C=Material Summary, D=Doctor Fee Summary.
      const graphSelection = resolveCompanyGraphSelection(transcript);
      if (graphSelection) {
        switchVoiceLayout(graphSelection);
        if (graphSelection.length >= 2) tryLandscapeLock();
        SciFiAudio.playBeep(graphSelection.length > 1 ? 850 : 900, 'sine', 0.08, 0.04);
        return;
      }

      const command = resolveVoiceCommand(transcript, COMPANY_PERFORMANCE_VOICE_COMMANDS);

      if (command) {
        const pnlTarget = PNL_TARGETS[command.id];
        if (pnlTarget) {
          switchVoiceLayout([5]);
          window.setTimeout(() => scrollPnl(pnlTarget), 520);
          return;
        }

        switch (command.id) {
          case 'cp_compare_pnl':
            if (mentionedSites.length >= 2) {
              const [leftSite, rightSite] = mentionedSites;
              setIsCompareMode(true);
              setLeftHealthcareId(leftSite.id);
              setRightHealthcareId(rightSite.id);
              switchVoiceLayout([5]);
              SciFiAudio.playBeep(680, 'square', 0.1, 0.05);
            }
            return;
          case 'cp_back_previous':
            restorePreviousVoiceLayout();
            SciFiAudio.playBeep(760, 'triangle', 0.08, 0.04);
            return;
          case 'cp_exit_compare':
            setIsCompareMode(false);
            SciFiAudio.playBeep(400, 'square', 0.1, 0.05);
            return;
          case 'cp_all_healthcare':
            selectPrimaryHealthcare('');
            setRightHealthcareId('');
            if (isCompareMode) setIsCompareMode(false);
            SciFiAudio.playBeep(500, 'sine', 0.1, 0.05);
            return;
          case 'cp_bar':
            setPanel1Mode('BAR');
            switchVoiceLayout([1]);
            SciFiAudio.playBeep(700, 'sine', 0.08, 0.04);
            return;
          case 'cp_radiant':
            setPanel1Mode('RADIANT');
            switchVoiceLayout([1]);
            SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
            return;
          case 'cp_restore':
            switchVoiceLayout([1, 2, 3, 4]);
            SciFiAudio.playBeep(800, 'sine', 0.08, 0.04);
            return;
          case 'cp_quarter_revenue':
            switchVoiceLayout([1]);
            SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
            return;
          case 'cp_revenue_summary':
            switchVoiceLayout([2]);
            SciFiAudio.playBeep(860, 'sine', 0.08, 0.04);
            return;
          case 'cp_material_summary':
            switchVoiceLayout([3]);
            SciFiAudio.playBeep(840, 'sine', 0.08, 0.04);
            return;
          case 'cp_doctor_fee':
            switchVoiceLayout([4]);
            SciFiAudio.playBeep(820, 'sine', 0.08, 0.04);
            return;
          case 'cp_pnl':
            switchVoiceLayout([5]);
            SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);
            return;
          default:
            break;
        }
      }

      // Dynamic healthcare selection remains scoped to Company Performance.
      // Compare is accepted when two healthcare names are explicitly spoken,
      // even if the user omits the word "healthcare".
      const healthcareContext =
        containsVoicePhrase(transcript, 'healthcare') ||
        containsVoicePhrase(transcript, 'cabang') ||
        containsVoicePhrase(transcript, 'unit bisnis') ||
        containsVoicePhrase(transcript, 'business unit') ||
        containsVoicePhrase(transcript, 'site') ||
        containsVoicePhrase(transcript, 'node');
      const compareIntent =
        hasCompareWord &&
        (healthcareContext || mentionedSites.length >= 2);
      const chooseIntent = healthcareContext && (
        containsVoicePhrase(transcript, 'pilih') ||
        containsVoicePhrase(transcript, 'tampilkan') ||
        containsVoicePhrase(transcript, 'munculkan') ||
        containsVoicePhrase(transcript, 'buka') ||
        containsVoicePhrase(transcript, 'ganti') ||
        containsVoicePhrase(transcript, 'ubah') ||
        containsVoicePhrase(transcript, 'filter') ||
        containsVoicePhrase(transcript, 'gunakan') ||
        containsVoicePhrase(transcript, 'set')
      );

      if (compareIntent && mentionedSites.length >= 2) {
        setIsCompareMode(true);
        setLeftHealthcareId(mentionedSites[0].id);
        setRightHealthcareId(mentionedSites[1].id);
        SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
        return;
      }

      if (mentionedSites.length === 1 && compareIntent) {
        if (!isCompareMode) setIsCompareMode(true);
        if (!leftHealthcareId) setLeftHealthcareId(selectedHealthcareId);
        setRightHealthcareId(mentionedSites[0].id);
        SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
        return;
      }

      const selectionSites = chooseIntent
        ? findMentionedHealthcare(transcript, healthcareList, true)
        : [];

      if (selectionSites.length >= 1 && chooseIntent) {
        const targetId = selectionSites[0].id;
        const rightIntent = containsVoicePhrase(transcript, 'kanan');
        if (isCompareMode && rightIntent) setRightHealthcareId(targetId);
        else selectPrimaryHealthcare(targetId);
        SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
      }
    };

    const listener = handleVoiceCommand as EventListener;

    // Capture-phase listener also receives commands dispatched from document-level
    // sources. Document listener is retained as a compatibility fallback.
    window.addEventListener('coa-voice-command', listener, true);
    document.addEventListener('coa-voice-command', listener, true);

    return () => {
      window.removeEventListener('coa-voice-command', listener, true);
      document.removeEventListener('coa-voice-command', listener, true);
    };
  }, [
    healthcareList,
    selectedHealthcareId,
    onHealthcareChange,
    isCompareMode,
    leftHealthcareId,
    setIsCompareMode,
    setPanel1Mode,
    activeGraphs,
    switchLayoutWithFade,
    setLeftHealthcareId,
    setRightHealthcareId,
    SciFiAudio,
  ]);
}
