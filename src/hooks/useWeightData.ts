import { useState, useEffect } from 'react';
import { type User } from 'firebase/auth';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { WeightEntry, SettingsData } from '../lib/types';
import { getWeekKey, getLastSundayWeekKey } from '../lib/utils';

export function useWeightData(user: User | null) {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [dismissedAdviceWeeks, setDismissedAdviceWeeks] = useState<string[]>([]);

  // Settings form state
  const [goalType, setGoalType] = useState<'gain' | 'lose'>('gain');
  const [weeklyRate, setWeeklyRate] = useState('0.2');
  const [monthlyRate, setMonthlyRate] = useState('0.87');
  const [dailyCalories, setDailyCalories] = useState('');

  // View state
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');

  // Input state
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [commentInput, setCommentInput] = useState('');

  // Modal state
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setWeights([]);
      setSettings(null);
      return;
    }

    // @ts-ignore
    const qWeights = query(collection(db, 'users', user.uid, 'weights'), orderBy('date', 'desc'));
    const unsubWeights = onSnapshot(qWeights, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WeightEntry[];
      setWeights(data);
    }, (err) => console.error("Weight fetch error:", err));

    // @ts-ignore
    const docRef = doc(db, 'users', user.uid, 'settings', 'config');
    const unsubSettings = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const s = snapshot.data() as SettingsData;
        setSettings(s);

        const wRate = s.weeklyRate ? s.weeklyRate : 0;
        const isNegative = wRate < 0;
        const absRate = Math.abs(wRate);

        setGoalType(isNegative ? 'lose' : 'gain');
        setWeeklyRate(absRate.toString());
        setMonthlyRate((absRate * 4.345).toFixed(2));
        setDailyCalories(s.dailyCalories ? s.dailyCalories.toString() : '');
      } else {
        setSettings(null);
        setView('settings');
      }
    }, (err) => console.error("Settings fetch error:", err));

    // @ts-ignore
    const dismissedRef = doc(db, 'users', user.uid, 'settings', 'dismissedAdvice');
    const unsubDismissed = onSnapshot(dismissedRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setDismissedAdviceWeeks(data?.weeks || []);
      } else {
        setDismissedAdviceWeeks([]);
      }
    }, (err) => console.error("Dismissed advice fetch error:", err));

    return () => {
      unsubWeights();
      unsubSettings();
      unsubDismissed();
    };
  }, [user]);

  const resetSettingsForm = () => {
    if (settings) {
      const wRate = settings.weeklyRate || 0;
      const isNegative = wRate < 0;
      const absRate = Math.abs(wRate);
      setGoalType(isNegative ? 'lose' : 'gain');
      setWeeklyRate(absRate.toString());
      setMonthlyRate((absRate * 4.345).toFixed(2));
      setDailyCalories(settings.dailyCalories ? settings.dailyCalories.toString() : '');
    }
  };

  const handleNavigation = (targetView: 'dashboard' | 'settings') => {
    if (view === 'settings' && targetView === 'dashboard') resetSettingsForm();
    setView(targetView);
  };

  const handleRateChange = (val: string, type: 'weekly' | 'monthly') => {
    const sanitizedVal = val.replace(',', '.');
    if (sanitizedVal === '') { setWeeklyRate(''); setMonthlyRate(''); return; }
    if (sanitizedVal === '.') { type === 'weekly' ? setWeeklyRate('.') : setMonthlyRate('.'); return; }
    const num = parseFloat(sanitizedVal);
    if (isNaN(num)) { type === 'weekly' ? setWeeklyRate(sanitizedVal) : setMonthlyRate(sanitizedVal); return; }
    if (type === 'weekly') {
      setWeeklyRate(sanitizedVal);
      setMonthlyRate((num * 4.345).toFixed(2));
    } else {
      setMonthlyRate(sanitizedVal);
      setWeeklyRate((num / 4.345).toFixed(2));
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput || !user) return;
    try {
      const sanitizedWeight = parseFloat(weightInput.replace(',', '.'));
      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'weights', dateInput), {
        weight: sanitizedWeight,
        date: dateInput,
        comment: commentInput,
        createdAt: serverTimestamp()
      });
      setWeightInput('');
      setCommentInput('');
    } catch (err) {
      console.error("Error adding weight:", err);
      alert("Error saving.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      let rate = parseFloat(weeklyRate);
      if (goalType === 'lose') rate = -Math.abs(rate);
      else rate = Math.abs(rate);

      const cals = dailyCalories ? parseInt(dailyCalories) : 0;

      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), {
        weeklyRate: rate,
        dailyCalories: cals,
        updatedAt: serverTimestamp()
      });
      setView('dashboard');
    } catch (err) {
      console.error("Error saving settings:", err);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteConfirmationId || !user) return;
    try {
      // @ts-ignore
      await deleteDoc(doc(db, 'users', user.uid, 'weights', deleteConfirmationId));
      setDeleteConfirmationId(null);
    } catch (err) {
      console.error("Delete error", err);
    }
  };

  const handleExportCsv = (weeklyData: import('../lib/types').WeeklySummary[], trendMap: Map<string, number>) => {
    if (!weights || weights.length === 0) {
      alert("No data to export.");
      return;
    }

    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const weekAgg = new Map<string, { avg: number; median: number }>();
    weeklyData.forEach(w => {
      weekAgg.set(w.weekId, { avg: w.rawAvg, median: w.median });
    });

    const header = ['date', 'weight', 'comment', 'ema', 'week_id', 'week_median', 'week_average'];
    const rows = sorted.map(entry => {
      const weekId = getWeekKey(entry.date);
      const ema = trendMap.get(entry.date) ?? '';
      const agg = weekAgg.get(weekId);
      const median = agg?.median ?? '';
      const avg = agg?.avg ?? '';
      const commentSafe = entry.comment ? `"${entry.comment.replace(/"/g, '""')}"` : '';
      return [entry.date, entry.weight, commentSafe, ema, weekId, median, avg].join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'weights.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDismissAdvice = async () => {
    if (!user) return;
    const lastSundayWeekKey = getLastSundayWeekKey();
    const updatedWeeks = [...dismissedAdviceWeeks, lastSundayWeekKey];

    try {
      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'settings', 'dismissedAdvice'), {
        weeks: updatedWeeks,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error dismissing advice:", err);
    }
  };

  return {
    weights,
    settings,
    dismissedAdviceWeeks,
    view,
    goalType,
    setGoalType,
    weeklyRate,
    monthlyRate,
    dailyCalories,
    setDailyCalories,
    weightInput,
    setWeightInput,
    dateInput,
    setDateInput,
    commentInput,
    setCommentInput,
    deleteConfirmationId,
    setDeleteConfirmationId,
    handleNavigation,
    handleRateChange,
    handleAddWeight,
    handleSaveSettings,
    handleDeleteEntry,
    handleExportCsv,
    handleDismissAdvice,
  };
}
