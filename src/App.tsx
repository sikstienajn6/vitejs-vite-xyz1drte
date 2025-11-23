import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { 
  TrendingDown, 
  TrendingUp, 
  Plus, 
  Settings, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  Activity,
  Calendar,
  Clock,
  LogOut,
  LogIn,
  AlertCircle,
  Info
} from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBxmZXjDUpeOUPWFD_Bg-dOP4J4_F3R1rE",
  authDomain: "weighttracker-b4b79.firebaseapp.com",
  projectId: "weighttracker-b4b79",
  storageBucket: "weighttracker-b4b79.firebasestorage.app",
  messagingSenderId: "895893600072",
  appId: "1:895893600072:web:e329aba69602d46fa8e57d",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- LOGIC CONSTANTS ---
const TARGET_TOLERANCE = 0.2; 
const RATE_TOLERANCE_GREEN = 0.1;
const RATE_TOLERANCE_ORANGE = 0.25;
const BREAK_LINE_THRESHOLD_DAYS = 7; 

// Height Constants
const HEIGHT_COMPRESSED = 250;
const HEIGHT_EXPANDED = 450;
const SNAP_THRESHOLD = (HEIGHT_EXPANDED + HEIGHT_COMPRESSED) / 2;

// --- Types ---
interface WeightEntry {
  id: string;
  weight: number;
  date: string;
  createdAt: any;
}

interface SettingsData {
  weeklyRate: number;
  updatedAt: any;
}

interface WeeklySummary {
  weekId: string;
  weekLabel: string;
  median: number; 
  count: number;
  entries: WeightEntry[];
  target: number;
  delta: number;
  hasPrev: boolean;
  inTunnel: boolean; 
}

interface ChartPoint {
    label: string; 
    actual: number | null; 
    trend: number | null;  
    target: number;
    targetUpper: number;
    targetLower: number;
    weekLabel?: string;
}

