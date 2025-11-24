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
  Info,
  Utensils
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
const EMA_ALPHA = 0.1; 
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
  actual: number; 
  rawAvg: number; 
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

  // --- CALCULATIONS ---
  const { weeklyData, trendMap, currentTrendRate } = useMemo(() => {
    if (weights.length === 0 || !settings) {
        return { weeklyData: [] as WeeklySummary[], trendMap: new Map(), currentTrendRate: 0 };
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
    
    // Sort entries inside each week ascending by date (oldest -> newest)
    Object.keys(groups).forEach(k => {
      groups[k].sort((a, b) => a.date.localeCompare(b.date));
    });
    

    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    
let processedWeeks: WeeklySummary[] = Object.keys(groups).sort().map((weekKey) => {
  const entries = groups[weekKey];
  const valSum = entries.reduce((sum, e) => sum + e.weight, 0);
  const rawAvg = valSum / entries.length;

  // Use EMA average (trend) for the week's "actual"
  const trendSum = entries.reduce((sum, e) => sum + (tMap.get(e.date) ?? e.weight), 0);
  const trendAvg = trendSum / entries.length;

  const earliestDate = entries[0].date; // earliest is now entries[0] because we sorted

  return {
    weekId: weekKey,
    weekLabel: formatDate(earliestDate),
    actual: trendAvg,
    rawAvg: rawAvg,
    count: entries.length,
    entries: entries,
    target: 0,
    delta: 0,
    hasPrev: false,
    inTunnel: true
  } as WeeklySummary;
});

// Assign targets so each week is centred on previous week's EMA + rate
for (let i = 0; i < processedWeeks.length; i++) {
  if (i === 0) {
    // first week: anchor target at its own EMA (no previous week available)
    processedWeeks[i].target = processedWeeks[i].actual;
    processedWeeks[i].hasPrev = false;
    processedWeeks[i].delta = 0;
  } else {
    const prevWeek = processedWeeks[i - 1];
    // Always start from previous week's EMA, then add desired weekly rate
    processedWeeks[i].target = prevWeek.actual + rate;
    processedWeeks[i].delta = processedWeeks[i].actual - prevWeek.actual;
    processedWeeks[i].hasPrev = true;
  }

  processedWeeks[i].inTunnel = Math.abs(processedWeeks[i].actual - processedWeeks[i].target) <= TARGET_TOLERANCE;
}


    for (let i = 0; i < processedWeeks.length; i++) {
        if (i === 0) {
            processedWeeks[i].target = processedWeeks[i].actual;
        } else {
            const prev = processedWeeks[i-1];
            const dist = Math.abs(prev.actual - prev.target);
            
            if (dist <= TARGET_TOLERANCE) {
                processedWeeks[i].target = prev.target + rate;
            } else {
                processedWeeks[i].target = prev.actual + rate;
            }
            
            processedWeeks[i].delta = processedWeeks[i].actual - prev.actual;
            processedWeeks[i].hasPrev = true;
        }
        processedWeeks[i].inTunnel = Math.abs(processedWeeks[i].actual - processedWeeks[i].target) <= TARGET_TOLERANCE;
    }

    const lastEntry = sortedWeights[sortedWeights.length - 1];
    const lastTrend = tMap.get(lastEntry.date) || 0;
    
    const sevenDaysAgo = new Date(lastEntry.date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sdaString = sevenDaysAgo.toISOString().split('T')[0];
    
    let prevTrend = lastTrend; 
    for(let i = sortedWeights.length - 2; i >= 0; i--) {
        if (sortedWeights[i].date <= sdaString) {
            prevTrend = tMap.get(sortedWeights[i].date) || 0;
            break;
        }
    }
    
    const currentRate = lastTrend - prevTrend;

    return { weeklyData: processedWeeks, trendMap: tMap, currentTrendRate: currentRate };
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
                actual: w.rawAvg, 
                trend: w.actual, 
                target: w.target,
                targetUpper: w.target + TARGET_TOLERANCE,
                targetLower: w.target - TARGET_TOLERANCE,
            }));
          } else {
            const rate = parseFloat(settings.weeklyRate.toString()) || 0;
            // Keep an ordered array of weeks for index arithmetic
            const orderedWeeks = weeklyData.slice().sort((a,b) => a.weekId.localeCompare(b.weekId));
            const weekIndexMap = new Map(orderedWeeks.map((w, idx) => [w.weekId, idx]));
            const weightMap = new Map(weights.map(w => [w.date, w.weight]));
            const allDays = getDaysArray(startDate, now);
          
            return allDays.map(dateStr => {
              const wKey = getWeekKey(dateStr);
              const parentWeek = orderedWeeks[weekIndexMap.get(wKey) ?? -1];
          
              let dailyTarget = 0;
              let targetFound = false;
          
              if (parentWeek) {
                const parentIdx = weekIndexMap.get(wKey)!;
                const prevWeek = orderedWeeks[parentIdx - 1]; // may be undefined for first week
          
                // determine the start of growth for this week: previous week's EMA (if exists), otherwise use parentWeek.actual - rate
                const startEMA = prevWeek ? prevWeek.actual : (parentWeek.actual - rate);
          
                // dayIndex: 0..6 (Mon..Sun). Use a consistent progression across the 7 days
                const dayNum = new Date(dateStr).getDay();
                const dayIndex = dayNum === 0 ? 6 : dayNum - 1;
                const dailyProgress = (dayIndex + 1) / 7;
          
                dailyTarget = startEMA + (rate * dailyProgress);
                targetFound = true;
              }
          
              return {
                label: dateStr,
                actual: weightMap.has(dateStr) ? weightMap.get(dateStr)! : null,
                trend: trendMap.has(dateStr) ? trendMap.get(dateStr)! : null,
                target: targetFound ? dailyTarget : 0,
                targetUpper: targetFound ? dailyTarget + TARGET_TOLERANCE : 0,
                targetLower: targetFound ? dailyTarget - TARGET_TOLERANCE : 0,
              };
            }).filter(p => p.target !== 0);
          }
          
  }, [weeklyData, weights, chartMode, settings, filterRange, trendMap]);

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

  // --- ADVICE LOGIC ---
  const getAdvice = () => {
    if (!settings) return null;
    
    // Convert to absolute target to compare magnitude
    const targetAbs = Math.abs(parseFloat(settings.weeklyRate.toString()));
    
    // We analyze the gap. 
    // If GAINING: Target 0.2. 
    //   If rate < 0.1 (Too slow/Stall) -> Add Cals
    //   If rate > 0.35 (Too fast) -> Cut Cals
    // If LOSING: Target -0.5. (We treat magnitude)
    //   If rate > -0.2 (e.g. -0.1 or +0.1) -> Loss is too slow -> Cut Cals
    //   If rate < -0.8 -> Loss is too fast -> Add Cals

    const rate = currentTrendRate;
    let status: 'ok' | 'slow' | 'fast' = 'ok';
    let action: 'none' | 'add' | 'remove' = 'none';
    
    if (goalType === 'gain') {
        if (rate < targetAbs - 0.1) { status = 'slow'; action = 'add'; }
        else if (rate > targetAbs + 0.15) { status = 'fast'; action = 'remove'; }
    } else {
        // Lose logic (rates are negative)
        const targetSigned = -targetAbs;
        // e.g. Target -0.5. Rate -0.1. (-0.1 > -0.4) -> Slow loss
        if (rate > targetSigned + 0.1) { status = 'slow'; action = 'remove'; }
        // e.g. Target -0.5. Rate -0.8. (-0.8 < -0.65) -> Fast loss
        else if (rate < targetSigned - 0.15) { status = 'fast'; action = 'add'; }
    }

    if (status === 'ok') return { color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200', text: 'On track. Maintain current calories.' };
    
    if (action === 'add') return { 
        color: 'bg-amber-500/10 border-amber-500/20 text-amber-200', 
        text: goalType === 'gain' ? 'Stalling. Add ~250 kcal/day.' : 'Losing too fast. Add ~200 kcal/day.' 
    };
    
    if (action === 'remove') return { 
        color: 'bg-rose-500/10 border-rose-500/20 text-rose-200', 
        text: goalType === 'gain' ? 'Gaining too fast. Remove ~200 kcal/day.' : 'Stalling. Remove ~250 kcal/day.' 
    };
    
    return null;
  };

  const advice = getAdvice();

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
    
    // Padding: Left maintained at 32 for Y-axis text
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

    // --- GRID LINES ---
    const gridCount = 5;
    const gridStops = Array.from({length: gridCount}, (_, i) => minVal + (range * (i / (gridCount-1))));

    // --- AREA POINTS ---
    const areaPoints = [
        ...data.map((d, i) => `${getX(i)},${getY(d.targetUpper)}`),
        ...data.slice().reverse().map((d, i) => `${getX(data.length - 1 - i)},${getY(d.targetLower)}`)
    ].join(' ');

    let trendPath = '';
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

    // --- SMART AXIS LOGIC ---
    // Minimum pixels required between two X-axis labels
    const minLabelSpacing = 35; 
    let lastRenderedX = -999;
    const lastPointX = getX(data.length - 1);

    return (
      <div 
        className={`w-full overflow-hidden rounded-t-xl bg-slate-900 border-x border-t border-slate-800 shadow-sm select-none ${isDragging ? '' : 'transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]'}`} 
        style={{height: height}}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${renderWidth} ${height}`} className="block">
          
          {/* HORIZONTAL GRID & Y-AXIS LABELS (Always Visible) */}
          {gridStops.map((val, idx) => (
             <g key={idx}>
               <line x1={padding.left} y1={getY(val)} x2={renderWidth - padding.right} y2={getY(val)} stroke="#1e293b" strokeWidth="1" />
               <text x={padding.left - 6} y={getY(val) + 3} fontSize="9" fill="#64748b" textAnchor="end">{val.toFixed(1)}</text>
             </g>
          ))}
          
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />
          <line x1={padding.left} y1={height - padding.bottom} x2={renderWidth - padding.right} y2={height - padding.bottom} stroke="#334155" strokeWidth="1" />

          {/* TUNNEL */}
          <polygon points={areaPoints} fill="rgba(16, 185, 129, 0.08)" stroke="none" />
          
          {/* TREND LINE */}
          <defs>
            <linearGradient id="trendGradient" gradientUnits="userSpaceOnUse">
                {data.map((d, i) => {
                    if (d.trend === null) return null;
                    const offset = (i / denominator) * 100;
                    const isOff = d.trend > d.targetUpper || d.trend < d.targetLower;
                    return <stop key={i} offset={`${offset}%`} stopColor={isOff ? "#ef4444" : "#10b981"} />;
                })}
            </linearGradient>
          </defs>
          
          {count > 1 && (
              <path d={trendPath} fill="none" stroke="url(#trendGradient)" strokeWidth={expanded ? "3" : "2"} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* DATA POINTS */}
          {data.map((d, i) => {
             if (d.actual === null) return null;
             const px = getX(i);
             const py = getY(d.actual);
             
             return (
                <g key={i}>
                    <circle 
                        cx={px} 
                        cy={py} 
                        r={expanded ? 3.5 : 2} 
                        fill="#94a3b8" 
                        opacity={expanded ? "0.9" : "0.6"}
                    />
                    {expanded && (
                        <text x={px} y={py - 12} fontSize="10" fill="#cbd5e1" textAnchor="middle" fontWeight="bold">
                            {d.actual.toFixed(1)}
                        </text>
                    )}
                </g>
             );
          })}

          {/* SMART X-AXIS LABELS */}
          {data.map((d, i) => {
             const xPos = getX(i);
             const isFirst = i === 0;
             const isLast = i === data.length - 1;
             
             let shouldRender = false;
             let anchor: "start" | "middle" | "end" = "middle";

             // 1. Always render First
             if (isFirst) {
                 shouldRender = true;
                 anchor = "start";
             }
             // 2. Always render Last
             else if (isLast) {
                 shouldRender = true;
                 anchor = "end";
             }
             // 3. Render intermediate if space permits (Buffer Zone Logic)
             else {
                 const distToLast = lastPointX - xPos;
                 const distToPrev = xPos - lastRenderedX;
                 
                 // Must clear BOTH the Previous label AND the Final label
                 if (distToLast > minLabelSpacing && distToPrev > minLabelSpacing) {
                     shouldRender = true;
                 }
             }

             if (!shouldRender) return null;

             // Update tracker only if we actually rendered
             lastRenderedX = xPos;

             return (
                <text key={i} x={xPos} y={height - 6} fontSize="9" fill="#64748b" textAnchor={anchor} fontWeight="bold">
                    {mode === 'weekly' ? d.weekLabel : formatDate(d.label)}
                </text>
             );
          })}
        </svg>
      </div>
    );
  };

  if (loading) return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-950 flex items-center justify-center z-50">
        <div className="text-blue-500 animate-pulse font-bold text-lg flex items-center gap-3">
            <Activity size={24} /> Loading RateTracker...
        </div>
    </div>
  );

  if (!user) return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-950 grid place-items-center p-6 overflow-hidden overscroll-none">
        <div className="fixed inset-0 bg-slate-950 -z-10" />
        <div className="max-w-xs text-center w-full">
            <Activity size={48} className="text-blue-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">RateTracker</h1>
            <p className="text-slate-400">Track your progress securely.</p>
            <div className="mt-8">
                <button onClick={handleGoogleLogin} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-3 hover:bg-slate-200 transition-colors w-full justify-center">
                    <LogIn size={20} /> Sign in with Google
                </button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden overscroll-none">
      
      <div className="bg-slate-900/80 backdrop-blur-md px-4 py-4 shadow-sm shrink-0 flex justify-between items-center max-w-md mx-auto w-full border-b border-slate-800 z-10">
        <div className="flex items-center gap-2 text-blue-500 font-bold">RateTracker</div>
        <div className="flex gap-2">
            <button 
                onClick={() => handleNavigation(view === 'settings' ? 'dashboard' : 'settings')} 
                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
                <Settings size={20} className={view === 'settings' ? "text-blue-400" : "text-slate-400"} />
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-red-400">
                <LogOut size={20} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        <div className={`max-w-md mx-auto p-4 ${view === 'settings' ? 'h-full flex flex-col' : 'space-y-5'}`}>
            
            {view === 'dashboard' && (
            <>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
                        <p className="text-slate-400 text-xs font-medium uppercase mb-1">Trend Weight</p>
                        <p className="text-2xl font-bold text-white truncate">
                        {weeklyData.length > 0 ? weeklyData[weeklyData.length-1].actual.toFixed(1) : '--'} 
                        <span className="text-sm font-normal text-slate-500 ml-1">kg</span>
                        </p>
                    </div>
                    <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
                        <p className="text-slate-400 text-xs font-medium uppercase mb-1">Current Rate</p>
                        <div className={`flex items-center gap-1 text-lg font-bold truncate ${getRateAdherenceColor(currentTrendRate)}`}>
                        {currentTrendRate > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                        {Math.abs(currentTrendRate).toFixed(2)} kg
                        </div>
                    </div>
                </div>

                {advice && (
                    <div className={`px-4 py-3 rounded-xl border flex items-start gap-3 ${advice.color}`}>
                        <Utensils size={18} className="shrink-0 mt-0.5" />
                        <span className="text-sm font-semibold">{advice.text}</span>
                    </div>
                )}

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
                            <p className="text-[10px] font-normal text-slate-500">Tunnel: ±{TARGET_TOLERANCE}kg</p>
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

                    <ChartRenderer data={finalChartData} mode={chartMode} height={chartHeight} width={containerWidth} />
                    
                    <div 
                        className="bg-slate-900 border-x border-b border-slate-800 rounded-b-xl p-2 space-y-2 select-none" 
                        style={{ touchAction: 'none' }} 
                    >
                        <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-center text-slate-400">
                            <div className="flex items-center justify-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Trend</div>
                            <div className="flex items-center justify-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>Tunnel</div>
                            <div className="flex items-center justify-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-500"></div>Readings</div>
                        </div>

                        {showExplanation && (
                            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 animate-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 text-slate-200 font-bold mb-1">
                                    <Info size={12} className="text-blue-500" /> EMA model
                                </div>
                                <p>Exponentialwda Moving Average (EMA) smoothes daily fluctuations to reveal your true weight trend, ignoring water weight spikes.</p>
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

                <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-900/20">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Plus size={18} /> Log Weight</h3>
                    <form onSubmit={handleAddWeight} className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <input 
                                type="text" inputMode="decimal" placeholder="0.0" required 
                                className="flex-1 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 font-bold text-xl" 
                                value={weightInput} 
                                onChange={(e) => setWeightInput(e.target.value.replace(',', '.'))}
                            />
                            <button type="submit" className="bg-white text-blue-600 font-bold px-6 rounded-xl hover:bg-blue-50 transition-colors text-lg">Add</button>
                        </div>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200 pointer-events-none"><Clock size={16} /></div>
                            <input type="date" className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                        </div>
                    </form>
                </div>

                <section>
                    <h2 className="text-sm font-semibold text-slate-300 mb-3 px-1">History</h2>
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
                            const rateColor = !item.hasPrev ? 'text-slate-600' : getRateAdherenceColor(item.delta);
                            return (
                            <div key={item.weekId} className="transition-colors hover:bg-slate-800/50">
                                <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 items-center cursor-pointer" onClick={() => toggleWeek(item.weekId)}>
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
                                {isExpanded && (
                                <div className="bg-slate-950/50 px-4 py-2 border-t border-slate-800">
                                    <div className="flex justify-between text-[10px] text-slate-500 mb-2 uppercase font-bold">
                                        <span>Daily Entries</span>
                                        <span className={item.inTunnel ? "text-emerald-500" : "text-rose-500"}>{item.inTunnel ? 'Trend: On Track' : 'Trend: Deviated'}</span>
                                    </div>
                                    <div className="space-y-2">
                                    {item.entries.map((entry) => (
                                        <div key={entry.id} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2 text-slate-500"><Calendar size={12} /><span>{formatDate(entry.date)}</span></div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium text-slate-300">{entry.weight} kg</span>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }} className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                                        </div>
                                        </div>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </div>
                            );
                        })}
                        </div>
                    </div>
                </section>
            </>
            )}

            {view === 'settings' && (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                    <button onClick={() => handleNavigation('dashboard')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <ChevronRight className="rotate-180 text-slate-400" size={20} />
                    </button>
                    <h2 className="font-bold text-lg text-white">Plan Settings</h2>
                </div>

                <form onSubmit={handleSaveSettings} className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800 space-y-6 flex-1 flex flex-col">
                    <div className="flex bg-slate-800 p-1 rounded-xl mb-2">
                        <button 
                            type="button"
                            onClick={() => setGoalType('gain')}
                            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${goalType === 'gain' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
                        >
                            Gain Weight (+)
                        </button>
                        <button 
                            type="button"
                            onClick={() => setGoalType('lose')}
                            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${goalType === 'lose' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400'}`}
                        >
                            Lose Weight (-)
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Weekly Rate (kg/wk)</label>
                        <input 
                            type="text" inputMode="decimal" required 
                            value={weeklyRate} 
                            onChange={(e) => handleRateChange(e.target.value, 'weekly')}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
                            placeholder="0.2"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Monthly Rate (kg/mo)</label>
                        <input 
                            type="text" inputMode="decimal" required 
                            value={monthlyRate} 
                            onChange={(e) => handleRateChange(e.target.value, 'monthly')}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
                            placeholder="0.87"
                        />
                    </div>

                    <div className="text-xs text-slate-400 flex items-start gap-2 bg-slate-950/30 p-3 rounded-lg border border-slate-800/50">
                        <AlertCircle size={14} className="shrink-0 mt-0.5 text-blue-400" />
                        <p className="leading-relaxed">
                            The chart tunnel is ±{TARGET_TOLERANCE}kg tolerance from your smoothed Trend Weight.
                        </p>
                    </div>

                    <div className="pt-4 mt-auto">
                        <button type="submit" className="w-full bg-white text-slate-900 font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors">
                            Save Plan ({goalType === 'lose' ? '-' : '+'}{weeklyRate || 0}kg/wk)
                        </button>
                    </div>
                </form>
            </div>
            )}
        </div>
      </div>
    </div>
  );
}