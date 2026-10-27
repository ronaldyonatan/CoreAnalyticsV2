import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float as DreiFloat, MeshWobbleMaterial as DreiWobble, Sphere as DreiSphere, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import LoginPortal from './LoginPortal';

interface TrenPendapatanItem { month: string; revenue: string; revenue_2025?: string; revenue_2026?: string; month_name?: string; }
interface PerbandinganLayananItem { category: string; clinic: string; rs: string; }
interface PerformaLayananItem { category: string; kedoya: string; menteng: string; }
interface PertumbuhanPasienItem { totalPasien: number; year: string; }
interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}
type LayoutMode = 'STANDBY' | 'CUSTOM_GRAPHS';

class SciFiAudio {
  private static ctx: AudioContext | null = null;

  private static getContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  static playBeep(frequency = 800, type: OscillatorType = 'sine', duration = 0.08, vol = 0.05) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  static playWhoosh() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }
}

function CyberTunnelBackground() {
  const pointsRef = useRef<THREE.Points>(null!);
  const [sphere] = useState(() => {
    const data = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 3 + Math.random() * 7;
      data[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      data[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[i * 3 + 2] = r * Math.cos(phi);
    }
    return data;
  });

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.z -= delta * 0.15;
    }
  });

  return (
    <>
      <color attach="background" args={['#00030a']} />
      <fog attach="fog" args={['#00030a', 2, 15]} />
      <ambientLight intensity={0.8} />
      <Points ref={pointsRef} positions={sphere} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#00f2fe"
          size={0.035}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedHealthcareId, setSelectedHealthcareId] = useState<string>('');
  
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('CUSTOM_GRAPHS');
  const [activeGraphs, setActiveGraphs] = useState<number[]>([1, 2, 3, 4]);
  
  const [isScanning, setIsScanning] = useState(false);
  const [animateChart, setAnimateChart] = useState(false);
  
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const [aiAnalysisText, setAiAnalysisText] = useState('Iron Man Visor HUD online. All systems fully operational.');
  const [displayedAiText, setDisplayedAiText] = useState('');
  const [statusMessage, setStatusMessage] = useState('System active.');
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [healthcareList, setHealthcareList] = useState<HealthcareItem[]>([]);
  
  // State khusus untuk custom sci-fi dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [trenPendapatan, setTrenPendapatan] = useState<TrenPendapatanItem[]>([]);
  const [perbandinganLayanan, setPerbandinganLayanan] = useState<PerbandinganLayananItem[]>([]);
  const [performaLayanan, setPerformaLayanan] = useState<PerformaLayananItem[]>([]);
  const [pertumbuhanPasien, setPertumbuhanPasien] = useState<PertumbuhanPasienItem[]>([]);
  const [panel1Mode, setPanel1Mode] = useState<'BAR' | 'RADIANT'>('BAR');

  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);
  const processingCommandRef = useRef(false);

  // Efek klik di luar untuk menutup custom dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const forceStopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  }, []);

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 1.0;

    const voices = availableVoices.length > 0 ? availableVoices : synth.getVoices();
    const englishVoice = voices.find(v => v.lang === 'en-US' || v.lang.includes('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
      utterance.lang = 'en-US';
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      processingCommandRef.current = false;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      processingCommandRef.current = false;
    };

    synth.speak(utterance);
    if (synth.paused) synth.resume();
  }, [availableVoices]);

  const switchLayoutWithFade = useCallback((graphs: number[], analysisText: string) => {
    SciFiAudio.playWhoosh();
    setIsScanning(true);
    setTimeout(() => {
      setActiveGraphs(graphs);
      setLayoutMode('CUSTOM_GRAPHS');
      setAiAnalysisText(analysisText);
      setIsScanning(false);
    }, 450);
  }, []);

  const handleResetToLogin = useCallback(() => {
    SciFiAudio.playBeep(400, 'sawtooth', 0.15, 0.05);
    forceStopSpeaking();
    setIsLoggedIn(false);
  }, [forceStopSpeaking]);

  useEffect(() => {
    const updateVoices = () => {
      if ('speechSynthesis' in window) {
        setAvailableVoices(window.speechSynthesis.getVoices());
      }
    };
    updateVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const processVoiceCommand = useCallback((rawText: string) => {
    const cmd = rawText.toUpperCase().trim();
    setTranscript(cmd);

    if (isSpeakingRef.current || processingCommandRef.current) return;

    const executeCommand = (action: () => void, textToSpeak: string) => {
      processingCommandRef.current = true;
      action();
      setTimeout(() => speakText(textToSpeak), 100);
    };

    if (cmd.includes("EXIT") || cmd.includes("RESET") || cmd.includes("CLOSE")) {
      SciFiAudio.playBeep(400, 'sawtooth', 0.15, 0.05);
      executeCommand(() => {
        forceStopSpeaking();
        setIsLoggedIn(false);
      }, "Logging out from visor HUD.");
      return;
    }

    if (cmd.includes("RADIANT") || cmd.includes("RADIAN") || (cmd.includes("GRAFIK 1") && cmd.includes("RADIANT"))) {
      SciFiAudio.playBeep(1000, 'sine', 0.1, 0.05);
      executeCommand(() => {
        setPanel1Mode('RADIANT');
        setAiAnalysisText("Switching Graph 1 to radiant view.");
      }, "Switching Graph 1 to radiant view.");
      return;
    }

    if (cmd.includes("BAR") || (cmd.includes("GRAFIK 1") && cmd.includes("BAR"))) {
      SciFiAudio.playBeep(800, 'sine', 0.1, 0.05);
      executeCommand(() => {
        setPanel1Mode('BAR');
        setAiAnalysisText("Switching Graph 1 to bar view.");
      }, "Switching Graph 1 to bar view.");
      return;
    }

    const foundNumbers: number[] = [];
    if (cmd.includes("1") || cmd.includes("ONE")) foundNumbers.push(1);
    if (cmd.includes("2") || cmd.includes("TWO")) foundNumbers.push(2);
    if (cmd.includes("3") || cmd.includes("THREE")) foundNumbers.push(3);
    if (cmd.includes("4") || cmd.includes("FOUR")) foundNumbers.push(4);

    if (cmd.includes("ALL") || (foundNumbers.length === 4)) {
      SciFiAudio.playBeep(900, 'triangle', 0.1, 0.04);
      executeCommand(() => {
        switchLayoutWithFade([1, 2, 3, 4], "Displaying all telemetry graphs.");
      }, "Displaying all telemetry graphs.");
    } else if (foundNumbers.length > 0) {
      const uniqueSorted = Array.from(new Set(foundNumbers)).sort((a, b) => a - b);
      SciFiAudio.playBeep(900, 'triangle', 0.1, 0.04);
      executeCommand(() => {
        switchLayoutWithFade(uniqueSorted, `Displaying graph ${uniqueSorted.join(' and ')}.`);
      }, `Displaying graph ${uniqueSorted.join(', ')}.`);
    }
  }, [speakText, forceStopSpeaking, switchLayoutWithFade]);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage('Speech Recognition API is not supported in this browser.');
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setStatusMessage('Microphone active. Say a command...');
    };
    recognition.onresult = (event: any) => {
      const results = event.results;
      const latestResult = results[results.length - 1];
      if (latestResult && latestResult[0]) {
        processVoiceCommand(latestResult[0].transcript);
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    try { recognition.start(); } catch (e) {}
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }
    setIsListening(false);
    setStatusMessage('Voice recognition paused.');
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  useEffect(() => {
    return () => {
      forceStopSpeaking();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, [forceStopSpeaking]);

  useEffect(() => {
    if (!isScanning) {
      setAnimateChart(false);
      const timer = setTimeout(() => setAnimateChart(true), 150);
      return () => clearTimeout(timer);
    }
  }, [isScanning]);

  useEffect(() => {
    const fetchHealthcareMaster = async () => {
      try {
        const res = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-connection': 'domo',
            'x-token': '7123ab588d2c48bf2413e00099a42eee',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({
            Mode: 'healthcare'
          })
        });

        if (res.ok) {
          const json = await res.json();
          const rawData = json.data || [];
          if (Array.isArray(rawData)) {
            const formattedData: HealthcareItem[] = rawData.map((item: any) => ({
              healthcareID: item.healthcareID,
              healthcareName: item.healthcareName
            }));
            setHealthcareList(formattedData);
          }
        }
      } catch (error) {
        console.error("Gagal mengambil data healthcare:", error);
      }
    };

    fetchHealthcareMaster();
  }, []);

  const fetchDashboardData = useCallback(async (healthcareIdFilter: string) => {
    const headers = {
      'x-connection': 'domo',
      'x-token': '7123ab588d2c48bf2413e00099a42eee',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json'
    };
    const payloadBase = healthcareIdFilter ? { HealthcareID: healthcareIdFilter } : {};

    try {
      const res1 = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST', headers, body: JSON.stringify({ Mode: 'TrenPendapatan', ...payloadBase })
      });
      if (res1.ok) { const json = await res1.json(); setTrenPendapatan(json.data || []); }

      const res2 = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST', headers, body: JSON.stringify({ Mode: 'PerbandinganLayanan', ...payloadBase })
      });
      if (res2.ok) { const json = await res2.json(); setPerbandinganLayanan(json.data || []); }

      const res3 = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST', headers, body: JSON.stringify({ Mode: 'performalayanan', ...payloadBase })
      });
      if (res3.ok) { const json = await res3.json(); setPerformaLayanan(json.data || []); }

      const res4 = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST', headers, body: JSON.stringify({ Mode: 'PertumbuhanPasien', ...payloadBase })
      });
      if (res4.ok) { const json = await res4.json(); setPertumbuhanPasien(json.data || []); }

      setStatusMessage(`Telemetry data updated successfully.`);
    } catch (error) {
      setStatusMessage('Warning: API connection failed.');
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchDashboardData(selectedHealthcareId);
    }
  }, [isLoggedIn, selectedHealthcareId, fetchDashboardData]);

  useEffect(() => {
    if (!aiAnalysisText) {
      setDisplayedAiText('');
      return;
    }
    let i = 0;
    setDisplayedAiText('');
    const timer = setInterval(() => {
      if (i < aiAnalysisText.length) {
        setDisplayedAiText((prev) => prev + aiAnalysisText.charAt(i));
        if (i % 3 === 0) SciFiAudio.playBeep(1200, 'sine', 0.02, 0.01);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 20);
    return () => clearInterval(timer);
  }, [aiAnalysisText]);

  const renderPanel1 = () => {
    if (panel1Mode === 'RADIANT') {
      const currentMonthNumber = new Date().getMonth() + 1;
      const targetMonthLimit = currentMonthNumber > 1 ? currentMonthNumber - 1 : 1; 

      let total2025YTD = 0;
      let total2026YTD = 0;

      trenPendapatan.forEach((item: any, idx: number) => {
        const monthIdx = idx + 1;
        if (monthIdx <= targetMonthLimit) {
          total2025YTD += parseFloat(item.revenue_2025 || item.revenue || '0');
          total2026YTD += parseFloat(item.revenue_2026 || '0');
        }
      });

      const val2025 = total2025YTD / 1e9;
      const val2026 = total2026YTD / 1e9;
      const maxTarget = 1500; 
      const radius = 105;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset2025 = circumference - Math.min(val2025 / maxTarget, 1) * circumference;
      const strokeDashoffset2026 = (2 * Math.PI * (radius - 20)) - (Math.min(val2026 / maxTarget, 1) * (2 * Math.PI * (radius - 20)));
      const isAlert = val2026 < val2025;

      return (
        <div key="panel-1" className="bg-[#000814]/90 backdrop-blur-md border border-[#00f2fe]/60 rounded-[35px] p-4 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.25)] transition-all duration-700 ease-out animate-slide-in-right">      
          <div className="flex justify-between items-center z-10 flex-shrink-0">
            <h4 className="text-[11px] font-extrabold text-cyan-200 tracking-wider text-hud-glow">
              1. ACCUMULATION (YTD up to Month {targetMonthLimit})
            </h4>
            <button 
              onClick={() => setPanel1Mode('BAR')}
              className="text-[9px] font-bold text-cyan-300 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-500/50 hover:bg-cyan-900 cursor-pointer shadow-[0_0_8px_rgba(0,242,254,0.3)]"
            >
              [ SWITCH TO BAR ]
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative z-10 my-auto py-2">
            <div className="relative w-56 h-56 md:w-64 md:h-64 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 260 260">
                <circle cx="130" cy="130" r={radius} className="text-cyan-950/70" strokeWidth="16" stroke="currentColor" fill="transparent" />
                <circle 
                  cx="130" cy="130" r={radius} 
                  className="text-cyan-600 transition-all duration-1200 ease-out" 
                  strokeWidth="16" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={animateChart ? strokeDashoffset2025 : circumference} 
                  strokeLinecap="round" 
                  stroke="currentColor" 
                  fill="transparent" 
                />
                <circle cx="130" cy="130" r={radius - 20} className="text-blue-950/70" strokeWidth="14" stroke="currentColor" fill="transparent" />
                <circle 
                  cx="130" cy="130" r={radius - 20} 
                  className={`transition-all duration-1200 ease-out ${isAlert ? 'text-rose-500' : 'text-[#00f2fe]'}`} 
                  strokeWidth="14" 
                  strokeDasharray={2 * Math.PI * (radius - 20)} 
                  strokeDashoffset={animateChart ? strokeDashoffset2026 : (2 * Math.PI * (radius - 20))} 
                  strokeLinecap="round" 
                  stroke="currentColor" 
                  fill="transparent" 
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-widest">Total YTD</span>
                <span className={`text-xl font-extrabold ${isAlert ? 'text-rose-400' : 'text-white'} text-white-glow my-0.5`}>
                  {val2026.toFixed(1)}B {isAlert ? '⚠️' : ''}
                </span>
                <span className="text-[10px] text-cyan-400/90 font-semibold">vs {val2025.toFixed(1)}B (LY)</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key="panel-1" className="bg-[#000814]/90 backdrop-blur-md border border-[#00f2fe]/60 rounded-[35px] p-3 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.25)] transition-all duration-700 ease-out animate-slide-in-left">      
        <div className="flex justify-between items-center z-10 flex-shrink-0">
          <h4 className="text-[11px] font-extrabold text-cyan-200 tracking-wider text-hud-glow">1. REVENUE TREND (2025 VS 2026)</h4>
          <button 
            onClick={() => setPanel1Mode('RADIANT')}
            className="text-[8px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/50 hover:bg-cyan-900 cursor-pointer shadow-[0_0_6px_rgba(0,242,254,0.3)]"
          >
            [ RADIANT VIEW ]
          </button>
        </div>

        <div className="flex-1 flex items-end justify-between gap-3 pt-2 px-2 bg-black/60 rounded-2xl border border-[#00f2fe]/30 mt-1 min-h-0 z-10 overflow-x-auto">
          {trenPendapatan.map((item: any, idx: number) => {
            const rev2025 = parseFloat(item.revenue_2025 || item.revenue || '0') / 1e9;
            const rev2026 = parseFloat(item.revenue_2026 || '0') / 1e9;
            const height2025 = Math.min((rev2025 / 150) * 100, 100);
            const height2026 = Math.min((rev2026 / 150) * 100, 100);
            const isAlert = rev2026 > 0 && rev2026 < rev2025;

            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group/bar min-w-[32px]">
                <div className="flex items-end justify-center w-full h-full gap-1">
                  <div className="flex-1 flex flex-col items-center h-full justify-end">
                    <div style={{ height: animateChart ? `${Math.max(height2025, 6)}%` : '0%' }} className="w-full bg-gradient-to-t from-cyan-950 to-cyan-500 rounded-t transition-all duration-1000 ease-out" />
                  </div>
                  <div className="flex-1 flex flex-col items-center h-full justify-end">
                    <div style={{ height: animateChart ? `${Math.max(height2026, 6)}%` : '0%' }} className={`w-full rounded-t transition-all duration-1000 ease-out ${isAlert ? 'bg-gradient-to-t from-rose-950 to-rose-500' : 'bg-gradient-to-t from-cyan-900 to-[#00f2fe]'}`} />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-cyan-200 mt-1">{(item.month_name || item.month || '').substring(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPanel2 = () => (
    <div key="panel-2" className="bg-[#000814]/40 backdrop-blur-md border border-[#00f2fe]/40 rounded-[35px] p-3 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.2)]">
      <h4 className="text-[11px] font-bold text-cyan-200 tracking-wider z-10 flex-shrink-0">2. SERVICE COMPARISON</h4>
      <div className="flex-1 overflow-y-auto mt-1 border border-[#00f2fe]/15 rounded-2xl p-2 bg-[#000308]/40 text-[10px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#00f2fe]/30 text-[#00f2fe]">
              <th className="pb-1">Category</th><th className="pb-1 text-right">Clinic</th><th className="pb-1 text-right">Hospital</th>
            </tr>
          </thead>
          <tbody>
            {perbandinganLayanan.map((item, idx) => (
              <tr key={idx} className="border-b border-cyan-950/30">
                <td className="py-0.5 text-cyan-100 font-semibold">{item.category}</td>
                <td className="py-0.5 text-right text-cyan-300">{item.clinic}</td>
                <td className="py-0.5 text-right text-cyan-300">{item.rs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPanel3 = () => (
    <div key="panel-3" className="bg-[#000814]/40 backdrop-blur-md border border-[#00f2fe]/40 rounded-[35px] p-3 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.2)]">
      <h4 className="text-[11px] font-bold text-cyan-200 tracking-wider z-10 flex-shrink-0">3. SERVICE PERFORMANCE</h4>
      <div className="flex-1 overflow-y-auto mt-1 border border-[#00f2fe]/15 rounded-2xl p-2 bg-[#000308]/40 text-[10px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#00f2fe]/30 text-emerald-400">
              <th className="pb-1">Category</th><th className="pb-1 text-right">Kedoya</th><th className="pb-1 text-right">Menteng</th>
            </tr>
          </thead>
          <tbody>
            {performaLayanan.slice(0, 10).map((item, idx) => (
              <tr key={idx} className="border-b border-cyan-950/30">
                <td className="py-0.5 text-cyan-100 truncate max-w-[140px]">{item.category}</td>
                <td className="py-0.5 text-right text-cyan-300">{(parseFloat(item.kedoya) / 1e6).toFixed(1)}M</td>
                <td className="py-0.5 text-right text-emerald-300">{(parseFloat(item.menteng) / 1e6).toFixed(1)}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPanel4 = () => (
    <div key="panel-4" className="bg-[#000814]/40 backdrop-blur-md border border-[#00f2fe]/40 rounded-[35px] p-3 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.2)]">
      <h4 className="text-[11px] font-bold text-cyan-200 tracking-wider z-10 flex-shrink-0">4. PATIENT GROWTH</h4>
      <div className="flex-1 flex items-end justify-around gap-2 pt-2 px-2 bg-transparent rounded-2xl border border-[#00f2fe]/15 mt-1 min-h-0 z-10">
        {pertumbuhanPasien.map((item, idx) => {
          const total = item.totalPasien || 0;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end gap-1">
              <span className="text-[9px] text-emerald-400">{(total / 1e6).toFixed(1)}M</span>
              <div style={{ height: animateChart ? `${Math.min((total / 1.5e7) * 100, 100)}%` : '0%' }} className="w-full bg-gradient-to-t from-emerald-950/60 to-emerald-400/90 rounded-t transition-all duration-700 ease-out" />
              <span className="text-[9px] text-cyan-300">{item.year}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSelectedPanel = (id: number) => {
    switch(id) {
      case 1: return renderPanel1();
      case 2: return renderPanel2();
      case 3: return renderPanel3();
      case 4: return renderPanel4();
      default: return null;
    }
  };

  const getGridClass = () => {
    const len = activeGraphs.length;
    if (len === 1) return 'grid-cols-1 grid-rows-1';
    if (len === 2) return 'grid-cols-2 grid-rows-1';
    if (len === 3) return 'grid-cols-3 grid-rows-1';
    return 'grid-cols-2 grid-rows-2';
  };

  if (!isLoggedIn) {
    return <LoginPortal onLoginSuccess={(hcId) => { setSelectedHealthcareId(hcId); setIsLoggedIn(true); }} />;
  }

  // Nama teks untuk item yang sedang dipilih di custom dropdown
  const selectedHealthcareName = selectedHealthcareId === '' 
    ? '-- All Healthcare Nodes --' 
    : (healthcareList.find(hc => hc.healthcareID === selectedHealthcareId)?.healthcareName || selectedHealthcareId);

  return (
    <>
      <style>{`
        .ironman-visor-perspective { perspective: 1200px; perspective-origin: center center; overflow: hidden; }
        .ironman-visor-curve {
          transform-style: preserve-3d;
          transform: rotateX(12deg) rotateY(0deg) translateZ(-40px) scale(0.95);
          border-radius: 120px / 60px;
          background: rgba(2, 6, 23, 0.92);
          box-shadow: inset 0 0 100px rgba(0, 242, 254, 0.2), 0 40px 90px rgba(0, 0, 0, 0.8), 0 0 50px rgba(0, 242, 254, 0.3);
          backdrop-filter: blur(12px);
        }          
        .hud-vignette { background: radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, 0.85) 95%); }
        .hud-scanlines { background: linear-gradient(to bottom, transparent 50%, rgba(0, 242, 254, 0.04) 51%); background-size: 100% 4px; }
        .text-hud-glow { text-shadow: 0 0 10px rgba(0, 242, 254, 0.7), 0 0 20px rgba(0, 242, 254, 0.4); }
        .text-white-glow { text-shadow: 0 0 8px rgba(255, 255, 255, 0.8); }
        @keyframes holoGlitchIn {
          0% { opacity: 0; transform: scale(0.8) translateZ(-150px) rotateX(-12deg); filter: blur(15px); }
          40% { opacity: 0.6; transform: scale(1.04) translateZ(10px) rotateX(6deg); filter: blur(3px); }
          100% { opacity: 1; transform: scale(0.97) translateZ(-60px) rotateX(8deg); filter: blur(0px); }
        }
        @keyframes holoGlitchOut {
          0% { opacity: 1; transform: scale(0.97) translateZ(-60px) rotateX(8deg); filter: blur(0px); }
          100% { opacity: 0; transform: scale(1.1) translateZ(90px) rotateX(18deg); filter: blur(12px); }
        }
        .animate-glitch-in { animation: holoGlitchIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
        .animate-glitch-out { animation: holoGlitchOut 0.4s cubic-bezier(0.55, 0.085, 0.68, 0.53) forwards; }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in-right { animation: slideInRight 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      <div className="w-screen h-screen bg-[#000205] text-cyan-400 flex flex-col items-center justify-center font-mono select-none relative overflow-x-auto m-0 p-0" onClick={() => window.speechSynthesis?.resume()}>
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Canvas camera={{ position: [0, 1, 5], fov: 50 }}>
            <CyberTunnelBackground />
          </Canvas>
        </div>

        <div className="w-[1200px] md:w-screen h-screen max-h-none z-10 relative pointer-events-none ironman-visor-perspective flex items-center justify-center p-6">
          <div className="absolute inset-0 pointer-events-none hud-scanlines z-50"></div>
          <div className="absolute inset-0 pointer-events-none hud-vignette z-40"></div>

          <div className="ironman-visor-curve w-full h-full max-w-[1550px] max-h-[860px] flex flex-col justify-between p-6 overflow-hidden bg-[#00040a]/50 border border-[#00f2fe]/40 backdrop-blur-xl">
            
            <div className="flex items-center justify-between border-b border-[#00f2fe]/30 pb-2 px-4 bg-[#00040a]/40 rounded-2xl pointer-events-auto z-50 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <button onClick={handleResetToLogin} className="px-3 py-1 rounded-xl bg-[#001428]/40 border border-[#00f2fe]/40 text-cyan-300 hover:text-white text-xs font-bold cursor-pointer">
                  [X] LOGOUT HUD
                </button>
              </div>

              {/* Custom Sci-Fi Dropdown */}
              <div className="flex items-center gap-2 relative" ref={dropdownRef}>
                <label className="text-[10px] text-cyan-300 font-bold hidden sm:inline">HEALTHCARE:</label>
                
                <div 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{
                    backgroundColor: 'rgba(0, 20, 40, 0.9)',
                    border: '1px solid rgba(0, 242, 254, 0.5)',
                    color: '#a5f3fc',
                    fontSize: '12px',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minWidth: '240px',
                    boxShadow: '0 0 10px rgba(0, 242, 254, 0.15)',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>
                    {selectedHealthcareName}
                  </span>
                  <span style={{ color: '#00f2fe', fontSize: '10px', transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                    ▼
                  </span>
                </div>

                {isDropdownOpen && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      width: '300px',
                      maxHeight: '260px',
                      overflowY: 'auto',
                      backgroundColor: 'rgba(0, 5, 12, 0.95)',
                      border: '1px solid rgba(0, 242, 254, 0.6)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0, 242, 254, 0.25)',
                      backdropFilter: 'blur(12px)',
                      zIndex: 9999
                    }}
                  >
                    <div
                      onClick={() => {
                        setSelectedHealthcareId('');
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '10px 14px',
                        fontSize: '11px',
                        color: selectedHealthcareId === '' ? '#00f2fe' : '#a5f3fc',
                        backgroundColor: selectedHealthcareId === '' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
                        borderBottom: '1px solid rgba(0, 242, 254, 0.2)',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      -- All Healthcare Nodes --
                    </div>

                    {healthcareList.map((hc, idx) => {
                      const isSelected = hc.healthcareID === selectedHealthcareId;
                      return (
                        <div
                          key={hc.healthcareID || idx}
                          onClick={() => {
                            setSelectedHealthcareId(hc.healthcareID);
                            setIsDropdownOpen(false);
                          }}
                          style={{
                            padding: '10px 14px',
                            fontSize: '11px',
                            color: isSelected ? '#00f2fe' : '#a5f3fc',
                            backgroundColor: isSelected ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
                            borderBottom: '1px solid rgba(0, 242, 254, 0.1)',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0, 242, 254, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                          }}
                        >
                          {hc.healthcareName}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={`flex-1 my-2 w-full relative grid gap-4 min-h-0 pointer-events-auto z-30 ${getGridClass()} ${isScanning ? 'animate-glitch-out' : 'animate-glitch-in'}`}>
              {activeGraphs.map((graphId) => renderSelectedPanel(graphId))}
            </div>

            <div className="flex items-center justify-between px-4 py-2 bg-[#00040a]/40 rounded-2xl border border-[#00f2fe]/30 pointer-events-auto z-30 flex-shrink-0">
              <span className="text-xs text-cyan-300 font-mono flex gap-2 truncate">
                <span className="text-white font-bold flex-shrink-0">JARVIS:</span> <span className="truncate">{displayedAiText || "Visor active."}</span>
              </span>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                <button 
                  onClick={toggleListening}
                  className={`text-[10px] px-2.5 py-1 rounded-xl border font-bold cursor-pointer ${isListening ? 'bg-emerald-950 border-emerald-400 text-emerald-300' : 'bg-red-950 border-red-400 text-red-300'}`}
                >
                  {isListening ? '🎤 VOICE ON' : '🔇 VOICE OFF'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}