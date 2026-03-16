import React from 'react';
import { Info } from 'lucide-react';
import type { ChartPoint, SettingsData, ProjectionData, WeightEntry } from '../lib/types';
import { ChartRenderer } from './ChartRenderer';

interface ChartSectionProps {
  finalChartData: ChartPoint[];
  allChartData: ChartPoint[];
  chartMode: 'weekly' | 'daily';
  setChartMode: (mode: 'weekly' | 'daily') => void;
  filterRange: '1M' | '3M' | 'ALL';
  setFilterRange: (range: '1M' | '3M' | 'ALL') => void;
  chartHeight: number;
  containerWidth: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  settings: SettingsData | null;
  projectionData: ProjectionData | null;
  showExplanation: boolean;
  setShowExplanation: (show: boolean) => void;
  handleDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  toggleExpand: () => void;
  onSelectEntry: (entry: WeightEntry) => void;
}

export function ChartSection({
  finalChartData,
  allChartData,
  chartMode,
  setChartMode,
  filterRange,
  setFilterRange,
  chartHeight,
  containerWidth,
  containerRef,
  settings,
  projectionData,
  showExplanation,
  setShowExplanation,
  handleDragStart,
  toggleExpand,
  onSelectEntry,
}: ChartSectionProps) {
  return (
    <section className="flex flex-col" ref={containerRef}>
      <div className="flex justify-between items-end mb-2 px-1 gap-1">
        <div className="shrink-0">
          <div className="flex items-center gap-1">
            <h2 className="text-sm font-semibold text-slate-300">Trend Adherence</h2>
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="text-slate-500 hover:text-blue-400 transition-colors"
            >
              <Info size={13} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <div className="bg-slate-800 p-0.5 rounded-lg flex text-[9px] font-bold">
            <button onClick={() => setFilterRange('1M')} className={`px-1.5 py-1 rounded-md transition-all ${filterRange === '1M' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>1M</button>
            <button onClick={() => setFilterRange('3M')} className={`px-1.5 py-1 rounded-md transition-all ${filterRange === '3M' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>3M</button>
            <button onClick={() => setFilterRange('ALL')} className={`px-1.5 py-1 rounded-md transition-all ${filterRange === 'ALL' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>ALL</button>
          </div>

          <div className="bg-slate-800 p-0.5 rounded-lg flex text-[9px] font-bold">
            <button onClick={() => setChartMode('weekly')} className={`px-1.5 py-1 rounded-md transition-all ${chartMode === 'weekly' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Week</button>
            <button onClick={() => setChartMode('daily')} className={`px-1.5 py-1 rounded-md transition-all ${chartMode === 'daily' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Day</button>
          </div>
        </div>
      </div>

      <ChartRenderer
        data={finalChartData}
        allData={allChartData}
        mode={chartMode}
        filterRange={filterRange}
        height={chartHeight}
        width={containerWidth}
        settings={settings}
        projection={projectionData}
        onSelectEntry={onSelectEntry}
      />

      <div className="bg-slate-900 border-x border-b border-slate-800 rounded-b-xl p-2 space-y-2 select-none">
        <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-center text-slate-400 w-5/6 mx-auto">
          <div className="flex items-center justify-center gap-1">
            <div className="w-3 h-0.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 rounded-full"></div>Trend
          </div>
          <div className="flex items-center justify-center gap-1">
            <div className="w-3 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/40"></div>
            Tunnel
          </div>
          <div className="flex items-center justify-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>Readings
          </div>
        </div>

        {showExplanation && (
          <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-slate-200 font-bold mb-1">
              <Info size={12} className="text-blue-500" /> EMA model
            </div>
            <p>Exponential Moving Average (EMA) smoothes daily fluctuations. <span className="text-emerald-400">Green</span> = optimal pace. <span className="text-amber-400">Orange</span>/<span className="text-red-400">Red</span> = stalling or moving too fast.</p>
          </div>
        )}

        <div
          className="h-4 flex items-center justify-center cursor-row-resize active:bg-slate-800 transition-colors rounded-lg"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={toggleExpand}
        >
          <div className="w-12 h-1 bg-slate-700 rounded-full"></div>
        </div>
      </div>
    </section>
  );
}
