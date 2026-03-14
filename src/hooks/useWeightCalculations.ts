import { useMemo } from 'react';
import type { WeightEntry, SettingsData, WeeklySummary, ChartPoint, ProjectionData } from '../lib/types';
import { EMA_ALPHA, TARGET_TOLERANCE } from '../lib/constants';
import { getWeekKey, formatDate, getDaysArray, getMedian } from '../lib/utils';

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

    const rate = parseFloat(settings.weeklyRate.toString()) || 0;

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
        processedWeeks[i].target = prevWeek.actual + rate;
        processedWeeks[i].delta = processedWeeks[i].actual - prevWeek.actual;
        processedWeeks[i].hasPrev = true;
      }

      processedWeeks[i].inTunnel = Math.abs(processedWeeks[i].actual - processedWeeks[i].target) <= TARGET_TOLERANCE;
    }

    const currentRate = processedWeeks.length > 1 ? processedWeeks[processedWeeks.length - 1].delta : 0;

    return { weeklyData: processedWeeks, trendMap: tMap, currentTrendRate: currentRate };
  }, [weights, settings]);

  const projectionData = useMemo<ProjectionData | null>(() => {
    if (!settings || weights.length === 0) return null;
    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    const dailySlope = rate / 7;

    if (chartMode === 'daily') {
      const anchorIndex = weights.length > 1 ? 1 : 0;
      const anchorEntry = weights[anchorIndex];
      const anchorVal = trendMap.get(anchorEntry.date) ?? anchorEntry.weight;

      return {
        anchorDate: new Date(anchorEntry.date),
        anchorVal: anchorVal,
        dailySlope: dailySlope,
        weeklySlope: rate
      };
    } else {
      const anchorIndex = weeklyData.length > 1 ? weeklyData.length - 2 : weeklyData.length - 1;
      const anchorWeek = weeklyData[anchorIndex];
      const anchorDate = new Date(anchorWeek.entries[0].date);

      return {
        anchorDate: anchorDate,
        anchorVal: anchorWeek.actual,
        dailySlope: dailySlope,
        weeklySlope: rate,
        anchorIndex: anchorIndex
      };
    }
  }, [weights, weeklyData, chartMode, settings, trendMap]);

  const finalChartData = useMemo<ChartPoint[]>(() => {
    if (weeklyData.length === 0 || !settings) return [];

    const now = new Date();
    const latestWeightDate = weights.length > 0 ? new Date(weights[0].date) : now;
    const chartEndDate = latestWeightDate > now ? latestWeightDate : now;

    let startDate = new Date('2000-01-01');
    const earliestDataDate = new Date(weights[weights.length - 1]?.date || now);

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

    if (chartMode === 'weekly') {
      return weeklyData
        .filter(w => new Date(w.entries[0].date) >= startDate)
        .map(w => ({
          label: w.weekId,
          dateObj: new Date(w.entries[0].date),
          weekLabel: w.weekLabel,
          actual: w.rawAvg,
          trend: w.actual,
        }));
    } else {
      const weightMap = new Map(weights.map(w => [w.date, w.weight]));
      const allDays = getDaysArray(startDate, chartEndDate);

      let lastKnownTrend = 0;
      const startStr = startDate.toISOString().split('T')[0];
      const sortedDates: string[] = Array.from(trendMap.keys()).map(k => String(k)).sort();

      for (let i = sortedDates.length - 1; i >= 0; i--) {
        if (sortedDates[i] <= startStr) {
          const trendVal = trendMap.get(sortedDates[i]);
          if (trendVal !== undefined) {
            lastKnownTrend = trendVal;
            break;
          }
        }
      }
      if (lastKnownTrend === 0 && sortedDates.length > 0) {
        const firstTrend = trendMap.get(sortedDates[0]);
        if (firstTrend !== undefined) {
          lastKnownTrend = firstTrend;
        }
      }

      return allDays.map((dateStr) => {
        if (trendMap.has(dateStr)) {
          lastKnownTrend = trendMap.get(dateStr)!;
        }

        return {
          label: dateStr,
          dateObj: new Date(dateStr),
          actual: weightMap.has(dateStr) ? weightMap.get(dateStr)! : null,
          trend: lastKnownTrend,
        };
      }).filter(p => p.trend !== 0);
    }
  }, [weeklyData, weights, chartMode, settings, filterRange, trendMap]);

  return { weeklyData, trendMap, currentTrendRate, projectionData, finalChartData };
}
