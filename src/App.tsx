import React, { useState, useEffect, useMemo } from 'react';
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
  Maximize2,
  X,
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
const EMA_ALPHA = 0.1; 
const RATE_TOLERANCE_GREEN = 0.1;
const RATE_TOLERANCE_ORANGE = 0.25;

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
  const [chartMode, setChartMode] = useState<'weekly' | 'daily'>('weekly');
  const [filterRange, setFilterRange] = useState<'1M' | '3M' | 'ALL'>('3M');
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  
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

    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    
    let processedWeeks: WeeklySummary[] = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      const valSum = entries.reduce((sum, e) => sum + e.weight, 0);
      const rawAvg = valSum / entries.length;
      
      const trendSum = entries.reduce((sum, e) => sum + (tMap.get(e.date) || e.weight), 0);
      const trendAvg = trendSum / entries.length;

      const earliestDate = entries[entries.length - 1].date; 

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
      };
    });

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
        const weekMap = new Map(weeklyData.map(w => [w.weekId, w]));
        const weightMap = new Map(weights.map(w => [w.date, w.weight]));
        const allDays = getDaysArray(startDate, now);

        return allDays.map(dateStr => {
            const wKey = getWeekKey(dateStr);
            const parentWeek = weekMap.get(wKey);
            
            let dailyTarget = 0;
            let targetFound = false;

            if (parentWeek) {
                const dayNum = new Date(dateStr).getDay(); 
                const dayIndex = dayNum === 0 ? 6 : dayNum - 1; 
                const weekStartTarget = parentWeek.target - rate;
                const dailyProgress = (dayIndex + 1) / 7;
                dailyTarget = weekStartTarget + (rate * dailyProgress);
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

  // --- SHARED CONTROLS COMPONENT ---
  const ChartControls = () => (
    <div className="flex gap-2">
        <div className="bg-slate-800 p-1 rounded-lg flex text-[10px] font-bold">
            <button onClick={() => setFilterRange('1M')} className={`px-2 py-1 rounded-md transition-all ${filterRange === '1M' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>1M</button>
            <button onClick={() => setFilterRange('3M')} className={`px-2 py-1 rounded-md transition-all ${filterRange === '3M' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>3M</button>
            <button onClick={() => setFilterRange('ALL')} className={`px-2 py-1 rounded-md transition-all ${filterRange === 'ALL' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>ALL</button>
        </div>
        <div className="bg-slate-800 p-1 rounded-lg flex text-[10px] font-bold">
            <button onClick={() => setChartMode('weekly')} className={`px-2 py-1 rounded-md transition-all ${chartMode === 'weekly' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Wk</button>
            <button onClick={() => setChartMode('daily')} className={`px-2 py-1 rounded-md transition-all ${chartMode === 'daily' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Day</button>
        </div>
    </div>
  );

  // --- CHART COMPONENT ---
  const ChartRenderer = ({ data, mode, expanded }: { data: ChartPoint[], mode: 'weekly' | 'daily', expanded: boolean }) => {
    if (!data || data.length < 2) return (
      <div className="h-48 flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
        <p className="text-sm">Log more data to see trend</p>
      </div>
    );

    const height = expanded ? 350 : 220;
    const width = 600; 
    const padding = expanded ? 50 : 30;
    const marginBottom = 30; 

    const validValues = data.flatMap(d => {
        const vals = [];
        if (d.actual !== null) vals.push(d.actual);
        if (d.trend !== null) vals.push(d.trend);
        vals.push(d.targetUpper, d.targetLower);
        return vals;
    });
    
    const minVal = Math.min(...validValues) - 0.2;
    const maxVal = Math.max(...validValues) + 0.2;
    const range = maxVal - minVal || 1;

    const getX = (i: number) => padding + (i / (data.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => (height - marginBottom) - padding - ((val - minVal) / range) * ((height - marginBottom) - 2 * padding);

    const areaPoints = [
        ...data.map((d, i) => `${getX(i)},${getY(d.targetUpper)}`),
        ...data.slice().reverse().map((d, i) => `${getX(data.length - 1 - i)},${getY(d.targetLower)}`)
    ].join(' ');

    let trendPath = '';
    let lastValidT = -1;
    data.forEach((d, i) => {
        if (d.trend === null) return;
        const x = getX(i);
        const y = getY(d.trend);
        if (lastValidT === -1) trendPath += `M ${x},${y} `;
        else trendPath += `L ${x},${y} `; 
        lastValidT = i;
    });

    const labelInterval = Math.ceil(data.length / (expanded ? 10 : 6));

    return (
      <div className={`w-full overflow-hidden rounded-xl bg-slate-900 border border-slate-800 shadow-sm ${expanded ? 'h-full' : ''}`}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          <line x1={padding} y1={getY(minVal)} x2={width-padding} y2={getY(minVal)} stroke="#1e293b" strokeWidth="1" />
          <line x1={padding} y1={getY(maxVal)} x2={width-padding} y2={getY(maxVal)} stroke="#1e293b" strokeWidth="1" />
          
          {expanded && (
              <>
                <text x={padding - 10} y={getY(minVal)} fill="#64748b" fontSize="12" textAnchor="end" alignmentBaseline="middle">{minVal.toFixed(1)}</text>
                <text x={padding - 10} y={getY(maxVal)} fill="#64748b" fontSize="12" textAnchor="end" alignmentBaseline="middle">{maxVal.toFixed(1)}</text>
              </>
          )}

          <polygon points={areaPoints} fill="rgba(16, 185, 129, 0.08)" stroke="none" />
          <path d={trendPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => {
             if (d.actual === null) return null;
             
             // FIX: Color dot based on if TREND is out of tunnel, regardless of where dot is
             const isTrendOff = d.trend ? (d.trend > d.targetUpper || d.trend < d.targetLower) : false;
             
             return (
                <g key={i}>
                    <circle 
                        cx={getX(i)} 
                        cy={getY(d.actual)} 
                        r={expanded ? 3 : 2} 
                        fill={isTrendOff ? "#ef4444" : "#94a3b8"} 
                        opacity={isTrendOff ? "0.9" : "0.5"}
                    />
                    {expanded && (
                        <text x={getX(i)} y={getY(d.actual) - 8} fontSize="10" fill="#cbd5e1" textAnchor="middle">
                            {d.actual.toFixed(1)}
                        </text>
                    )}
                </g>
             );
          })}

          {data.map((d, i) => {
             if (i % labelInterval !== 0 && i !== data.length - 1) return null;
             return (
                <text key={i} x={getX(i)} y={height - 5} fontSize="10" fill="#64748b" textAnchor="middle">
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
      
      {/* EXPANDED CHART MODAL */}
      {isChartExpanded && (
          <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in duration-200">
              {/* Header */}
              <div className="flex justify-between items-center p-4 border-b border-slate-800">
                  <h2 className="text-lg font-bold text-white">Detailed Analysis</h2>
                  <button onClick={() => setIsChartExpanded(false)} className="p-2 bg-slate-800 rounded-full text-white hover:bg-slate-700">
                      <X size={20} />
                  </button>
              </div>
              
              {/* Controls inside Modal */}
              <div className="p-4 flex justify-center border-b border-slate-800 bg-slate-900/50">
                  <ChartControls />
              </div>

              {/* Chart Area */}
              <div className="flex-1 min-h-0 p-4 flex flex-col">
                  <ChartRenderer data={finalChartData} mode={chartMode} expanded={true} />
                  
                  {/* Detailed Legend / Explanation */}
                  <div className="mt-6 space-y-4 overflow-y-auto">
                        <div className="grid grid-cols-3 gap-2 text-xs font-bold text-center">
                            <div className="bg-slate-900 p-2 rounded border border-blue-500/30 text-blue-400">
                                🔵 Trend Line
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-emerald-500/30 text-emerald-400">
                                🟩 Goal Tunnel
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-700 text-slate-400">
                                ⚪ Scale Weight
                            </div>
                        </div>

                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                            <div className="flex items-center gap-2 text-slate-200 font-bold mb-2 text-sm">
                                <Info size={16} className="text-blue-500" />
                                How the Model Works
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                We use an <strong>Exponential Moving Average (EMA)</strong> to calculate your true weight. 
                                Daily scale readings fluctuate due to water, salt, and carbs (glycogen).
                                <br/><br/>
                                <span className="text-white">● Grey Dot:</span> Your raw scale reading (includes noise).<br/>
                                <span className="text-red-400">● Red Dot:</span> Indicates your <strong>Trend Line</strong> has drifted outside the safety tunnel at this point.<br/>
                                <span className="text-blue-400">● Blue Line:</span> Your calculated "True Weight". Keep this line inside the green tunnel.
                            </p>
                        </div>
                  </div>
              </div>
          </div>
      )}

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

                <section>
                    <div className="flex justify-between items-end mb-3 px-1 flex-wrap gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-semibold text-slate-300">Trend Adherence</h2>
                                <button onClick={() => setIsChartExpanded(true)} className="text-blue-400 hover:text-blue-300">
                                    <Maximize2 size={14} />
                                </button>
                            </div>
                            <p className="text-xs font-normal text-slate-500">Tunnel: ±{TARGET_TOLERANCE}kg</p>
                        </div>
                        
                        <ChartControls />
                    </div>
                    <ChartRenderer data={finalChartData} mode={chartMode} expanded={false}/>
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