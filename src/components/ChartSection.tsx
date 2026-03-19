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
      <div className="flex justify-between mb-3 px-1 gap-3">
        {/* Date Range Selector */}
        <div className="relative bg-slate-800/80 p-1 rounded-xl flex flex-1 text-xs font-bold items-center backdrop-blur-sm border border-slate-700/50">
          <div 
            className="absolute top-1 bottom-1 rounded-lg bg-slate-600 shadow-sm transition-all duration-300 ease-out" 
            style={{ 
              width: 'calc((100% - 8px) / 3)',
              transform: `translateX(${filterRange === '1M' ? '0' : filterRange === '3M' ? '100%' : '200%'})` 
            }} 
          />
          <button onClick={(e) => { e.preventDefault(); setFilterRange('1M'); }} className={`relative flex-1 z-10 py-1.5 text-center transition-colors ${filterRange === '1M' ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>1M</button>
          <button onClick={(e) => { e.preventDefault(); setFilterRange('3M'); }} className={`relative flex-1 z-10 py-1.5 text-center transition-colors ${filterRange === '3M' ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>3M</button>
          <button onClick={(e) => { e.preventDefault(); setFilterRange('ALL'); }} className={`relative flex-1 z-10 py-1.5 text-center transition-colors ${filterRange === 'ALL' ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>ALL</button>
        </div>

        {/* Mode Selector */}
        <div className="relative bg-slate-800/80 p-1 rounded-xl flex flex-1 text-xs font-bold items-center backdrop-blur-sm border border-slate-700/50">
          <div 
            className="absolute top-1 bottom-1 rounded-lg bg-slate-600 shadow-sm transition-all duration-300 ease-out" 
            style={{ 
              width: 'calc((100% - 8px) / 2)',
              transform: `translateX(${chartMode === 'weekly' ? '0' : '100%'})` 
            }} 
          />
          <button onClick={(e) => { e.preventDefault(); setChartMode('weekly'); }} className={`relative flex-1 z-10 py-1.5 text-center transition-colors ${chartMode === 'weekly' ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>WEEK</button>
          <button onClick={(e) => { e.preventDefault(); setChartMode('daily'); }} className={`relative flex-1 z-10 py-1.5 text-center transition-colors ${chartMode === 'daily' ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>DAY</button>
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
        <div className="flex items-center justify-between mx-auto w-full px-4">
          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-center text-slate-400 flex-1">
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
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-slate-500 hover:text-blue-400 transition-colors ml-2"
          >
            <Info size={14} />
          </button>
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
