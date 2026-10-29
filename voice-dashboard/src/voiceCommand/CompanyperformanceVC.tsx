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
  isCompareMode: boolean;
  setIsCompareMode: (compare: boolean) => void;
  setPanel1Mode: (mode: 'BAR' | 'RADIANT') => void;
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

function findMentionedHealthcare(transcript: string, healthcareList: HealthcareItem[]) {
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
      if ((aliasOwners.get(alias)?.size ?? 0) > 1) return;
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
  isCompareMode,
  setIsCompareMode,
  setPanel1Mode,
  switchLayoutWithFade,
  setLeftHealthcareId,
  setRightHealthcareId,
  leftHealthcareId,
  SciFiAudio,
}: UseVoiceCommandCompanyPerformanceProps) {
  const lastHandledRef = useRef<{ transcript: string; at: number }>({ transcript: '', at: 0 });

  useEffect(() => {
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

      const command = resolveVoiceCommand(transcript, COMPANY_PERFORMANCE_VOICE_COMMANDS);

      if (command) {
        const pnlTarget = PNL_TARGETS[command.id];
        if (pnlTarget) {
          switchLayoutWithFade([5]);
          window.setTimeout(() => scrollPnl(pnlTarget), 520);
          return;
        }

        switch (command.id) {
          case 'cp_exit_compare':
            setIsCompareMode(false);
            SciFiAudio.playBeep(400, 'square', 0.1, 0.05);
            return;
          case 'cp_all_healthcare':
            setLeftHealthcareId('');
            setRightHealthcareId('');
            if (isCompareMode) setIsCompareMode(false);
            SciFiAudio.playBeep(500, 'sine', 0.1, 0.05);
            return;
          case 'cp_bar':
            setPanel1Mode('BAR');
            switchLayoutWithFade([1]);
            SciFiAudio.playBeep(700, 'sine', 0.08, 0.04);
            return;
          case 'cp_radiant':
            setPanel1Mode('RADIANT');
            switchLayoutWithFade([1]);
            SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
            return;
          case 'cp_restore':
            switchLayoutWithFade([1, 2, 3, 4]);
            SciFiAudio.playBeep(800, 'sine', 0.08, 0.04);
            return;
          case 'cp_quarter_revenue':
            switchLayoutWithFade([1]);
            SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
            return;
          case 'cp_revenue_summary':
            switchLayoutWithFade([2]);
            SciFiAudio.playBeep(860, 'sine', 0.08, 0.04);
            return;
          case 'cp_material_summary':
            switchLayoutWithFade([3]);
            SciFiAudio.playBeep(840, 'sine', 0.08, 0.04);
            return;
          case 'cp_doctor_fee':
            switchLayoutWithFade([4]);
            SciFiAudio.playBeep(820, 'sine', 0.08, 0.04);
            return;
          case 'cp_pnl':
            switchLayoutWithFade([5]);
            SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);
            return;
          default:
            break;
        }
      }

      // Dynamic healthcare names are resolved only when the utterance clearly
      // carries a healthcare/select/compare intent. A bare site name is ignored.
      const mentionedSites = findMentionedHealthcare(transcript, healthcareList);
      const healthcareContext =
        containsVoicePhrase(transcript, 'healthcare') ||
        containsVoicePhrase(transcript, 'cabang') ||
        containsVoicePhrase(transcript, 'node');
      const compareIntent = healthcareContext && (
        containsVoicePhrase(transcript, 'bandingkan') ||
        containsVoicePhrase(transcript, 'compare') ||
        containsVoicePhrase(transcript, 'versus') ||
        containsVoicePhrase(transcript, 'vs')
      );
      const chooseIntent = healthcareContext && (
        containsVoicePhrase(transcript, 'pilih') ||
        containsVoicePhrase(transcript, 'tampilkan') ||
        containsVoicePhrase(transcript, 'buka') ||
        containsVoicePhrase(transcript, 'ganti') ||
        containsVoicePhrase(transcript, 'ubah')
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

      if (mentionedSites.length === 1 && chooseIntent) {
        const targetId = mentionedSites[0].id;
        const rightIntent = containsVoicePhrase(transcript, 'kanan');
        if (isCompareMode && rightIntent) setRightHealthcareId(targetId);
        else setLeftHealthcareId(targetId);
        SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
      }
    };

    window.addEventListener('coa-voice-command', handleVoiceCommand as EventListener);
    return () => window.removeEventListener('coa-voice-command', handleVoiceCommand as EventListener);
  }, [
    healthcareList,
    selectedHealthcareId,
    isCompareMode,
    leftHealthcareId,
    setIsCompareMode,
    setPanel1Mode,
    switchLayoutWithFade,
    setLeftHealthcareId,
    setRightHealthcareId,
    SciFiAudio,
  ]);
}
