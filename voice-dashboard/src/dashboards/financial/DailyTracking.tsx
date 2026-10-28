import React, { useState, useEffect, useCallback, useRef } from 'react';
import DailyMetricsGrid from '../../components/DailyMetricsGrid';
import DailyRevenueChart from '../../components/DailyRevenueChart';
import DemographyChart from '../../components/DemographyChart';
import DailyLowerWidgets from '../../components/DailyLowerWidgets';
import DailyFilterHealthcare from '../../components/PanelFilterHealthcare';
import { useTheme } from '../../theme/ThemeContext';

// Import komponen individual untuk mode Full Screen
import SurgeryBdChart from '../../components/SurgeryBdChart';
import WeeklyRevenueChart from '../../components/WeeklyRevenueChart';
import MonthlyRevenueChart from '../../components/MonthlyRevenueChart';
import PerChannel3DChart from '../../components/PerChannel3DChart';

interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}

interface DailyTrackingProps {
  selectedHealthcareId?: string;
  healthcareList: HealthcareItem[];
  onHealthcareChange?: (id: string) => void;
}

export default function DailyTracking({
  selectedHealthcareId = '',
  healthcareList = [],
  onHealthcareChange,
}: DailyTrackingProps) {
  const { isLight } = useTheme();

  const [selectedId, setSelectedId] = useState<string>(selectedHealthcareId);
  const [selectedDate, setSelectedDate] = useState<string>('2026-10');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [dailyRevenueData, setDailyRevenueData] = useState<any[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<any[]>([]);
  const [demographicData, setDemographicData] = useState<any[]>([]);
  const [demographyDonutMode, setDemographyDonutMode] = useState<'gender' | 'patient_type'>('gender');
  const [surgeryBdData, setSurgeryBdData] = useState<any[]>([]);
  const [channelVisitsData, setChannelVisitsData] = useState<any[]>([]);
  const [channelSurgeryData, setChannelSurgeryData] = useState<any[]>([]);
  const [channelRevenueData, setChannelRevenueData] = useState<any[]>([]);

  // Fullscreen Daily Revenue period state.
  // Daily Revenue hanya menggunakan pilihan bulan; YTD tidak relevan untuk chart harian.
  const [dailyRevenueSelectedMonth, setDailyRevenueSelectedMonth] = useState<number>(
    Number(selectedDate.split('-')[1]) || 12
  );
  const [dailyRevenueFullscreenData, setDailyRevenueFullscreenData] = useState<any[]>([]);
  const [dailyRevenuePeriodLoading, setDailyRevenuePeriodLoading] = useState(false);
  const dailyRevenueRequestIdRef = useRef(0);

  // Fullscreen Weekly Revenue period state.
  // Weekly menggunakan sumber DailyTrackingRevenue untuk bulan yang dipilih,
  // kemudian komponen Weekly mengagregasi tanggal menjadi W1-W5.
  const [weeklyRevenueSelectedMonth, setWeeklyRevenueSelectedMonth] = useState<number>(
    Number(selectedDate.split('-')[1]) || 12
  );
  const [weeklyRevenueFullscreenData, setWeeklyRevenueFullscreenData] = useState<any[]>([]);
  const [weeklyRevenuePeriodLoading, setWeeklyRevenuePeriodLoading] = useState(false);
  const weeklyRevenueRequestIdRef = useRef(0);

  // Fullscreen Surgery BD period state.
  // Sama seperti Demography: bulan menentukan akhir periode, sedangkan YTD hanya toggle.
  const [surgeryBdSelectedMonth, setSurgeryBdSelectedMonth] = useState<number>(
    Number(selectedDate.split('-')[1]) || 12
  );
  const [surgeryBdYtdActive, setSurgeryBdYtdActive] = useState(false);
  const [surgeryBdFullscreenData, setSurgeryBdFullscreenData] = useState<any[]>([]);
  const [surgeryBdPeriodLoading, setSurgeryBdPeriodLoading] = useState(false);
  const surgeryBdRequestIdRef = useRef(0);

  // Fullscreen Per Channel period state.
  // Sama seperti Surgery BD: bulan menentukan akhir periode, YTD hanya toggle.
  const [perChannelSelectedMonth, setPerChannelSelectedMonth] = useState<number>(
    Number(selectedDate.split('-')[1]) || 12
  );
  const [perChannelYtdActive, setPerChannelYtdActive] = useState(false);
  const [perChannelVisitsFullscreenData, setPerChannelVisitsFullscreenData] = useState<any[]>([]);
  const [perChannelSurgeryFullscreenData, setPerChannelSurgeryFullscreenData] = useState<any[]>([]);
  const [perChannelRevenueFullscreenData, setPerChannelRevenueFullscreenData] = useState<any[]>([]);
  const [perChannelPeriodLoading, setPerChannelPeriodLoading] = useState(false);
  const perChannelRequestIdRef = useRef(0);

  // Fullscreen Demography period state.
  // Bulan dan YTD dipisah: YTD hanya toggle/aktivasi, sedangkan tombol bulan
  // selalu menentukan bulan akhir data yang sedang dipreview.
  const [demographySelectedMonth, setDemographySelectedMonth] = useState<number>(
    Number(selectedDate.split('-')[1]) || 12
  );
  const [demographyYtdActive, setDemographyYtdActive] = useState(false);
  const [demographyFullscreenData, setDemographyFullscreenData] = useState<any[]>([]);
  const [demographyPeriodLoading, setDemographyPeriodLoading] = useState(false);
  const demographyRequestIdRef = useRef(0);

  const selectedYear = selectedDate.split('-')[0] || '2026';

  useEffect(() => {
    if (selectedHealthcareId !== undefined) {
      setSelectedId(selectedHealthcareId);
    }
  }, [selectedHealthcareId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedCard(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!expandedCard) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedCard]);



  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    };
  }, [expandedCard]);

  const headers = {
    'x-connection': 'domo',
    'x-token': 'e2e6457d15727d578130f0fc7db54708',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
  };

  const fetchData = useCallback(async (healthcareIdFilter: string, dateFilter: string) => {
    if (!healthcareIdFilter) {
      setDailyRevenueData([]);
      setMonthlyRevenueData([]);
      setDemographicData([]);
      setSurgeryBdData([]);
      setChannelVisitsData([]);
      setChannelSurgeryData([]);
      setChannelRevenueData([]);
      return;
    }

    const payloadDaily = { Mode: 'DailyTrackingRevenue', HealthcareID: healthcareIdFilter, Periode: dateFilter };
    const payloadMonthly = { Mode: 'MonthlyTrackingRevenue', HealthcareID: healthcareIdFilter, Periode: '2026-10' };
    const payloadDemographic = { Mode: 'demographic', HealthcareID: healthcareIdFilter, Periode: dateFilter };
    const payloadSurgeryBd = { Mode: 'revenueSentra', HealthcareID: healthcareIdFilter, Periode: dateFilter };
    const payloadVisits = { Mode: 'PerChannelVisits', HealthcareID: healthcareIdFilter, Periode: dateFilter };
    const payloadChannelSurgery = { Mode: 'PerChannelSurgery', HealthcareID: healthcareIdFilter, Periode: dateFilter };
    const payloadChannelRevenue = { Mode: 'PerChannelRevenue', HealthcareID: healthcareIdFilter, Periode: dateFilter };

    try {
      const [resDaily, resMonthly, resDemo, resSurgeryBd, resVisits, resCSurgery, resCRevenue] = await Promise.all([
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadDaily) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadMonthly) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadDemographic) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadSurgeryBd) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadVisits) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadChannelSurgery) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify(payloadChannelRevenue) }),
      ]);

      if (resDaily.ok) setDailyRevenueData((await resDaily.json()).data || []);
      if (resMonthly.ok) setMonthlyRevenueData((await resMonthly.json()).data || []);
      if (resDemo.ok) setDemographicData((await resDemo.json()).data || []);
      if (resSurgeryBd.ok) setSurgeryBdData((await resSurgeryBd.json()).data || []);
      if (resVisits.ok) setChannelVisitsData((await resVisits.json()).data || []);
      if (resCSurgery.ok) setChannelSurgeryData((await resCSurgery.json()).data || []);
      if (resCRevenue.ok) setChannelRevenueData((await resCRevenue.json()).data || []);
    } catch (error) {
      console.error('Gagal mengambil data dari endpoint:', error);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedId, selectedDate);
  }, [selectedId, selectedDate, fetchData]);

  // Saat fullscreen Daily Revenue dibuka, mulai dari bulan filter utama.
  useEffect(() => {
    if (expandedCard === 'daily-revenue') {
      setDailyRevenueSelectedMonth(Number(selectedDate.split('-')[1]) || 12);
    }
  }, [expandedCard, selectedDate]);

  // Ambil Daily Revenue khusus fullscreen berdasarkan bulan yang dipilih.
  // Request-id mencegah response bulan lama menimpa bulan terbaru saat user klik cepat.
  const fetchDailyRevenueFullscreen = useCallback(async (
    healthcareIdFilter: string,
    year: string,
    selectedMonth: number
  ) => {
    const requestId = ++dailyRevenueRequestIdRef.current;

    if (!healthcareIdFilter) {
      setDailyRevenueFullscreenData([]);
      setDailyRevenuePeriodLoading(false);
      return;
    }

    setDailyRevenuePeriodLoading(true);

    try {
      const safeMonth = Math.min(12, Math.max(1, selectedMonth));
      const period = `${year}-${String(safeMonth).padStart(2, '0')}`;

      const response = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Mode: 'DailyTrackingRevenue',
          HealthcareID: healthcareIdFilter,
          Periode: period,
        }),
      });

      if (!response.ok) {
        throw new Error(`Daily Revenue request failed: ${response.status}`);
      }

      const json = await response.json();
      if (requestId !== dailyRevenueRequestIdRef.current) return;
      setDailyRevenueFullscreenData(json.data || []);
    } catch (error) {
      if (requestId !== dailyRevenueRequestIdRef.current) return;
      console.error('Gagal mengambil fullscreen Daily Revenue period:', error);
      setDailyRevenueFullscreenData([]);
    } finally {
      if (requestId === dailyRevenueRequestIdRef.current) {
        setDailyRevenuePeriodLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedCard !== 'daily-revenue') return;

    fetchDailyRevenueFullscreen(
      selectedId,
      selectedYear,
      dailyRevenueSelectedMonth
    );
  }, [
    expandedCard,
    selectedId,
    selectedYear,
    dailyRevenueSelectedMonth,
    fetchDailyRevenueFullscreen,
  ]);

  // Saat fullscreen Weekly Revenue dibuka, mulai dari bulan filter utama.
  useEffect(() => {
    if (expandedCard === 'weekly-revenue') {
      setWeeklyRevenueSelectedMonth(Number(selectedDate.split('-')[1]) || 12);
    }
  }, [expandedCard, selectedDate]);

  const fetchWeeklyRevenueFullscreen = useCallback(async (
    healthcareIdFilter: string,
    year: string,
    selectedMonth: number
  ) => {
    const requestId = ++weeklyRevenueRequestIdRef.current;

    if (!healthcareIdFilter) {
      setWeeklyRevenueFullscreenData([]);
      setWeeklyRevenuePeriodLoading(false);
      return;
    }

    setWeeklyRevenuePeriodLoading(true);

    try {
      const safeMonth = Math.min(12, Math.max(1, selectedMonth));
      const period = `${year}-${String(safeMonth).padStart(2, '0')}`;

      const response = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Mode: 'DailyTrackingRevenue',
          HealthcareID: healthcareIdFilter,
          Periode: period,
        }),
      });

      if (!response.ok) {
        throw new Error(`Weekly Revenue request failed: ${response.status}`);
      }

      const json = await response.json();
      if (requestId !== weeklyRevenueRequestIdRef.current) return;
      setWeeklyRevenueFullscreenData(json.data || []);
    } catch (error) {
      if (requestId !== weeklyRevenueRequestIdRef.current) return;
      console.error('Gagal mengambil fullscreen Weekly Revenue period:', error);
      setWeeklyRevenueFullscreenData([]);
    } finally {
      if (requestId === weeklyRevenueRequestIdRef.current) {
        setWeeklyRevenuePeriodLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedCard !== 'weekly-revenue') return;

    fetchWeeklyRevenueFullscreen(
      selectedId,
      selectedYear,
      weeklyRevenueSelectedMonth
    );
  }, [
    expandedCard,
    selectedId,
    selectedYear,
    weeklyRevenueSelectedMonth,
    fetchWeeklyRevenueFullscreen,
  ]);

  // Saat fullscreen Surgery BD dibuka, mulai dari bulan filter utama.
  useEffect(() => {
    if (expandedCard === 'surgery-bd') {
      setSurgeryBdSelectedMonth(Number(selectedDate.split('-')[1]) || 12);
      setSurgeryBdYtdActive(false);
    }
  }, [expandedCard, selectedDate]);

  // Fetch Surgery BD fullscreen:
  // - YTD OFF => hanya bulan terpilih
  // - YTD ON  => Januari s/d bulan terpilih
  // Backend tetap menerima Periode YYYY-MM; data YTD digabung di frontend.
  const fetchSurgeryBdFullscreen = useCallback(async (
    healthcareIdFilter: string,
    year: string,
    selectedMonth: number,
    ytdActive: boolean
  ) => {
    const requestId = ++surgeryBdRequestIdRef.current;

    if (!healthcareIdFilter) {
      setSurgeryBdFullscreenData([]);
      setSurgeryBdPeriodLoading(false);
      return;
    }

    setSurgeryBdPeriodLoading(true);

    try {
      const safeMonth = Math.min(12, Math.max(1, selectedMonth));

      if (!ytdActive) {
        const period = `${year}-${String(safeMonth).padStart(2, '0')}`;
        const response = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Mode: 'revenueSentra',
            HealthcareID: healthcareIdFilter,
            Periode: period,
          }),
        });

        if (!response.ok) {
          throw new Error(`Surgery BD request failed: ${response.status}`);
        }

        const json = await response.json();
        if (requestId !== surgeryBdRequestIdRef.current) return;
        setSurgeryBdFullscreenData(json.data || []);
        return;
      }

      const monthPeriods = Array.from(
        { length: safeMonth },
        (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`
      );

      const responses = await Promise.all(
        monthPeriods.map((period) =>
          fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              Mode: 'revenueSentra',
              HealthcareID: healthcareIdFilter,
              Periode: period,
            }),
          })
        )
      );

      const monthlyJson = await Promise.all(
        responses.map(async (response) => {
          if (!response.ok) return { data: [] };
          return response.json();
        })
      );

      if (requestId !== surgeryBdRequestIdRef.current) return;

      // SurgeryBdChart akan mengelompokkan ulang Sentra dan menjumlahkan Amount,
      // sehingga cukup menggabungkan semua row Januari s/d bulan terpilih.
      const merged = monthlyJson.flatMap((item: any) => item?.data || []);
      setSurgeryBdFullscreenData(merged);
    } catch (error) {
      if (requestId !== surgeryBdRequestIdRef.current) return;
      console.error('Gagal mengambil fullscreen Surgery BD period:', error);
      setSurgeryBdFullscreenData([]);
    } finally {
      if (requestId === surgeryBdRequestIdRef.current) {
        setSurgeryBdPeriodLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedCard !== 'surgery-bd') return;

    fetchSurgeryBdFullscreen(
      selectedId,
      selectedYear,
      surgeryBdSelectedMonth,
      surgeryBdYtdActive
    );
  }, [
    expandedCard,
    selectedId,
    selectedYear,
    surgeryBdSelectedMonth,
    surgeryBdYtdActive,
    fetchSurgeryBdFullscreen,
  ]);

  // Saat fullscreen Per Channel dibuka, mulai dari bulan filter utama.
  useEffect(() => {
    if (expandedCard === 'per-channel') {
      setPerChannelSelectedMonth(Number(selectedDate.split('-')[1]) || 12);
      setPerChannelYtdActive(false);
    }
  }, [expandedCard, selectedDate]);

  // Fetch Per Channel fullscreen:
  // - YTD OFF => hanya bulan terpilih
  // - YTD ON  => Januari s/d bulan terpilih
  // Ketiga mode channel tetap dipanggil terpisah, lalu row masing-masing metric digabung.
  const fetchPerChannelFullscreen = useCallback(async (
    healthcareIdFilter: string,
    year: string,
    selectedMonth: number,
    ytdActive: boolean
  ) => {
    const requestId = ++perChannelRequestIdRef.current;

    if (!healthcareIdFilter) {
      setPerChannelVisitsFullscreenData([]);
      setPerChannelSurgeryFullscreenData([]);
      setPerChannelRevenueFullscreenData([]);
      setPerChannelPeriodLoading(false);
      return;
    }

    setPerChannelPeriodLoading(true);

    const fetchMetric = async (mode: string, period: string) => {
      const response = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Mode: mode,
          HealthcareID: healthcareIdFilter,
          Periode: period,
        }),
      });

      if (!response.ok) return [];
      const json = await response.json();
      return json?.data || [];
    };

    try {
      const safeMonth = Math.min(12, Math.max(1, selectedMonth));
      const periods = ytdActive
        ? Array.from(
            { length: safeMonth },
            (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`
          )
        : [`${year}-${String(safeMonth).padStart(2, '0')}`];

      const [visitsMonthly, surgeryMonthly, revenueMonthly] = await Promise.all([
        Promise.all(periods.map((period) => fetchMetric('PerChannelVisits', period))),
        Promise.all(periods.map((period) => fetchMetric('PerChannelSurgery', period))),
        Promise.all(periods.map((period) => fetchMetric('PerChannelRevenue', period))),
      ]);

      if (requestId !== perChannelRequestIdRef.current) return;

      setPerChannelVisitsFullscreenData(visitsMonthly.flat());
      setPerChannelSurgeryFullscreenData(surgeryMonthly.flat());
      setPerChannelRevenueFullscreenData(revenueMonthly.flat());
    } catch (error) {
      if (requestId !== perChannelRequestIdRef.current) return;
      console.error('Gagal mengambil fullscreen Per Channel period:', error);
      setPerChannelVisitsFullscreenData([]);
      setPerChannelSurgeryFullscreenData([]);
      setPerChannelRevenueFullscreenData([]);
    } finally {
      if (requestId === perChannelRequestIdRef.current) {
        setPerChannelPeriodLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedCard !== 'per-channel') return;

    fetchPerChannelFullscreen(
      selectedId,
      selectedYear,
      perChannelSelectedMonth,
      perChannelYtdActive
    );
  }, [
    expandedCard,
    selectedId,
    selectedYear,
    perChannelSelectedMonth,
    perChannelYtdActive,
    fetchPerChannelFullscreen,
  ]);

  // Saat fullscreen Demography dibuka, mulai dari bulan yang sedang dipilih
  // pada filter utama. YTD default OFF sehingga awalnya hanya bulan tersebut.
  useEffect(() => {
    if (expandedCard === 'demography') {
      setDemographySelectedMonth(Number(selectedDate.split('-')[1]) || 12);
      setDemographyYtdActive(false);
    }
  }, [expandedCard, selectedDate]);

  // Fetch Demography fullscreen:
  // - YTD OFF => hanya bulan terpilih
  // - YTD ON  => Januari s/d bulan terpilih
  // Backend tetap menerima Periode YYYY-MM; tidak mengasumsikan ada parameter YTD khusus.
  const fetchDemographyFullscreen = useCallback(async (
    healthcareIdFilter: string,
    year: string,
    selectedMonth: number,
    ytdActive: boolean
  ) => {
    const requestId = ++demographyRequestIdRef.current;

    if (!healthcareIdFilter) {
      setDemographyFullscreenData([]);
      setDemographyPeriodLoading(false);
      return;
    }

    setDemographyPeriodLoading(true);

    try {
      const safeMonth = Math.min(12, Math.max(1, selectedMonth));

      if (!ytdActive) {
        const period = `${year}-${String(safeMonth).padStart(2, '0')}`;
        const response = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Mode: 'demographic',
            HealthcareID: healthcareIdFilter,
            Periode: period,
          }),
        });

        if (!response.ok) {
          throw new Error(`Demography request failed: ${response.status}`);
        }

        const json = await response.json();

        // Abaikan response lama jika user menekan bulan lain dengan cepat.
        if (requestId !== demographyRequestIdRef.current) return;
        setDemographyFullscreenData(json.data || []);
        return;
      }

      const monthPeriods = Array.from(
        { length: safeMonth },
        (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`
      );

      const responses = await Promise.all(
        monthPeriods.map((period) =>
          fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              Mode: 'demographic',
              HealthcareID: healthcareIdFilter,
              Periode: period,
            }),
          })
        )
      );

      const monthlyJson = await Promise.all(
        responses.map(async (response) => {
          if (!response.ok) return { data: [] };
          return response.json();
        })
      );

      if (requestId !== demographyRequestIdRef.current) return;

      const merged = monthlyJson.flatMap((item: any) => item?.data || []);
      setDemographyFullscreenData(merged);
    } catch (error) {
      if (requestId !== demographyRequestIdRef.current) return;
      console.error('Gagal mengambil fullscreen demography period:', error);
      setDemographyFullscreenData([]);
    } finally {
      if (requestId === demographyRequestIdRef.current) {
        setDemographyPeriodLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedCard !== 'demography') return;

    fetchDemographyFullscreen(
      selectedId,
      selectedYear,
      demographySelectedMonth,
      demographyYtdActive
    );
  }, [
    expandedCard,
    selectedId,
    selectedYear,
    demographySelectedMonth,
    demographyYtdActive,
    fetchDemographyFullscreen,
  ]);

  const handleHealthcareSelect = (newId: string) => {
    setSelectedId(newId);
    onHealthcareChange?.(newId);
  };

  const isLoaded = Boolean(selectedId);

  const renderExpandedContent = () => {
    switch (expandedCard) {
      case 'daily-revenue':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <DailyRevenueChart
              isLoaded={isLoaded}
              dailyData={dailyRevenueFullscreenData}
              onExpand={() => setExpandedCard(null)}
              isFullscreen
              selectedMonth={dailyRevenueSelectedMonth}
              selectedYear={selectedYear}
              isPeriodLoading={dailyRevenuePeriodLoading}
              onMonthChange={setDailyRevenueSelectedMonth}
            />
          </div>
        );

      case 'demography':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <DemographyChart
              isLoaded={isLoaded}
              demographicData={demographyFullscreenData}
              onExpand={() => setExpandedCard(null)}
              isFullscreen
              selectedMonth={demographySelectedMonth}
              ytdActive={demographyYtdActive}
              selectedYear={selectedYear}
              isPeriodLoading={demographyPeriodLoading}
              onMonthChange={setDemographySelectedMonth}
              onYtdToggle={() => setDemographyYtdActive((prev) => !prev)}
              donutMode={demographyDonutMode}
              onDonutModeChange={setDemographyDonutMode}
            />
          </div>
        );

      case 'surgery-bd':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <SurgeryBdChart
              isLoaded={isLoaded}
              surgeryBdData={surgeryBdFullscreenData}
              onExpand={() => setExpandedCard(null)}
              isFullscreen
              selectedMonth={surgeryBdSelectedMonth}
              ytdActive={surgeryBdYtdActive}
              selectedYear={selectedYear}
              isPeriodLoading={surgeryBdPeriodLoading}
              onMonthChange={setSurgeryBdSelectedMonth}
              onYtdToggle={() => setSurgeryBdYtdActive((prev) => !prev)}
            />
          </div>
        );

      case 'weekly-revenue':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <WeeklyRevenueChart
              isLoaded={isLoaded}
              dailyData={weeklyRevenueFullscreenData}
              onExpand={() => setExpandedCard(null)}
              isFullscreen
              selectedMonth={weeklyRevenueSelectedMonth}
              selectedYear={selectedYear}
              isPeriodLoading={weeklyRevenuePeriodLoading}
              onMonthChange={setWeeklyRevenueSelectedMonth}
            />
          </div>
        );

      case 'monthly-revenue':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <MonthlyRevenueChart
              isLoaded={isLoaded}
              monthlyData={monthlyRevenueData}
              onExpand={() => setExpandedCard(null)}
              isFullscreen
            />
          </div>
        );

      case 'per-channel':
        return (
          <div className="daily-tracking-expanded-chart flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2">
            <PerChannel3DChart
              isLoaded={isLoaded}
              visitsData={perChannelVisitsFullscreenData}
              surgeryData={perChannelSurgeryFullscreenData}
              revenueData={perChannelRevenueFullscreenData}
              periodLabel={`${selectedYear}-${String(perChannelSelectedMonth).padStart(2, '0')}`}
              selectedMonth={perChannelSelectedMonth}
              ytdActive={perChannelYtdActive}
              selectedYear={selectedYear}
              isPeriodLoading={perChannelPeriodLoading}
              onMonthChange={setPerChannelSelectedMonth}
              onYtdToggle={() => setPerChannelYtdActive((prev) => !prev)}
              onClose={() => setExpandedCard(null)}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="daily-tracking-root custom-scrollbar relative flex h-full w-full flex-1 flex-col gap-3 overflow-y-auto p-3 font-mono text-xs"
      style={{
        color: 'var(--core-primary)',
        background: 'transparent',
      }}
    >
      {/* HEADER UTAMA */}
      <div
        className="daily-page-header relative z-[200] flex flex-shrink-0 flex-col gap-2 overflow-visible rounded-xl border px-3 py-3 backdrop-blur-md sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-2.5"
        style={{
          borderColor: 'var(--core-border-strong)',
          background: isLight
            ? 'linear-gradient(90deg, rgba(194,222,234,.96), rgba(222,238,245,.96), rgba(206,226,239,.94))'
            : 'linear-gradient(90deg, rgba(1,78,120,.90), rgba(0,24,48,.95), rgba(1,78,120,.90))',
          boxShadow: '0 0 20px var(--core-glow)',
        }}
      >
        {/* Title row */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center space-x-3">
            <div className="relative flex h-3 w-3 flex-shrink-0 items-center justify-center">
              <span className="daily-page-status-dot absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00f2fe] opacity-75" />
              <span className="daily-page-status-dot relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00f2fe] shadow-[0_0_12px_#00f2fe]" />
            </div>

            <span
              className="daily-page-title min-w-0 animate-pulse bg-clip-text text-lg font-extrabold uppercase tracking-[0.16em] text-transparent sm:text-xl sm:tracking-widest"
              style={{
                backgroundImage: isLight
                  ? 'linear-gradient(90deg, #075985, #0a2635, #087f9d)'
                  : 'linear-gradient(90deg, #00f2fe, #ffffff, #00f2fe)',
                filter: isLight
                  ? 'drop-shadow(0 0 7px rgba(2,132,199,.18))'
                  : 'drop-shadow(0 0 12px rgba(0,242,254,.80))',
              }}
            >
              DAILY TRACKING
            </span>
          </div>

          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="relative flex h-9 flex-shrink-0 items-center gap-2 rounded-lg border px-3 text-[9px] font-black uppercase tracking-[0.14em] transition-all lg:hidden"
            style={{
              borderColor: showFilters
                ? 'var(--core-border-strong)'
                : 'var(--core-border)',
              background: showFilters
                ? 'color-mix(in srgb, var(--core-primary) 14%, transparent)'
                : 'var(--core-control)',
              color: showFilters
                ? 'var(--core-text)'
                : 'var(--core-primary)',
              boxShadow: showFilters ? '0 0 14px var(--core-glow)' : 'none',
            }}
            aria-expanded={showFilters}
            title={showFilters ? 'Hide Filters' : 'Show Filters'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 5h16M7 12h10M10 19h4" />
            </svg>
            <span>Filter</span>

            {(selectedId || selectedDate) && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_7px_rgba(110,231,183,.9)]" />
            )}

            <svg
              className={`h-3.5 w-3.5 transition-transform duration-300 ${
                showFilters ? 'rotate-180' : ''
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Compact filter summary - visible only while filters are hidden on mobile */}
        {!showFilters && (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden lg:hidden">
            <span className="daily-tracking-summary-chip flex-shrink-0 rounded-md border px-2 py-1 text-[7px] font-bold uppercase tracking-[0.12em]">
              {selectedDate || 'NO PERIOD'}
            </span>
            <span className="daily-tracking-summary-chip min-w-0 truncate rounded-md border px-2 py-1 text-[7px] font-bold uppercase tracking-[0.12em]">
              {selectedId
                ? healthcareList.find((item) => item.healthcareID === selectedId)?.healthcareName ||
                  'HEALTHCARE SELECTED'
                : 'ALL HEALTHCARE'}
            </span>
          </div>
        )}

        {/* Filters:
            - mobile: hidden by default, opened by FILTER button
            - desktop: always visible
            New filters can be added here later without permanently consuming mobile height. */}
        <div
          className={`w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:w-auto lg:min-w-[520px] lg:grid lg:grid-cols-[auto_minmax(280px,1fr)] lg:items-center lg:gap-3 ${
            showFilters ? 'grid animate-filter-panel-in' : 'hidden'
          }`}
        >
          <div
            className="daily-period-control flex min-w-0 items-center rounded-lg border px-2.5 py-2 transition-all sm:py-1"
            style={{
              borderColor: 'var(--core-border-strong)',
              background: 'var(--core-control)',
              boxShadow: '0 0 8px var(--core-glow)',
            }}
          >
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full min-w-0 cursor-pointer bg-transparent text-xs font-bold tracking-wide focus:outline-none"
              style={{
                color: isLight ? '#0a2635' : 'var(--core-text)',
                colorScheme: isLight ? 'light' : 'dark',
              }}
            />
          </div>

          <div className="daily-healthcare-filter-wrap relative z-[250] min-w-0 w-full">
            <DailyFilterHealthcare
              healthcareList={healthcareList}
              selectedId={selectedId}
              onSelect={handleHealthcareSelect}
            />
          </div>
        </div>
      </div>

      {/* TOP KPI METRICS - clear global diagonal COMING SOON state */}
      <div className="relative z-0 flex-shrink-0 overflow-hidden rounded-xl">
        <DailyMetricsGrid isLoaded={isLoaded} onExpand={setExpandedCard} />

        {/* Soft tint across the whole KPI group */}
        <div className="daily-comingsoon-global-tint pointer-events-none absolute inset-0 z-10 rounded-xl bg-amber-400/[0.018]" />

        {/* Wide diagonal ribbon - intentionally spans all KPI cards */}
        <div className="daily-comingsoon-global pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
          <div className="daily-comingsoon-global-ribbon absolute left-1/2 top-1/2 w-[112%] -translate-x-1/2 -translate-y-1/2 -rotate-[4deg] border-y py-2 backdrop-blur-[1px]">
            <div className="flex items-center justify-center gap-4 whitespace-nowrap px-4">
              <span className="daily-comingsoon-global-line daily-comingsoon-global-line--left hidden h-px flex-1 md:block" />

              <div className="flex items-center gap-2.5">
                <span className="daily-comingsoon-global-dot h-2 w-2 rounded-full" />
                <span className="daily-comingsoon-global-title text-[11px] font-black uppercase tracking-[0.30em] sm:text-[12px] lg:text-[13px]">
                  Coming Soon
                </span>
                <span className="daily-comingsoon-global-divider">•</span>
                <span className="daily-comingsoon-global-subtitle text-[8px] font-bold uppercase tracking-[0.22em] sm:text-[9px]">
                  All KPI Metrics
                </span>
              </div>

              <span className="daily-comingsoon-global-line daily-comingsoon-global-line--right hidden h-px flex-1 md:block" />
            </div>

            <div className="daily-comingsoon-global-footnote mt-1 text-center text-[6px] font-bold uppercase tracking-[0.20em] sm:text-[7px]">
              Live KPI integration in progress
            </div>
          </div>

          {/* Small repeated labels at both ends make the scope clearly global */}
          <div className="daily-kpi-preview-chip absolute left-2 top-2 rounded-md border px-2 py-0.5 text-[6px] font-bold uppercase tracking-[0.16em]">
            KPI Preview
          </div>
          <div className="daily-kpi-preview-chip absolute right-2 bottom-2 rounded-md border px-2 py-0.5 text-[6px] font-bold uppercase tracking-[0.16em]">
            Coming Soon
          </div>
        </div>
      </div>

      <div className="grid flex-shrink-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DailyRevenueChart isLoaded={isLoaded} dailyData={dailyRevenueData} onExpand={setExpandedCard} />
        </div>

        <div className="lg:col-span-1">
          <DemographyChart
            isLoaded={isLoaded}
            demographicData={demographicData}
            onExpand={setExpandedCard}
            donutMode={demographyDonutMode}
            onDonutModeChange={setDemographyDonutMode}
          />
        </div>
      </div>

      <DailyLowerWidgets
        isLoaded={isLoaded}
        dailyData={dailyRevenueData}
        monthlyData={monthlyRevenueData}
        surgeryBdData={surgeryBdData}
        channelVisitsData={channelVisitsData}
        channelSurgeryData={channelSurgeryData}
        channelRevenueData={channelRevenueData}
        onExpand={setExpandedCard}
      />

      {expandedCard && (
        <div
          className="daily-tracking-fullscreen fixed inset-0 z-[9999] isolate flex flex-col overflow-hidden p-2 animate-fadeIn md:p-3"
          style={{
            background: 'var(--core-bg)',
            color: 'var(--core-text)',
          }}
        >
          {expandedCard !== 'daily-revenue' &&
            expandedCard !== 'weekly-revenue' &&
            expandedCard !== 'monthly-revenue' &&
            expandedCard !== 'demography' &&
            expandedCard !== 'per-channel' && (
              <div className="daily-tracking-fullscreen-header mb-2 flex flex-shrink-0 items-center justify-between border-b pb-2">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 animate-ping rounded-full bg-[#00f2fe]" />
                  <h3
                    className="text-base font-extrabold uppercase tracking-wider"
                    style={{
                      color: 'var(--core-primary)',
                      filter: isLight
                        ? 'drop-shadow(0 0 6px rgba(2,132,199,.14))'
                        : 'drop-shadow(0 0 8px rgba(0,242,254,.60))',
                    }}
                  >
                    FULL-SCREEN VIEW:{' '}
                    <span style={{ color: 'var(--core-text)' }}>
                      {expandedCard.replace('-', ' ').toUpperCase()}
                    </span>
                  </h3>
                </div>
              </div>
            )}

          <div
            className="daily-tracking-fullscreen-body relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border"
            style={{
              borderColor: 'var(--core-border-strong)',
              background: 'var(--core-panel)',
              boxShadow: '0 0 30px var(--core-glow)',
            }}
          >
            {renderExpandedContent()}
          </div>
        </div>
      )}

      <style>{`
        .daily-tracking-summary-chip {
          border-color: var(--core-border);
          background: var(--core-control);
          color: var(--core-text-secondary);
        }

        .daily-kpi-preview-chip {
          border-color: ${isLight ? 'rgba(49,140,255,.28)' : 'rgba(252,211,77,.20)'};
          background: ${isLight ? 'rgba(235,248,255,.82)' : 'rgba(23,18,5,.55)'};
          color: ${isLight ? 'rgba(29,78,216,.76)' : 'rgba(253,230,138,.60)'};
        }

        .daily-tracking-fullscreen-header {
          border-color: var(--core-border-strong);
        }

        [data-theme="cosmic-light"] .daily-healthcare-filter-wrap button,
        [data-theme="cosmic-light"] .daily-healthcare-filter-wrap select,
        [data-theme="cosmic-light"] .daily-healthcare-filter-wrap input {
          color: var(--core-text) !important;
        }

        @keyframes dailyFilterPanelIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-filter-panel-in {
          animation: dailyFilterPanelIn .22s ease-out both;
        }

        /* Responsive wrapper for the custom healthcare combo.
           This prevents fixed/min widths inside PanelFilterHealthcare
           from pushing the control outside the mobile viewport. */
        .daily-healthcare-filter-wrap {
          position: relative;
          z-index: 250;
          overflow: visible;
          isolation: isolate;
        }

        .daily-healthcare-filter-wrap [role="listbox"],
        .daily-healthcare-filter-wrap [role="menu"],
        .daily-healthcare-filter-wrap .absolute {
          z-index: 300 !important;
        }

        .daily-healthcare-filter-wrap > * {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }

        .daily-healthcare-filter-wrap button,
        .daily-healthcare-filter-wrap select,
        .daily-healthcare-filter-wrap input {
          max-width: 100% !important;
        }

        @media (max-width: 639px) {
          .daily-healthcare-filter-wrap {
            width: 100%;
          }

          .daily-healthcare-filter-wrap > * {
            width: 100% !important;
          }
        }

        .daily-tracking-fullscreen-body > .daily-tracking-expanded-chart {
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          flex: 1 1 0%;
        }

        .daily-tracking-fullscreen-body .daily-tracking-expanded-chart > * {
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          flex: 1 1 0%;
        }

        .daily-tracking-fullscreen-body .daily-tracking-expanded-chart > * > * {
          min-width: 0;
          min-height: 0;
        }

        .daily-tracking-fullscreen-body .recharts-responsive-container {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          flex: 1 1 0%;
        }

        .daily-tracking-fullscreen-body .recharts-wrapper {
          max-width: 100%;
        }

        .daily-tracking-fullscreen-body .daily-tracking-channel-panel {
          min-height: 0;
          height: 100%;
        }

        .daily-tracking-fullscreen-body .daily-tracking-channel-panel .recharts-responsive-container {
          min-height: 220px !important;
        }

        @media (min-width: 768px) {
          .daily-tracking-fullscreen-body .daily-tracking-channel-panel .recharts-responsive-container {
            min-height: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
