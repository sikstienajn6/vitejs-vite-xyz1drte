import { useMemo } from 'react';
import type { WeightEntry, SettingsData, WeeklySummary, ChartPoint, ProjectionSegment } from '../lib/types';
import { EMA_ALPHA, TARGET_TOLERANCE } from '../lib/constants';
import { getWeekKey, formatDate, getDaysArray, getMedian, getWeekMonday, getActiveRateForDate } from '../lib/utils';

export function useWeightCalculations(
  weights: WeightEntry[],
  settings: SettingsData | null,
  chartMode: 'weekly' | 'daily',
  filterRange: '1M' | '3M' | 'ALL'
) {
  const { weeklyData, trendMap, currentTrendRate } = useMemo<{
    weeklyData: WeeklySummary[];
    trendMap: Map<string, number>;
    currentTrendRate: number;
  }>(() => {
    if (weights.length === 0 || !settings) {
      return { weeklyData: [] as WeeklySummary[], trendMap: new Map<string, number>(), currentTrendRate: 0 };
    }

    const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));

    const tMap = new Map<string, number>();
    let currentTrend = sortedWeights[0].weight;

    sortedWeights.forEach((entry) => {
      currentTrend = currentTrend + EMA_ALPHA * (entry.weight - currentTrend);
      tMap.set(entry.date, currentTrend);
    });

    const groups: Record<string, WeightEntry[]> = {};
    weights.forEach(entry => {
      const weekKey = getWeekKey(entry.date);
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(entry);
    });

    Object.keys(groups).forEach(k => {
      groups[k].sort((a, b) => a.date.localeCompare(b.date));
    });


    let processedWeeks: WeeklySummary[] = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      const valSum = entries.reduce((sum, e) => sum + e.weight, 0);
      const rawAvg = valSum / entries.length;
      const median = getMedian(entries.map(e => e.weight));

      const trendSum = entries.reduce((sum, e) => sum + (tMap.get(e.date) ?? e.weight), 0);
      const trendAvg = trendSum / entries.length;

      const earliestDate = entries[0].date;

      return {
        weekId: weekKey,
        weekLabel: formatDate(earliestDate),
        actual: trendAvg,
        rawAvg: rawAvg,
        median: median,
        count: entries.length,
        entries: entries,
        target: 0,
        delta: 0,
        hasPrev: false,
        inTunnel: true
      } as WeeklySummary;
    });

    for (let i = 0; i < processedWeeks.length; i++) {
      if (i === 0) {
        processedWeeks[i].target = processedWeeks[i].actual;
        processedWeeks[i].hasPrev = false;
        processedWeeks[i].delta = 0;
      } else {
        const prevWeek = processedWeeks[i - 1];
        const weekDate = processedWeeks[i].entries[0].date;
        const activeRate = getActiveRateForDate(weekDate, settings.goalPeriods);
        const appliedRate = activeRate !== null ? activeRate : 0;
        processedWeeks[i].target = prevWeek.actual + appliedRate;
        processedWeeks[i].delta = processedWeeks[i].actual - prevWeek.actual;
        processedWeeks[i].hasPrev = true;
      }

      const weekDate = processedWeeks[i].entries[0].date;
      const activeRate = getActiveRateForDate(weekDate, settings.goalPeriods);
      if (activeRate !== null) {
        processedWeeks[i].inTunnel = Math.abs(processedWeeks[i].actual - processedWeeks[i].target) <= TARGET_TOLERANCE;
      } else {
        processedWeeks[i].inTunnel = true; // Neutral in gap
      }
    }

    const currentRate = processedWeeks.length > 1 ? processedWeeks[processedWeeks.length - 1].delta : 0;

    return { weeklyData: processedWeeks, trendMap: tMap, currentTrendRate: currentRate };
  }, [weights, settings]);

  const projectionSegments = useMemo<ProjectionSegment[]>(() => {
    if (!settings?.goalPeriods || weights.length === 0) return [];
    
    const sortedDates = Array.from(trendMap.keys()).map(k => String(k)).sort();
    const getTrendAt = (dateStr: string) => {
       const exact = trendMap.get(dateStr);
       if (exact !== undefined) return exact;
       let closest = weights[0]?.weight ?? 0;
       for (const d of sortedDates) {
          if (d <= dateStr) {
             closest = trendMap.get(d) ?? closest;
          } else {
             break;
          }
       }
       return closest;
    };

    return settings.goalPeriods.map(p => {
       const isClosed = p.endDate !== null;
       const startDateMs = new Date(p.startDate).getTime();
       const endDateMs = isClosed ? new Date(p.endDate!).getTime() : Number.MAX_SAFE_INTEGER;
       const dailySlope = p.weeklyRate / 7;
       
       let anchorDateMs: number;
       let anchorVal: number;

       if (isClosed) {
          anchorDateMs = endDateMs;
          anchorVal = getTrendAt(p.endDate!);
       } else {
          if (chartMode === 'daily') {
             const anchorEntry = weights.length > 1 ? weights[1] : weights[0];
             anchorDateMs = new Date(anchorEntry.date).getTime();
             anchorVal = getTrendAt(anchorEntry.date);
          } else {
             const anchorIndex = weeklyData.length > 1 ? weeklyData.length - 2 : (weeklyData.length > 0 ? weeklyData.length - 1 : 0);
             if (weeklyData.length > 0) {
                 const anchorWeek = weeklyData[anchorIndex];
                 anchorDateMs = getWeekMonday(anchorWeek.entries[0].date).getTime();
                 anchorVal = anchorWeek.actual;
             } else {
                 anchorDateMs = new Date(weights[0].date).getTime();
                 anchorVal = getTrendAt(weights[0].date);
             }
          }
       }

       return {
          periodId: p.id,
          startDateMs,
          endDateMs,
          anchorDateMs,
          anchorVal,
          dailySlope
       };
    });
  }, [weights, weeklyData, chartMode, settings, trendMap]);

  // All chart data without date filtering — used for panning
  const allChartData = useMemo<ChartPoint[]>(() => {
    if (weeklyData.length === 0 || !settings) return [];

    if (chartMode === 'weekly') {
      return weeklyData.map(w => ({
        label: w.weekId,
        dateObj: getWeekMonday(w.entries[0].date),
        weekLabel: w.weekLabel,
        actual: w.rawAvg,
        trend: w.actual,
        entries: w.entries,
      }));
    } else {
      const now = new Date();
      const latestWeightDate = weights.length > 0 ? new Date(weights[0].date) : now;
      const chartEndDate = latestWeightDate > now ? latestWeightDate : now;
      const earliestDataDate = new Date(weights[weights.length - 1]?.date || now);

      const allDays = getDaysArray(earliestDataDate, chartEndDate);

      let lastKnownTrend = 0;
      const sortedDates: string[] = Array.from(trendMap.keys()).map(k => String(k)).sort();

      if (sortedDates.length > 0) {
        const firstTrend = trendMap.get(sortedDates[0]);
        if (firstTrend !== undefined) {
          lastKnownTrend = firstTrend;
        }
      }

      return allDays.map((dateStr) => {
        if (trendMap.has(dateStr)) {
          lastKnownTrend = trendMap.get(dateStr)!;
        }

        const originalEntry = weights.find(w => w.date === dateStr);

        return {
          label: dateStr,
          dateObj: new Date(dateStr),
          actual: originalEntry ? originalEntry.weight : null,
          trend: lastKnownTrend,
          originalEntry: originalEntry
        };
      }).filter(p => p.trend !== 0);
    }
  }, [weeklyData, weights, chartMode, settings, trendMap]);

  // Filtered view based on filterRange — used as default visible window
  const finalChartData = useMemo<ChartPoint[]>(() => {
    if (allChartData.length === 0) return [];

    const now = new Date();
    const latestWeightDate = weights.length > 0 ? new Date(weights[0].date) : now;
    const chartEndDate = latestWeightDate > now ? latestWeightDate : now;
    const earliestDataDate = allChartData[0].dateObj;

    let startDate: Date;
    if (filterRange === '1M') {
      startDate = new Date(chartEndDate);
      startDate.setMonth(chartEndDate.getMonth() - 1);
    } else if (filterRange === '3M') {
      startDate = new Date(chartEndDate);
      startDate.setMonth(chartEndDate.getMonth() - 3);
    } else {
      startDate = earliestDataDate;
    }

    if (startDate < earliestDataDate && filterRange !== 'ALL') startDate = earliestDataDate;

    return allChartData.filter(p => p.dateObj >= startDate);
  }, [allChartData, weights, filterRange]);

  return { weeklyData, trendMap, currentTrendRate, projectionSegments, allChartData, finalChartData };
}
