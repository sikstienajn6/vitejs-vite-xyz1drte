import { ChevronDown, Calendar, MessageSquare, Trash2 } from 'lucide-react';
import type { WeeklySummary, WeightEntry, SettingsData } from '../lib/types';
import { RATE_TOLERANCE_GREEN, RATE_TOLERANCE_ORANGE } from '../lib/constants';
import { formatDate } from '../lib/utils';
import { getWeekTrendStatus } from '../hooks/useAdvice';

interface WeeklyHistoryProps {
  weeklyData: WeeklySummary[];
  settings: SettingsData | null;
  expandedWeeks: string[];
  onToggleWeek: (weekId: string) => void;
  onExportCsv: () => void;
  onSelectEntry: (entry: WeightEntry) => void;
  onDeleteEntry: (id: string) => void;
}

function getRateAdherenceColor(rate: number, settings: SettingsData | null) {
  if (!settings) return 'text-slate-500';
  const targetRate = settings.weeklyRate;
  const deviation = Math.abs(rate - targetRate);
  if (deviation <= RATE_TOLERANCE_GREEN) return 'text-emerald-400';
  if (deviation <= RATE_TOLERANCE_ORANGE) return 'text-amber-400';
  return 'text-rose-400';
}

export function WeeklyHistory({ weeklyData, settings, expandedWeeks, onToggleWeek, onExportCsv, onSelectEntry, onDeleteEntry }: WeeklyHistoryProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1 gap-3">
        <h2 className="text-sm font-semibold text-slate-300">History</h2>
        <button
          type="button"
          onClick={onExportCsv}
          className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors text-white"
        >
          Export CSV
        </button>
      </div>
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 bg-slate-950/50 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div>Week</div>
          <div className="text-right">Trend</div>
          <div className="text-right pr-4">Δ</div>
          <div className="w-5"></div>
        </div>
        <div className="divide-y divide-slate-800">
          {weeklyData.slice().reverse().map((item) => {
            const isExpanded = expandedWeeks.includes(item.weekId);
            const rateColor = !item.hasPrev ? 'text-slate-600' : getRateAdherenceColor(item.delta, settings);
            return (
              <div key={item.weekId} className="transition-colors hover:bg-slate-800/50">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 items-center cursor-pointer" onClick={() => onToggleWeek(item.weekId)}>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200">{item.weekLabel}</span>
                    <span className="text-[10px] text-slate-500">{item.count} entries</span>
                  </div>
                  <div className="text-right font-bold text-slate-200">{item.actual.toFixed(1)}</div>
                  <div className={`text-right pr-4 font-bold text-xs ${rateColor}`}>
                    {item.hasPrev ? (item.delta > 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2)) : '-'}
                  </div>
                  <div className="flex justify-end text-slate-500"><ChevronDown size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} /></div>
                </div>
                <div 
                  className={`grid transition-all duration-300 ease-in-out ${
                    isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    {(() => {
                      // Determine if this week is complete (current date is past the following Monday)
                      const weekEntryDates = item.entries.map(e => new Date(e.date));
                      const latestEntryDate = new Date(Math.max(...weekEntryDates.map(d => d.getTime())));
                      const dayOfWeek = latestEntryDate.getDay(); // 0=Sun..6=Sat
                      const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
                      const nextMonday = new Date(latestEntryDate);
                      nextMonday.setDate(latestEntryDate.getDate() + daysUntilNextMonday);
                      nextMonday.setHours(0, 0, 0, 0);
                      const now = new Date();
                      const isWeekComplete = now >= nextMonday;

                      const trendStatus = item.hasPrev ? getWeekTrendStatus(item.delta, settings) : { status: 'ok', text: 'Trend: On Track', color: 'text-emerald-500', advice: 'On track. Maintain current calories.' };
                      return (
                        <div className="bg-slate-950/50 px-4 py-2 border-t border-slate-800">
                          {isWeekComplete && (
                            <div className="flex flex-col gap-2 mb-2">
                              <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold">
                                <span>Daily Entries</span>
                                <span className={trendStatus.color}>{trendStatus.text}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {trendStatus.advice}
                              </div>
                            </div>
                          )}
                          {!isWeekComplete && (
                            <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-2">
                              <span>Daily Entries</span>
                              <span className="text-slate-600">In progress</span>
                            </div>
                          )}
                          <div className="space-y-2">
                            {item.entries.slice().reverse().map((entry) => (
                              <div
                                key={entry.id}
                                className="flex justify-between items-center text-sm p-1 rounded hover:bg-slate-800 cursor-pointer transition-colors"
                                onClick={() => onSelectEntry(entry)}
                              >
                                <div className="flex items-center gap-2 text-slate-500">
                                  <Calendar size={12} /><span>{formatDate(entry.date)}</span>
                                  {entry.comment && <MessageSquare size={12} className="text-blue-400" />}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-slate-300">{entry.weight} kg</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteEntry(entry.id); }}
                                    className="text-slate-600 hover:text-red-400 p-1"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