// --- Helper Functions ---
const getWeekKey = (date: string) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(Date.UTC(d.getFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const getDaysArray = (start: Date, end: Date) => {
    const arr = [];
    for(let dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
        arr.push(new Date(dt).toISOString().split('T')[0]);
    }
    return arr;
};

const calculateMedian = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
};

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard'); 
  
  // Chart State
  const [chartMode, setChartMode] = useState<'weekly' | 'daily'>('weekly');
  const [filterRange, setFilterRange] = useState<'1M' | '3M' | 'ALL'>('3M');
  
  // Drag & Snap State
  const [chartHeight, setChartHeight] = useState(HEIGHT_COMPRESSED);
  const [isDragging, setIsDragging] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  
  // Responsive Width State
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [goalType, setGoalType] = useState<'gain' | 'lose'>('gain');
  const [weeklyRate, setWeeklyRate] = useState('0.2'); 
  const [monthlyRate, setMonthlyRate] = useState('0.87'); 

  // --- AUTH ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- MEASURE WIDTH ---
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [view, loading]); 

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login initiation failed:", error);
      alert("Login failed: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // --- DATA FETCHING ---
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
      } else {
        setSettings(null);
        setView('settings'); 
      }
    }, (err) => console.error("Settings fetch error:", err));

    return () => {
      unsubWeights();
      unsubSettings();
    };
  }, [user]);

  // --- ENGINE: WEEKLY FIRST ARCHITECTURE ---
  const { weeklyData, currentTrendRate } = useMemo(() => {
    if (weights.length === 0 || !settings) {
        return { weeklyData: [] as WeeklySummary[], currentTrendRate: 0 };
    }

    const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    
    // Group by Week
    const groups: Record<string, WeightEntry[]> = {};
    weights.forEach(entry => {
      const weekKey = getWeekKey(entry.date);
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(entry);
    });

    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    
    // 1. Calculate Weekly Medians
    let processedWeeks: WeeklySummary[] = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      const rawMedian = calculateMedian(entries.map(e => e.weight));
      const earliestDate = entries[entries.length - 1].date; 

      return {
        weekId: weekKey,
        weekLabel: formatDate(earliestDate),
        median: rawMedian,
        count: entries.length,
        entries: entries,
        target: 0, 
        delta: 0,
        hasPrev: false,
        inTunnel: true 
      };
    });

    // 2. Propagate Target & Tunnel Logic (Week-to-Week)
    for (let i = 0; i < processedWeeks.length; i++) {
        if (i === 0) {
            processedWeeks[i].target = processedWeeks[i].median;
        } else {
            const prev = processedWeeks[i-1];
            // Check if previous week finished "In Tunnel"
            const dist = Math.abs(prev.median - prev.target);
            
            if (dist <= TARGET_TOLERANCE) {
                // If on track, continue trajectory
                processedWeeks[i].target = prev.target + rate;
            } else {
                // If deviated, reset target to current reality
                processedWeeks[i].target = prev.median + rate;
            }
            
            processedWeeks[i].delta = processedWeeks[i].median - prev.median;
            processedWeeks[i].hasPrev = true;
        }
        processedWeeks[i].inTunnel = Math.abs(processedWeeks[i].median - processedWeeks[i].target) <= TARGET_TOLERANCE;
    }

    // 3. Sync Rate with Last Week's Delta (User Request)
    const lastRate = processedWeeks.length > 0 ? processedWeeks[processedWeeks.length - 1].delta : 0;

    return { weeklyData: processedWeeks, currentTrendRate: lastRate };
  }, [weights, settings]);


  // --- CHART DATA PREP ---
  const finalChartData = useMemo<ChartPoint[]>(() => {
    if (weeklyData.length === 0 || !settings) return [];

    const now = new Date();
    let startDate = new Date('2000-01-01'); 
    const earliestDataDate = new Date(weights[weights.length-1]?.date || now);

    if (filterRange === '1M') {
        startDate = new Date();
        startDate.setMonth(now.getMonth() - 1);
    } else if (filterRange === '3M') {
        startDate = new Date();
        startDate.setMonth(now.getMonth() - 3);
    } else {
        startDate = earliestDataDate;
    }

    if (startDate < earliestDataDate && filterRange !== 'ALL') startDate = earliestDataDate;
    if (startDate > now) startDate = earliestDataDate;

    if (chartMode === 'weekly') {
        return weeklyData
            .filter(w => new Date(w.entries[0].date) >= startDate)
            .map(w => ({
                label: w.weekId, 
                weekLabel: w.weekLabel,
                actual: w.median, 
                trend: w.median, 
                target: w.target,
                targetUpper: w.target + TARGET_TOLERANCE,
                targetLower: w.target - TARGET_TOLERANCE,
            }));
    } else {
        // DAILY MODE: Interpolate from Weekly Targets
        const rate = parseFloat(settings.weeklyRate.toString()) || 0;
        const weekMap = new Map(weeklyData.map(w => [w.weekId, w]));
        const weightMap = new Map(weights.map(w => [w.date, w.weight]));
        const allDays = getDaysArray(startDate, now);

        return allDays.map(dateStr => {
            const wKey = getWeekKey(dateStr);
            const parentWeek = weekMap.get(wKey);
            
            let dailyTarget = 0;
            let targetFound = false;

            if (parentWeek) {
                // Logic: Center the Target on the middle of the week (Wednesday/Thursday)
                // Then slope it based on the rate.
                // Assuming parentWeek.target is the END of week target.
                const dayNum = new Date(dateStr).getDay(); 
                const dayIndex = dayNum === 0 ? 6 : dayNum - 1; // Mon=0, Sun=6
                
                // If rate is weekly, daily rate is rate/7
                // Start of week target = WeekTarget - Rate
                // Daily Target = (WeekTarget - Rate) + (Rate * (dayIndex+1)/7)
                const weekStartTarget = parentWeek.target - rate;
                const dailyProgress = (dayIndex + 1) / 7;
                dailyTarget = weekStartTarget + (rate * dailyProgress);
                targetFound = true;
            }

            return {
                label: dateStr,
                actual: weightMap.has(dateStr) ? weightMap.get(dateStr)! : null,
                // RAW DATA ONLY for the Trend Line
                trend: weightMap.has(dateStr) ? weightMap.get(dateStr)! : null,
                target: targetFound ? dailyTarget : 0,
                targetUpper: targetFound ? dailyTarget + TARGET_TOLERANCE : 0,
                targetLower: targetFound ? dailyTarget - TARGET_TOLERANCE : 0,
            };
        }).filter(p => p.target !== 0); 
    }
  }, [weeklyData, weights, chartMode, settings, filterRange]);

  // --- ACTIONS ---
  const resetSettingsForm = () => {
     if (settings) {
        const wRate = settings.weeklyRate || 0;
        const isNegative = wRate < 0;
        const absRate = Math.abs(wRate);
        setGoalType(isNegative ? 'lose' : 'gain');
        setWeeklyRate(absRate.toString());
        setMonthlyRate((absRate * 4.345).toFixed(2));
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
        createdAt: serverTimestamp()
      });
      setWeightInput('');
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

      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), {
        weeklyRate: rate,
        updatedAt: serverTimestamp()
      });
      setView('dashboard');
    } catch (err) {
      console.error("Error saving settings:", err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    if (!user) return;
    try {
      // @ts-ignore
      await deleteDoc(doc(db, 'users', user.uid, 'weights', id));
    } catch (err) {
      console.error("Delete error", err);
    }
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks(prev => 
      prev.includes(weekId) ? prev.filter(id => id !== weekId) : [...prev, weekId]
    );
  };

  const getRateAdherenceColor = (rate: number) => {
    if (!settings) return 'text-slate-500';
    const targetRate = settings.weeklyRate;
    const deviation = Math.abs(rate - targetRate);
    if (deviation <= RATE_TOLERANCE_GREEN) return 'text-emerald-400';
    if (deviation <= RATE_TOLERANCE_ORANGE) return 'text-amber-400';
    return 'text-rose-400'; 
  };

  // --- DRAG & SNAP LOGIC ---
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startHeightRef.current = chartHeight;
    
    document.body.style.userSelect = 'none'; 
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;
    
    if (e.cancelable) e.preventDefault();
    if (e.type === 'touchmove') e.stopImmediatePropagation();

    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const delta = clientY - startYRef.current;
    
    const newHeight = Math.max(HEIGHT_COMPRESSED, Math.min(HEIGHT_EXPANDED, startHeightRef.current + delta));
    setChartHeight(newHeight);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.userSelect = '';
    
    setChartHeight(prev => {
        if (prev > SNAP_THRESHOLD) return HEIGHT_EXPANDED;
        return HEIGHT_COMPRESSED;
    });

    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
  };

  const toggleExpand = () => {
      if (!isDraggingRef.current) {
          setChartHeight(prev => prev > SNAP_THRESHOLD ? HEIGHT_COMPRESSED : HEIGHT_EXPANDED);
      }
  };

  // --- CHART COMPONENT ---
  const ChartRenderer = ({ data, mode, height, width }: { data: ChartPoint[], mode: 'weekly' | 'daily', height: number, width: number }) => {
    if (!data || data.length === 0) return (
      <div className="flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800" style={{height: height}}>
        <p className="text-sm">Log data to see trend</p>
      </div>
    );
    
    const renderWidth = width > 0 ? width : 100;
    const expanded = height > SNAP_THRESHOLD;
    
    const padding = { top: 20, bottom: 24, left: 32, right: 16 };

    const validValues = data.flatMap(d => {
        const vals = [];
        if (d.actual !== null) vals.push(d.actual);
        if (d.trend !== null) vals.push(d.trend);
        vals.push(d.targetUpper, d.targetLower);
        return vals;
    });
    
    const rawMin = Math.min(...validValues);
    const rawMax = Math.max(...validValues);
    const rawRange = rawMax - rawMin || 1;
    const buffer = rawRange * 0.05; 
    
    const minVal = rawMin - buffer;
    const maxVal = rawMax + buffer;
    const range = maxVal - minVal || 1;

    const availableWidth = renderWidth - padding.left - padding.right;
    const count = data.length;
    const denominator = count > 1 ? count - 1 : 1;
    
    const getX = (i: number) => padding.left + (i / denominator) * availableWidth;
    const getY = (val: number) => (height - padding.bottom) - ((val - minVal) / range) * (height - padding.top - padding.bottom);

    const gridCount = 5;
    const gridStops = Array.from({length: gridCount}, (_, i) => minVal + (range * (i / (gridCount-1))));

    const areaPoints = [
        ...data.map((d, i) => `${getX(i)},${getY(d.targetUpper)}`),
        ...data.slice().reverse().map((d, i) => `${getX(data.length - 1 - i)},${getY(d.targetLower)}`)
    ].join(' ');

    let trendPath = '';
    // Only generate path if we have > 1 point
    if (count > 1) {
        let lastValidT = -1;
        data.forEach((d, i) => {
            if (d.trend === null) return;
            const x = getX(i);
            const y = getY(d.trend);
            if (lastValidT === -1) trendPath += `M ${x},${y} `;
            else {
                const distance = i - lastValidT;
                if (distance > BREAK_LINE_THRESHOLD_DAYS) trendPath += `M ${x},${y} `;
                else trendPath += `L ${x},${y} `; 
            }
            lastValidT = i;
        });
    }

    const minLabelSpacing = 35; 
    let lastRenderedX = -999;
    const lastPointX = getX(data.length - 1);

    return (
      <div 
        className={