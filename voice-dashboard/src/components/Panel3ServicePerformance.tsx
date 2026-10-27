import React from 'react';
import PanelWrapper from './PanelWrapper';

interface Panel3Props {
  performaLayanan: any[];
}

export default function Panel3ServicePerformance({ performaLayanan }: Panel3Props) {
  return (
    <PanelWrapper title="3. SERVICE PERFORMANCE">
      <div className="flex-1 overflow-y-auto mt-1 border border-[#00f2fe]/15 rounded-2xl p-2 bg-[#000308]/40 text-[10px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#00f2fe]/30 text-emerald-400">
              <th className="pb-1">Category</th>
              <th className="pb-1 text-right">Kedoya</th>
              <th className="pb-1 text-right">Menteng</th>
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
    </PanelWrapper>
  );
}