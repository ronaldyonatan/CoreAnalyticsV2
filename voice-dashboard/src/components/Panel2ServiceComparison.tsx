import React from 'react';
import PanelWrapper from './PanelWrapper';

interface Panel2Props {
  perbandinganLayanan: any[];
}

export default function Panel2ServiceComparison({ perbandinganLayanan }: Panel2Props) {
  return (
    <PanelWrapper title="2. SERVICE COMPARISON">
      <div className="flex-1 overflow-y-auto mt-1 border border-[#00f2fe]/15 rounded-2xl p-2 bg-[#000308]/40 text-[10px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#00f2fe]/30 text-[#00f2fe]">
              <th className="pb-1">Category</th>
              <th className="pb-1 text-right">Clinic</th>
              <th className="pb-1 text-right">Hospital</th>
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
    </PanelWrapper>
  );
}