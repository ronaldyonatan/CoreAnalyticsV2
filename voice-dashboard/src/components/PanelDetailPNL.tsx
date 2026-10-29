import React, { useState } from 'react';
import './CompanyMobileGrid.css';

export interface PnLItem {
  Level: number | string;
  Urut: number | string;
  AccountGroup: string;
  COACode: string;
  COAName: string;
  YTD_Last_Year: number;
  YTD_This_Year: number;
  Q1: number;
  Q2: number;
  Q3: number;
  Q4: number;
}

export interface PnLClosingInfo {
  HealthcareName?: string;
  healthcarename?: string;
  Healthcarename?: string;
  TahunPeriodeClosing?: number | string;
  tahunperiodeclosing?: number | string;
  BulanPeriodeClosing?: number | string;
  bulanperiodeclosing?: number | string;
  TanggalPostingTerakhir?: string;
  tanggalpostingterakhir?: string;
  TanggalCLosingTerakhir?: string;
  tanggalclosingterakhir?: string;
  TanggalTarikData?: string;
  tanggaltarikdata?: string;
  [key: string]: any;
}

interface PanelDetailPNLProps {
  pnlData: PnLItem[];
  animateChart?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  isCompareMode?: boolean;
  isLeftSide?: boolean;
  peerPnLData?: PnLItem[];
  enableColorHighlight?: boolean;
  closingInfo?: PnLClosingInfo | PnLClosingInfo[];
  currentSiteName?: string;
}

const formatNumber = (val: number | string | undefined | null) => {
  if (val === undefined || val === null || val === '') return '0,00 B';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0,00 B';
  
  const inBillion = num / 1_000_000_000;
  
  return `${inBillion.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} B`;
};

const createSlug = (text: string) => {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '-');
};

