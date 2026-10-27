// src/components/DashboardManager.tsx

import React from 'react';
// @ts-ignore
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// --- TIPE DATA ---
interface DashboardItem {
  id: string;
  i: string;      
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  chartKey: string;
  title: string;
  isFilter?: boolean;
  color: string;
}

interface DashboardManagerProps {
  dashboardItems: DashboardItem[];
  setDashboardItems: React.Dispatch<React.SetStateAction<DashboardItem[]>>;
  onLaunchPresentation: () => void;
  onBack?: () => void;
}

// --- 🔄 OTOMATIS BACA FOLDER DENGAN DETEKSI FILTER ---
const panelModules = import.meta.glob<{ default: React.ComponentType<any> }>('./Panel*.tsx', { eager: true });

const EXCLUDED_PANELS = ['PanelWrapper']; 

const CHART_REGISTRY: Record<string, React.ComponentType<any>> = {};
const MASTER_CHART_CATALOG: Array<{ 
  id: string; 
  chartKey: string; 
  title: string; 
  isFilter: boolean; 
  defaultW: number; 
  defaultH: number; 
  minH: number; 
  color: string 
}> = [];

let autoId = 1;
for (const path in panelModules) {
  const fileName = path.split('/').pop()?.replace(/\.tsx$/, '') || '';
  
  if (!fileName || EXCLUDED_PANELS.includes(fileName)) {
    continue;
  }
  
  const ComponentModule = panelModules[path].default;
  CHART_REGISTRY[fileName] = ComponentModule;

  // Deteksi apakah komponen ini adalah filter berdasarkan nama file
  const isFilter = fileName.toLowerCase().includes('filter');

  const formattedTitle = fileName
    .replace(/^Panel/, 'Panel ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim();

  MASTER_CHART_CATALOG.push({
    id: String(autoId),
    chartKey: fileName,
    title: formattedTitle,
    isFilter: isFilter,
    // Filter diset lebih pendek (tinggi 1 atau 2 grid row) dan fleksibel
    defaultW: isFilter ? 4 : 6,
    defaultH: isFilter ? 1 : 4,
    minH: isFilter ? 1 : 2,
    color: isFilter ? 'bg-purple-950/40' : (autoId % 2 === 0 ? 'bg-cyan-950/40' : 'bg-gray-900'),
  });
  autoId++;
}

// --- GAYA CSS KUSTOM ---
const gridCustomStyles = `
  .react-grid-item {
    background: #000814;
    border: 1px solid #00f2fe60;
    border-radius: 12px;
    overflow: hidden;
    transition: box-shadow 0.2s, border-color 0.2s, background-color 0.2s;
    box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
  }
  .react-grid-item.react-grid-placeholder {
    background: rgba(0, 242, 254, 0.2) !important;
    border-radius: 12px;
    opacity: 0.5;
  }
  .react-grid-item:hover {
    border-color: #00f2fe;
    box-shadow: 0 0 15px rgba(0, 242, 254, 0.3);
    background-color: #000c1f;
  }
  .react-resizable-handle {
    background-image: none;
    cursor: se-resize;
    width: 18px;
    height: 18px;
    bottom: 0;
    right: 0;
    position: absolute;
    border-top: 2px solid #00f2fe60;
    border-left: 2px solid #00f2fe60;
    border-radius: 100% 0 0 0;
    background: #001428;
  }
  .drag-handle {
    cursor: grab;
    background: #001428;
    border-bottom: 1px solid #00f2fe60;
    color: #00f2fe;
    padding: 4px 10px;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 28px;
    position: relative;
    z-index: 10;
  }
  .drag-handle:active {
    cursor: grabbing;
    background: #001a36;
  }
`;

export default function DashboardManager({ dashboardItems, setDashboardItems, onLaunchPresentation, onBack }: DashboardManagerProps) {
  const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

  const onLayoutChange = (currentLayout: any, _allLayouts?: any) => {
    setDashboardItems((prevItems) => {
      return prevItems.map((item) => {
        const layoutItem = (currentLayout as any[]).find((layout: any) => layout.i === item.id);
        if (layoutItem) {
          return { ...item, ...layoutItem };
        }
        return item;
      });
    });
  };

  const addChartToDashboard = (chartFromCatalog: typeof MASTER_CHART_CATALOG[0]) => {
    if (dashboardItems.find((item) => item.id === chartFromCatalog.id)) {
      return;
    }

    const currentMaxY = Math.max(...dashboardItems.map((o) => o.y + o.h), 0);

    const newItem: DashboardItem = {
      ...chartFromCatalog,
      i: chartFromCatalog.id,
      x: (dashboardItems.length * chartFromCatalog.defaultW) % 12,
      y: currentMaxY,
      w: chartFromCatalog.defaultW,
      h: chartFromCatalog.defaultH,
      minW: 2,
      minH: chartFromCatalog.minH,
    };

    setDashboardItems([...dashboardItems, newItem]);
  };

  const removeChart = (idToRemove: string) => {
    setDashboardItems(dashboardItems.filter((item) => item.id !== idToRemove));
  };

  const renderChartContent = (chartKey: string) => {
    const TargetComponent = CHART_REGISTRY[chartKey];

    if (!TargetComponent) {
      return (
        <div className="h-full w-full flex items-center justify-center text-cyan-400 text-xs">
          Komponen tidak ditemukan ({chartKey})
        </div>
      );
    }

    return (
      <div className="h-full w-full overflow-hidden flex flex-col">
        <TargetComponent animateChart={true} />
      </div>
    );
  };

  return (
    <>
      <style>{gridCustomStyles}</style>
      
      <div className="w-screen h-screen bg-[#000205] text-cyan-400 p-3 font-mono select-none overflow-hidden fixed inset-0 z-50 flex flex-col">
        
        <header className="grid grid-cols-3 items-center mb-2.5 px-3 py-2 border-b border-cyan-900/50 bg-[#000205]/95 backdrop-blur-sm z-[1000] flex-shrink-0">
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  onLaunchPresentation();
                }
              }}
              className="px-3 py-1.5 border border-purple-500/60 text-purple-300 hover:bg-purple-950/40 rounded-xl text-xs font-mono transition-all shadow-[0_0_10px_rgba(168,85,247,0.2)] cursor-pointer whitespace-nowrap active:scale-95"
            >
              ← Back to Login Portal
            </button>
          </div>

          <div className="flex items-center justify-center text-center">
            <h2 className="text-xs sm:text-sm font-extrabold tracking-wider text-cyan-100 uppercase whitespace-nowrap drop-shadow-[0_0_6px_rgba(0,242,254,0.5)]">
              Dashboard Layout Designer
            </h2>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onLaunchPresentation}
              className="px-4 py-1.5 bg-[#00f2fe] text-[#000814] hover:bg-white rounded-xl font-bold text-xs transition-all shadow-[0_0_12px_rgba(0,242,254,0.4)] active:scale-95 cursor-pointer whitespace-nowrap"
            >
              🚀 JALANKAN PRESENTASI
            </button>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-3 flex-1 overflow-hidden">
          <section className="flex-1 bg-[#000814]/40 border border-cyan-900/50 rounded-2xl p-3 flex flex-col overflow-hidden relative">
            {dashboardItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-cyan-900 border-2 border-dashed border-cyan-900/70 rounded-2xl p-12 bg-[#000814]/30">
                <h2 className="text-xl font-bold text-cyan-700">Kanvas Dashboard Kosong</h2>
                <p className="text-cyan-800 text-xs mt-2 max-w-md">Pilih komponen atau filter dari katalog di sebelah kanan untuk menyematkannya.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto pr-2 relative">
                <div className="w-full pb-10">
                  <ResponsiveGridLayout
                    className="layout"
                    layouts={{ lg: dashboardItems }}
                    breakpoints={breakpoints}
                    cols={cols}
                    rowHeight={50}
                    onLayoutChange={onLayoutChange}
                    isDraggable={true}
                    isResizable={true}
                    draggableHandle=".drag-handle"
                    compactType="vertical"
                  >
                    {dashboardItems.map((item) => (
                      <div key={item.id} className="flex flex-col">
                        <div className="drag-handle">
                          <span className="truncate pr-2 flex items-center gap-1">
                            {item.isFilter && <span className="text-[9px] bg-purple-900 text-purple-200 px-1 rounded">FILTER</span>}
                            {item.title}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeChart(item.id);
                            }}
                            className="text-red-400 hover:text-red-300 font-bold px-2 py-0.5 rounded cursor-pointer z-20 hover:bg-red-950/50 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex-1 p-2 overflow-hidden flex items-center">
                          {renderChartContent(item.chartKey)}
                        </div>
                      </div>
                    ))}
                  </ResponsiveGridLayout>
                </div>
              </div>
            )}
          </section>

          <aside className="w-full lg:w-64 xl:w-72 flex-shrink-0 flex flex-col">
            <div className="bg-[#000814]/80 border border-cyan-900/50 rounded-2xl p-3 shadow-lg flex flex-col max-h-full overflow-hidden">
              <h2 className="text-xs font-semibold text-cyan-200 mb-1 uppercase tracking-wider border-l-2 pl-2 border-cyan-500">
                Katalog Komponen ({MASTER_CHART_CATALOG.length})
              </h2>
              <p className="text-[10px] text-cyan-400/70 mb-2">Grafik & Filter terdeteksi otomatis.</p>

              <div className="space-y-2 overflow-y-auto pr-1">
                {MASTER_CHART_CATALOG.map((chart) => {
                  const isAdded = dashboardItems.some((item) => item.id === chart.id);
                  return (
                    <div
                      key={chart.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-all ${
                        isAdded ? 'bg-cyan-950/20 border-cyan-900/40 opacity-50' : 'bg-[#001428] border-cyan-800/50 hover:border-cyan-500'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {chart.isFilter && <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-700 px-1 rounded">FILTER</span>}
                          <p className="text-[11px] font-bold text-cyan-100 truncate">{chart.title}</p>
                        </div>
                        <p className="text-[9px] text-cyan-600 font-mono">Key: {chart.chartKey}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addChartToDashboard(chart)}
                        disabled={isAdded}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          isAdded ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#00f2fe] text-[#000814] hover:bg-white cursor-pointer'
                        }`}
                      >
                        {isAdded ? 'TERPASANG' : '+ TAMBAH'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}