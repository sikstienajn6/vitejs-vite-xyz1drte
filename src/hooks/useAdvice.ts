import { useMemo } from 'react';
import type { SettingsData, WeeklySummary, WeightEntry } from '../lib/types';
import { getLastSundayWeekKey } from '../lib/utils';

interface AdviceResult {
  color: string;
  text: string;
}

export function getWeekTrendStatus(delta: number, settings: SettingsData | null) {
  if (!settings) return { status: 'ok', text: 'Trend: On Track', color: 'text-emerald-500' };
  const targetRate = settings.weeklyRate;

  const diffRate = targetRate - delta;
  const kcalAdjustment = Math.round((diffRate / 7) * 7700);
  const absKcal = Math.abs(kcalAdjustment);

  if (absKcal < 100) {
    return {
      status: 'ok',
      text: 'Trend: On Track',
      color: 'text-emerald-500',
      advice: 'On track. Maintain current calories.'
    };
  }

  const displayKcal = Math.round(absKcal / 10) * 10;

  if (kcalAdjustment > 0) {
    return {
      status: 'slow',
      text: 'Trend: Stalling',
      color: 'text-amber-500',
      advice: `Add ~${displayKcal} kcal/day.`
    };
  } else {
    return {
      status: 'fast',
      text: 'Trend: Deviated',
      color: 'text-rose-500',
      advice: `Remove ~${displayKcal} kcal/day.`
    };
  }
}

function getAdvice(settings: SettingsData | null, currentTrendRate: number): AdviceResult | null {
  if (!settings) return null;
  const targetRate = parseFloat(settings.weeklyRate.toString());
  const currentRate = currentTrendRate;

  const diffRate = targetRate - currentRate;
  const kcalAdjustment = Math.round((diffRate / 7) * 7700);
  const absKcal = Math.abs(kcalAdjustment);

  if (absKcal < 100) {
    return { color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200', text: 'On track. Maintain current calories.' };
  }

  const displayKcal = Math.round(absKcal / 10) * 10;

  if (kcalAdjustment > 0) {
    return {
      color: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
      text: `Stalling. Add ~${displayKcal} kcal/day.`
    };
  } else {
    return {
      color: 'bg-rose-500/10 border-rose-500/20 text-rose-200',
      text: `Deviated. Remove ~${displayKcal} kcal/day.`
    };
  }
}

export function useAdvice(
  settings: SettingsData | null,
  weeklyData: WeeklySummary[],
  weights: WeightEntry[],
  currentTrendRate: number,
  dismissedAdviceWeeks: string[],
  adviceSkippedToday: boolean
) {
  const baseAdvice = getAdvice(settings, currentTrendRate);

  const { showAdvice, showPreWeightPrompt } = useMemo(() => {
    const res = { showAdvice: false, showPreWeightPrompt: false };

    if (!baseAdvice || !settings || weeklyData.length === 0) return res;
    if (weeklyData.length < 1) return res;

    const today = new Date();
    const isSunday = today.getDay() === 0;

    const todayStr = today.toISOString().split('T')[0];
    const hasWeightToday = weights.some(w => w.date === todayStr);

    if (isSunday) {
      if (!hasWeightToday && !adviceSkippedToday) {
        return { showAdvice: false, showPreWeightPrompt: true };
      }
    }

    const lastSundayWeekKey = getLastSundayWeekKey();
    if (dismissedAdviceWeeks.includes(lastSundayWeekKey)) return res;

    const hasDataForWeek = weeklyData.some(w => w.weekId === lastSundayWeekKey);
    if (!hasDataForWeek) return res;

    return { showAdvice: true, showPreWeightPrompt: false };
  }, [baseAdvice, settings, weeklyData, dismissedAdviceWeeks, weights, adviceSkippedToday]);

  const advice = showAdvice ? baseAdvice : null;

  return { advice, showAdvice, showPreWeightPrompt };
}