export default function PanelDetailPNL({ 
  pnlData, 
  animateChart,
  isMaximized,
  onToggleMaximize,
  isCompareMode = false,
  isLeftSide = true,
  peerPnLData = [],
  closingInfo = {},
  currentSiteName
}: PanelDetailPNLProps) {

  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  let lastAccountGroup = '';

  const getVal = (...keys: string[]) => {
    if (!closingInfo || typeof closingInfo !== 'object' || Array.isArray(closingInfo)) return '-';
    const lowerKeys = keys.map(k => k.toLowerCase());
    for (const prop of Object.keys(closingInfo)) {
      if (lowerKeys.includes(prop.toLowerCase())) {
        const val = (closingInfo as Record<string, any>)[prop];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
    }
    return '-';
  };

  const siteName = getVal('HealthcareName', 'healthcarename', 'Healthcarename') !== '-' 
    ? getVal('HealthcareName', 'healthcarename', 'Healthcarename') 
    : (currentSiteName || 'ALL NODES');
  
  const rawTahun = getVal('TahunPeriodeClosing', 'tahunperiodeclosing');
  const rawBulan = getVal('BulanPeriodeClosing', 'bulanperiodeclosing');
  const rawPosting = getVal('TanggalPostingTerakhir', 'tanggalpostingterakhir', 'TanggalCLosingTerakhir', 'tanggalclosingterakhir');
  const rawTarik = getVal('TanggalTarikData', 'tanggaltarikdata');

  const formattedPosting = rawPosting !== '-' ? String(rawPosting).split('T')[0] : '-';
  const formattedTarik = rawTarik !== '-' ? String(rawTarik).replace('T', ' ') : '-';

  const isCostOrExpense = (groupName: string, coaName: string) => {
    const text = `${groupName} ${coaName}`.toUpperCase();
    return (
      text.includes('BIAYA') || 
      text.includes('BEBAN') || 
      text.includes('EXPENSE') || 
      text.includes('COST') || 
      text.includes('FEE') ||
      text.includes('MATERIAL')
    );
  };

  const getComparisonStyle = (currentVal: number, row: PnLItem, fieldKey: keyof PnLItem) => {
    if (!isCompareMode || !peerPnLData || peerPnLData.length === 0) return '';

    const peerRow = peerPnLData.find(p => 
      (row.COACode && p.COACode && p.COACode.trim() === row.COACode.trim()) || 
      (p.COAName && row.COAName && p.COAName.trim().toUpperCase() === row.COAName.trim().toUpperCase())
    );

    if (!peerRow) return '';

    const peerVal = Number(peerRow[fieldKey]) || 0;
    if (currentVal === peerVal) return '';

    const isCurrentHigher = currentVal > peerVal;
    const isCost = isCostOrExpense(row.AccountGroup, row.COAName);

    if (isCost) {
      return isCurrentHigher 
        ? 'text-rose-400 bg-rose-950/40 border border-rose-500/50 rounded px-1' 
        : 'text-slate-400 opacity-70';
    } else {
      return isCurrentHigher 
        ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/50 rounded px-1' 
        : 'text-slate-400 opacity-70';
    }
  };

  return (
    <div className={`w-full ${isMaximized ? 'h-full flex-1' : 'h-[380px]'} company-pnl-card bg-[#000814]/40 border border-[#00f2fe]/30 rounded-lg p-3 flex flex-col backdrop-blur-sm relative overflow-hidden transition-all duration-300 ${animateChart ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
      
      {/* Header Panel */}
      <div className="company-panel-header flex items-center justify-between pb-2 mb-2 border-b border-[#00f2fe]/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="company-status-dot w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse"></span>
          <h3 className="company-title text-xs font-bold text-[#00f2fe] tracking-widest uppercase text-hud-glow flex items-center gap-2">
            <span>DETAIL PROFIT & LOSS STATEMENT</span>
            
            <div 
              className="relative cursor-pointer flex items-center"
              onMouseEnter={() => setIsTooltipOpen(true)}
              onMouseLeave={() => setIsTooltipOpen(false)}
            >
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[9px] font-bold shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                !
              </span>

              {isTooltipOpen && (
                <div className="company-tooltip company-tooltip--warning absolute left-0 top-6 z-50 flex flex-col w-80 max-h-72 overflow-y-auto p-2.5 bg-[#001428]/95 border border-amber-500/40 rounded-lg shadow-2xl backdrop-blur-md text-[10px] font-mono text-cyan-100 custom-scrollbar">
                  <div className="text-amber-400 font-bold uppercase tracking-wider pb-1 mb-1 border-b border-amber-500/30 flex items-center justify-between sticky top-0 bg-[#001428]/95 z-10">
                    <span>DISCLAIMER / INFO CLOSING {Array.isArray(closingInfo) ? `(${closingInfo.length} NODES)` : ''}</span>
                  </div>

                  {Array.isArray(closingInfo) ? (
                    closingInfo.map((item, index) => {
                      const sName = item.HealthcareName || item.healthcarename || item.Healthcarename || 'NODE';
                      const tThn = item.TahunPeriodeClosing || item.tahunperiodeclosing || '-';
                      const tBln = item.BulanPeriodeClosing || item.bulanperiodeclosing || '-';
                      const tPost = item.TanggalPostingTerakhir || item.tanggalpostingterakhir || '-';
                      const tTarik = item.TanggalTarikData || item.tanggaltarikdata || '-';

                      return (
                        <div key={index} className="space-y-1 py-1.5 border-b border-cyan-500/20 last:border-b-0">
                          <div className="flex justify-between font-bold text-amber-300 border-b border-cyan-500/10 pb-0.5">
                            <span>{sName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-400/80 shrink-0">Periode Closing:</span>
                            <span className="font-semibold">{tBln}/{tThn}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-400/80 shrink-0">Posting Terakhir:</span>
                            <span className="font-semibold">{String(tPost).split('T')[0]}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cyan-400/80 shrink-0">Tarik Data:</span>
                            <span className="font-semibold">{String(tTarik).replace('T', ' ')}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="space-y-1">
                      <div className="flex justify-between border-b border-cyan-500/20 pb-1 mb-1">
                        <span className="text-cyan-400/80 shrink-0">Site:</span>
                        <span className="font-bold text-amber-300 text-right">{siteName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400/80 shrink-0">Periode Closing:</span>
                        <span className="font-semibold">{rawBulan}/{rawTahun}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400/80 shrink-0">Tanggal Posting Terakhir:</span>
                        <span className="font-semibold">{formattedPosting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400/80 shrink-0">Tanggal Tarik Data:</span>
                        <span className="font-semibold">{formattedTarik}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-cyan-400/70 font-mono tracking-wider">
            MODE: MACRO_FINANCE_PNL
          </span>

          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              title={isMaximized ? "Restore Layout" : "Maximize Panel"}
              className="company-icon-button p-1 rounded bg-[#001428]/60 text-[#00f2fe]/80 hover:bg-[#00f2fe]/20 hover:text-white transition-all cursor-pointer backdrop-blur-sm border border-[#00f2fe]/30"
            >
              {isMaximized ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Table Container dengan kelas sync scroll kiri/kanan */}
      <div className={`company-pnl-scroll flex-1 overflow-auto relative border border-[#00f2fe]/20 rounded bg-[#000511]/75 ${isLeftSide ? 'left-pnl-scroll' : 'right-pnl-scroll'}`}>
        <table className="company-pnl-mobile-grid w-full text-left text-xs font-mono border-collapse table-fixed">
          <thead className="company-table-head sticky top-0 bg-[#001428] text-[#00f2fe] uppercase text-[10px] tracking-wider z-10 border-b border-[#00f2fe]/40 shadow-lg">
            <tr>
              <th className="py-2.5 px-3 border-r border-[#00f2fe]/15 w-[260px] min-w-[260px] max-w-[260px] truncate whitespace-nowrap overflow-hidden">COA Name</th>
              <th className="py-2.5 px-3 text-right border-r border-[#00f2fe]/15 w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">YTD Last Year</th>
              <th className="py-2.5 px-3 text-right border-r border-[#00f2fe]/15 w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">YTD This Year</th>
              <th className="py-2.5 px-3 text-right border-r border-[#00f2fe]/15 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">Q1</th>
              <th className="py-2.5 px-3 text-right border-r border-[#00f2fe]/15 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">Q2</th>
              <th className="py-2.5 px-3 text-right border-r border-[#00f2fe]/15 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">Q3</th>
              <th className="py-2.5 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">Q4</th>
            </tr>
          </thead>
          <tbody className="company-table-body divide-y divide-[#00f2fe]/10 text-[11px] text-cyan-100">
            {pnlData && pnlData.length > 0 ? (
              pnlData.map((row, idx) => {
                const coaCode = row.COACode?.trim() || '';
                const coaName = row.COAName?.trim() || '';
                const accountGroup = row.AccountGroup?.trim() || '';

                const labelText = coaName || accountGroup;
                const rowSlug = createSlug(labelText);

                const upperName = coaName.toUpperCase();

                // Pengecualian agar laba penjualan & laba entitas anak tidak dianggap sebagai total baris utama
                const isExceptionRow = upperName.includes('LABA PENJUALAN') || upperName.includes('ENTITAS ANAK');

                const isExplicitTotal = !isExceptionRow && (
                  upperName.includes('TOTAL') || 
                  upperName.includes('GROSS') || 
                  upperName.includes('EBIT') || 
                  upperName.includes('EBT') || 
                  upperName.includes('EAT') || 
                  upperName.includes('OPERATING') ||
                  upperName.includes('LABA') ||
                  (upperName.includes('PROFIT') && !upperName.includes('REVENUE SHARING'))
                );

                const isMajorProfitRow = !isExceptionRow && (
                  upperName.includes('GROSS') || 
                  upperName.includes('OPERATING') || 
                  upperName.includes('EBIT') || 
                  upperName.includes('EBT') || 
                  upperName.includes('EAT') ||
                  upperName.includes('LABA BERSIH')
                );         

                const hasValues = Number(row.YTD_Last_Year) !== 0 || Number(row.YTD_This_Year) !== 0 || Number(row.Q1) !== 0;
                const isSubtotalRow = (!coaCode || Number(row.Urut) === 0) && hasValues && !isExceptionRow;
                const isTotalRow = (isExplicitTotal || isSubtotalRow) && !isMajorProfitRow;
                const isHeaderRow = (!coaCode || Number(row.Urut) === 0) && !isTotalRow && !isMajorProfitRow;

                const showAutoGroupHeader = !isHeaderRow && !isTotalRow && !isMajorProfitRow && accountGroup !== lastAccountGroup && accountGroup !== '';
                if (accountGroup) lastAccountGroup = accountGroup;

                const valThisYear = Number(row.YTD_This_Year) || 0;
                const valQ1 = Number(row.Q1) || 0;
                const valQ2 = Number(row.Q2) || 0;
                const valQ3 = Number(row.Q3) || 0;
                const valQ4 = Number(row.Q4) || 0;

                return (
                  <React.Fragment key={idx}>
                    {showAutoGroupHeader && (
                      <tr data-pnl-slug={createSlug(accountGroup)} className="company-pnl-group bg-[#001d3a]/90 text-[#00f2fe] font-bold text-xs uppercase tracking-wider border-y border-[#00f2fe]/30 h-[34px]">
                        <td colSpan={7} className="py-2.5 px-3 text-[#00f2fe] bg-[#001830] truncate whitespace-nowrap overflow-hidden">
                          {accountGroup}
                        </td>
                      </tr>
                    )}

                    {isHeaderRow ? (
                      <tr data-pnl-slug={rowSlug} className="company-pnl-section bg-[#001a33] text-[#00f2fe] font-bold text-xs uppercase tracking-wider border-y border-[#00f2fe]/40 h-[34px]">
                        <td colSpan={7} className="py-2.5 px-3 text-[#00f2fe] text-sm tracking-widest truncate whitespace-nowrap overflow-hidden">
                          {accountGroup || coaName}
                        </td>
                      </tr>
                    ) : isMajorProfitRow ? (
                      <tr data-pnl-slug={rowSlug} data-pnl-total="true" className="company-pnl-major bg-[#004080] border-y-2 border-cyan-300 text-cyan-100 shadow-2xl h-[38px]">
                        <td className="py-3 px-3 text-cyan-200 text-sm font-extrabold uppercase tracking-wider pl-4 w-[260px] min-w-[260px] max-w-[260px] truncate whitespace-nowrap overflow-hidden" title={coaName || accountGroup}>
                          {coaName || accountGroup}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-100 text-sm font-bold w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.YTD_Last_Year)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-300 text-sm font-extrabold w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.YTD_This_Year)}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-100 text-sm font-bold w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.Q1)}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-100 text-sm font-bold w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.Q2)}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-100 text-sm font-bold w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.Q3)}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-100 text-sm font-bold w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.Q4)}
                        </td>
                      </tr>
                    ) : isTotalRow ? (
                      <tr data-pnl-slug={rowSlug} data-pnl-total="true" className="company-pnl-total bg-[#002b4d]/80 border-y-2 border-[#00f2fe]/50 text-[#00f2fe] font-bold text-xs h-[34px]">
                        <td className="py-2.5 px-3 text-amber-300 uppercase tracking-wider pl-4 w-[260px] min-w-[260px] max-w-[260px] truncate whitespace-nowrap overflow-hidden" title={coaName || accountGroup}>
                          {coaName || accountGroup}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.YTD_Last_Year)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-400 w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.YTD_This_Year)}
                        </td>
                        <td className="py-2.5 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">{formatNumber(row.Q1)}</td>
                        <td className="py-2.5 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">{formatNumber(row.Q2)}</td>
                        <td className="py-2.5 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">{formatNumber(row.Q3)}</td>
                        <td className="py-2.5 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden">{formatNumber(row.Q4)}</td>
                      </tr>
                    ) : (
                      <tr data-pnl-slug={rowSlug} className="company-pnl-row hover:bg-[#00f2fe]/10 transition-colors even:bg-[#000a17]/40 text-[11px] h-[30px]">
                        <td className="py-2 px-3 text-cyan-100 border-r border-[#00f2fe]/10 pl-7 w-[260px] min-w-[260px] max-w-[260px] truncate whitespace-nowrap overflow-hidden" title={coaName}>
                          {coaName}
                        </td>
                        <td className="py-2 px-3 text-right border-r border-[#00f2fe]/10 text-slate-300 w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden">
                          {formatNumber(row.YTD_Last_Year)}
                        </td>
                        <td className={`py-2 px-3 text-right border-r border-[#00f2fe]/10 font-semibold w-[110px] min-w-[110px] max-w-[110px] truncate whitespace-nowrap overflow-hidden ${getComparisonStyle(valThisYear, row, 'YTD_This_Year') || 'text-emerald-400'}`}>
                          {formatNumber(valThisYear)}
                        </td>
                        <td className={`py-2 px-3 text-right border-r border-[#00f2fe]/10 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden ${getComparisonStyle(valQ1, row, 'Q1')}`}>
                          {formatNumber(row.Q1)}
                        </td>
                        <td className={`py-2 px-3 text-right border-r border-[#00f2fe]/10 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden ${getComparisonStyle(valQ2, row, 'Q2')}`}>
                          {formatNumber(valQ2)}
                        </td>
                        <td className={`py-2 px-3 text-right border-r border-[#00f2fe]/10 w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden ${getComparisonStyle(valQ3, row, 'Q3')}`}>
                          {formatNumber(row.Q3)}
                        </td>
                        <td className={`py-2 px-3 text-right w-[90px] min-w-[90px] max-w-[90px] truncate whitespace-nowrap overflow-hidden ${getComparisonStyle(valQ4, row, 'Q4')}`}>
                          {formatNumber(row.Q4)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center text-cyan-500/60 italic">
                  Data PnL tidak ditemukan untuk kriteria ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}