// src/dashboards/DynamicDashboard.tsx
import React from 'react';
import Panel1Revenue from '../components/Panel1Revenue';
import PanelExsumMaterial from '../components/PanelExsumMaterial';
// Import panel generik lainnya...

interface LayoutItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DynamicDashboardProps {
  dashboardId: string;
  layoutConfig: LayoutItem[];
  selectedHealthcareId: string;
}

export default function DynamicDashboard({ dashboardId, layoutConfig, selectedHealthcareId }: DynamicDashboardProps) {
  // Disini Anda bisa menambahkan logic fetch data universal berdasarkan tipe chart
  
  const renderPanelContent = (type: string) => {
    switch(type) {
      case 'TREN_PENDAPATAN':
        return <Panel1Revenue /* passing props data disini */ />;
      case 'PIE_CHART_MATERIAL':
        return <PanelExsumMaterial /* passing props data disini */ />;
      default:
        return <div className="text-white flex items-center justify-center h-full">Unknown Chart Type</div>;
    }
  };

  return (
    <div className="relative flex-1 min-w-0 min-h-0 w-full h-full p-2">
      <div className="grid grid-cols-12 gap-2 h-full auto-rows-fr">
        {layoutConfig.map((item) => (
          <div 
            key={item.id} 
            className="bg-[#000814]/40 border border-[#00f2fe]/30 rounded-lg p-2 backdrop-blur-sm"
            style={{ 
              gridColumn: `span ${item.w}`, 
              gridRow: `span ${item.h}` 
            }}
          >
            {renderPanelContent(item.type)}
          </div>
        ))}
      </div>
    </div>
  );
}