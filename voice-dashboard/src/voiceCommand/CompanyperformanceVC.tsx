import { useEffect } from 'react';

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
  SciFiAudio
}: UseVoiceCommandCompanyPerformanceProps) {
  useEffect(() => {
    const handleVoiceCommand = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const transcript = customEvent.detail?.toLowerCase() || '';

      // 1. KELUAR DARI MODE KOMPARASI
      const isExitCompare = 
        transcript.includes('kembali ke mode utama') || 
        transcript.includes('tutup mode komparasi') || 
        transcript.includes('tutup perbandingan') || 
        transcript.includes('keluar dari perbandingan') || 
        transcript.includes('single view') || 
        transcript.includes('mode normal') || 
        transcript.includes('akhiri komparasi');

      if (isExitCompare) {
        setIsCompareMode(false);
        SciFiAudio.playBeep(400, 'square', 0.1, 0.05);
        return;
      }

      // 2. PERINTAH HAPUS / RESET FILTER CABANG
      const isClearFilter = 
        transcript.includes('hapus filter') || 
        transcript.includes('reset filter') || 
        transcript.includes('clear filter') || 
        transcript.includes('semua cabang') || 
        transcript.includes('tampilkan semua') || 
        transcript.includes('semua healthcare') || 
        transcript.includes('reset cabang') || 
        transcript.includes('all healthcare');

      if (isClearFilter) {
        setLeftHealthcareId('');
        setRightHealthcareId('');
        if (isCompareMode) setIsCompareMode(false);
        SciFiAudio.playBeep(500, 'sine', 0.1, 0.05);
        return;
      }

      // 3. TIPE GRAFIK (BAR / RADIANT)
      if (transcript.includes('bar') || transcript.includes('batang')) {
        setPanel1Mode('BAR'); 
        SciFiAudio.playBeep(700, 'sine', 0.08, 0.04);
      } else if (transcript.includes('radiant') || transcript.includes('lingkar')) {
        setPanel1Mode('RADIANT'); 
        SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
      }

// 4. SCROLL OTOMATIS DENGAN SMOOTH SCROLLING & AMAN DARI INTERFERENSI SYNC
      const isScrollPnLIntent = 
        transcript.includes('lihat') || 
        transcript.includes('scroll') || 
        transcript.includes('ke bagian') || 
        transcript.includes('posisi') || 
        transcript.includes('tunjukkan') || 
        transcript.includes('gross profit') ||
        transcript.includes('operating profit') ||
        transcript.includes('ebit') ||
        transcript.includes('ebt') ||
        transcript.includes('eat') ||
        transcript.includes('cogs') ||
        transcript.includes('revenue') ||
        transcript.includes('laba') ||
        transcript.includes('pendapatan');

      if (isScrollPnLIntent) {
        const pnlTargets: { keywords: string[]; targetKey: string; exactMatch?: string }[] = [
          { keywords: ['gross profit', 'laba kotor'], targetKey: 'gross-profit', exactMatch: 'gross-profit' },
          { keywords: ['operating profit', 'laba operasional', 'laba usaha'], targetKey: 'operating-profit', exactMatch: 'operating-profit' },
          { keywords: ['laba bersih', 'net profit', 'eat'], targetKey: 'eat', exactMatch: 'eat' },
          { keywords: ['ebitda', 'ebit'], targetKey: 'ebit', exactMatch: 'ebit' },
          { keywords: ['ebt'], targetKey: 'ebt', exactMatch: 'ebt' },
          { keywords: ['cogs', 'c.o.g.s', 'hpp', 'harga pokok'], targetKey: 'c-o-g-s', exactMatch: 'c-o-g-s' },
          { keywords: ['revenue', 'pendapatan', 'omset', 'penjualan'], targetKey: 'revenue' }
        ];

        let matchedTarget = pnlTargets[0];
        let found = false;
        for (const target of pnlTargets) {
          if (target.keywords.some(kw => transcript.includes(kw))) {
            matchedTarget = target;
            found = true;
            break;
          }
        }

        if (found) {
          SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);

          setTimeout(() => {
            (window as any).__isVoiceScrolling = true;

            const leftContainer = document.querySelector<HTMLElement>('.left-pnl-scroll');
            const rightContainer = document.querySelector<HTMLElement>('.right-pnl-scroll');
            
            const containers = isCompareMode 
              ? [leftContainer, rightContainer].filter(Boolean) as HTMLElement[]
              : [leftContainer || document.querySelector<HTMLElement>('div.overflow-auto')].filter(Boolean) as HTMLElement[];

            containers.forEach((container, idx) => {
              if (!container) return;

              let targetRow: HTMLElement | null = null;

              if (matchedTarget.exactMatch) {
                targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-slug="${matchedTarget.exactMatch}"]`);
              }
              if (!targetRow) {
                targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-total="true"][data-pnl-slug*="${matchedTarget.targetKey}"]`);
              }
              if (!targetRow) {
                targetRow = container.querySelector<HTMLElement>(`tr[data-pnl-slug*="${matchedTarget.targetKey}"]`);
              }

              if (targetRow) {
                const containerRect = container.getBoundingClientRect();
                const rowRect = targetRow.getBoundingClientRect();
                
                const relativeTop = rowRect.top - containerRect.top + container.scrollTop;
                
                const theadEl = container.querySelector<HTMLElement>('thead');
                const stickyHeaderHeight = theadEl ? theadEl.offsetHeight : 38;

                const targetScrollTop = Math.max(0, relativeTop - stickyHeaderHeight);

                // Gunakan kembali smooth scroll dengan durasi kunci flag yang lebih aman (1000ms)
                container.scrollTo({
                  top: targetScrollTop,
                  behavior: 'smooth'
                });

                console.log(`--- [VOICE SMOOTH SCROLL] Panel [${idx === 0 ? 'KIRI' : 'KANAN'}] ---`, {
                  mode: isCompareMode ? 'COMPARE' : 'SINGLE',
                  rowText: targetRow.textContent?.trim(),
                  targetScrollTop
                });
              }
            });

            // Pastikan flag kunci aktif lebih lama dari durasi animasi smooth scroll (1000ms)
            setTimeout(() => {
              (window as any).__isVoiceScrolling = false;
            }, 1000);
          }, 50);

          return;
        }
      }

      // 5. PERINTAH DENGAN SWITCH LAYOUT
      const isDetailPnLCommand = 
        transcript.includes('detail pnl') || 
        transcript.includes('pnl') || 
        transcript.includes('tabel pnl') || 
        transcript.includes('profit and loss');

      if (isDetailPnLCommand) {
        switchLayoutWithFade([5]);
        SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);
      } else {
        const isLayoutCommand = transcript.includes('grafik') || transcript.includes('panel') || transcript.includes('semua') || transcript.includes('empat') || transcript.includes('default');
        
        if (isLayoutCommand) {
          if (transcript.includes('semua') || transcript.includes('empat') || transcript.includes('default') || transcript.includes('1, 2, 3, dan 4') || transcript.includes('1 2 3 4')) {
            switchLayoutWithFade([1, 2, 3, 4]); SciFiAudio.playBeep(800, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1, 2, dan 3') || transcript.includes('1 2 3') || transcript.includes('tiga grafik')) {
            switchLayoutWithFade([1, 2, 3]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1, 2, dan 4') || transcript.includes('1 2 4')) {
            switchLayoutWithFade([1, 2, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1, 3, dan 4') || transcript.includes('1 3 4')) {
            switchLayoutWithFade([1, 3, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('2, 3, dan 4') || transcript.includes('2 3 4')) {
            switchLayoutWithFade([2, 3, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1 dan 2') || transcript.includes('1 2')) {
            switchLayoutWithFade([1, 2]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1 dan 3') || transcript.includes('1 3')) {
            switchLayoutWithFade([1, 3]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('1 dan 4') || transcript.includes('1 4')) {
            switchLayoutWithFade([1, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('2 dan 3') || transcript.includes('2 3')) {
            switchLayoutWithFade([2, 3]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('2 dan 4') || transcript.includes('2 4')) {
            switchLayoutWithFade([2, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('3 dan 4') || transcript.includes('3 4')) {
            switchLayoutWithFade([3, 4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('grafik 1') || transcript.includes('panel 1') || transcript.includes('grafik satu')) {
            switchLayoutWithFade([1]); SciFiAudio.playBeep(900, 'sine', 0.08, 0.04);
          } else if (transcript.includes('grafik 2') || transcript.includes('panel 2') || transcript.includes?.('grafik dua')) {
            switchLayoutWithFade([2]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('grafik 3') || transcript.includes('panel 3') || transcript.includes('grafik tiga')) {
            switchLayoutWithFade([3]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          } else if (transcript.includes('grafik 4') || transcript.includes('panel 4') || transcript.includes('grafik empat')) {
            switchLayoutWithFade([4]); SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
          }
        }
      }

      // 6. FILTER CABANG
      let mentionedSites: { id: string, index: number }[] = [];
      for (const hc of healthcareList) {
        const rawName = hc.healthcareName.toLowerCase();
        const keyword = rawName.includes('@') ? rawName.split('@')[1] : rawName.replace('rs ', '').replace('jec ', '').trim();
        
        const idx = transcript.indexOf(keyword);
        if (idx !== -1) {
          mentionedSites.push({ id: hc.healthcareID, index: idx });
        }
      }

      // 7. PERINTAH SUARA: MENJELASKAN GRAFIK PNL MENGGUNAKAN BROWSER TTS (TANPA AI)
      const isExplainPnL = 
        transcript.includes('tolong jelaskan grafik pnl ini') || 
        transcript.includes('jelaskan grafik pnl') || 
        transcript.includes('jelaskan pnl');

      if (isExplainPnL) {
        SciFiAudio.playBeep(950, 'sine', 0.08, 0.04);

        if ('speechSynthesis' in window) {
          // Hentikan suara yang sedang aktif sebelumnya agar tidak tumpang tindih
          window.speechSynthesis.cancel();

          const narrationText = "Jika dilihat dari grafik pnl ini, maka jelas kedoya lebih unggul daripada menteng di pendapatan flac, sedangkan menteng menungguli kedoya di pendapatan lasik.";
          
          const utterance = new SpeechSynthesisUtterance(narrationText);
          utterance.lang = 'id-ID'; // Atur bahasa ke Bahasa Indonesia
          utterance.rate = 1.0;     // Kecepatan baca (1.0 normal)
          utterance.pitch = 1.1;    // Nada suara

          // Opsional: Cari suara bahasa Indonesia bawaan sistem jika tersedia
          const voices = window.speechSynthesis.getVoices();
          const indonesianVoice = voices.find(v => v.lang === 'id-ID' || v.lang.toLowerCase().includes('indonesia'));
          if (indonesianVoice) {
            utterance.voice = indonesianVoice;
          }

          window.speechSynthesis.speak(utterance);
        } else {
          console.warn("Browser Anda tidak mendukung Speech Synthesis.");
        }

        return;
      }

      mentionedSites.sort((a, b) => a.index - b.index);

      const hasCompareIntent = transcript.includes('bandingkan') || transcript.includes('compare') || transcript.includes('vs');

      if (mentionedSites.length >= 2) {
        setIsCompareMode(true);
        setLeftHealthcareId(mentionedSites[0].id);   
        setRightHealthcareId(mentionedSites[1].id);  
        SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
      } else if (mentionedSites.length === 1) {
        if (hasCompareIntent) {
          if (!isCompareMode) setIsCompareMode(true);
          setRightHealthcareId(mentionedSites[0].id);
          if (!leftHealthcareId) setLeftHealthcareId(selectedHealthcareId);
          SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
        } else if (isCompareMode && (transcript.includes('ubah') || transcript.includes('ganti') || transcript.includes('kanan'))) {
          setRightHealthcareId(mentionedSites[0].id);
          SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
        } else {
          setLeftHealthcareId(mentionedSites[0].id);
          SciFiAudio.playBeep(650, 'square', 0.1, 0.05);
        }
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
    SciFiAudio
  ]);
}