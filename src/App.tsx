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
  Target,
  Clock,
  LogOut,
  LogIn,
  AlertCircle
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
const TUNNEL_TOLERANCE = 0.3; 
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
  count: number;
  entries: WeightEntry[];
  target: number;
  targetUpper: number; 
  targetLower: number; 
  delta: number;
  hasPrev: boolean;
  inTunnel: boolean; 
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
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  
  // Rate Inputs
  const [weeklyRate, setWeeklyRate] = useState('0.2'); 
  const [monthlyRate, setMonthlyRate] = useState('0.87'); // 0.2 * 4.345

  // --- AUTH HANDLING ---
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
        setWeeklyRate(wRate.toString());
        setMonthlyRate((wRate * 4.345).toFixed(2));
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
  const weeklyData = useMemo<WeeklySummary[]>(() => {
    if (weights.length === 0 || !settings) return [];

    const groups: Record<string, WeightEntry[]> = {};
    weights.forEach(entry => {
      const weekKey = getWeekKey(entry.date);
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(entry);
    });

    let processedRaw = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      const valSum = entries.reduce((sum, e) => sum + e.weight, 0);
      const avg = valSum / entries.length;
      const earliestDate = entries[entries.length - 1].date; 
      return { weekKey, avg, earliestDate, entries };
    });

    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    const result: WeeklySummary[] = [];

    for (let i = 0; i < processedRaw.length; i++) {
        const current = processedRaw[i];
        const prevData = i > 0 ? result[i-1] : null;
        
        let target = current.avg;

        if (prevData) {
            const distFromPrevTarget = Math.abs(prevData.actual - prevData.target);
            const wasSafe = distFromPrevTarget <= TUNNEL_TOLERANCE;
            if (wasSafe) {
                target = prevData.target + rate;
            } else {
                target = prevData.actual + rate;
            }
        }

        result.push({
            weekId: current.weekKey,
            weekLabel: formatDate(current.earliestDate),
            actual: current.avg,
            count: current.entries.length,
            entries: current.entries,
            target: target,
            targetUpper: target + TUNNEL_TOLERANCE,
            targetLower: target - TUNNEL_TOLERANCE,
            delta: prevData ? current.avg - prevData.actual : 0,
            hasPrev: !!prevData,
            inTunnel: Math.abs(current.avg - target) <= TUNNEL_TOLERANCE
        });
    }

    return result;
  }, [weights, settings]);

  const currentWeeklyDiff = useMemo(() => {
    if (weeklyData.length < 2) return 0;
    const last = weeklyData[weeklyData.length - 1];
    return last.delta;
  }, [weeklyData]);

  // --- DAILY CHART DATA PREP ---
  const dailyChartData = useMemo(() => {
    if (chartMode !== 'daily' || !settings) return [];
    
    const weekMap = new Map(weeklyData.map(w => [w.weekId, w]));
    const rate = parseFloat(settings.weeklyRate.toString()) || 0;
    const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));

    return sortedWeights.map(entry => {
        const wKey = getWeekKey(entry.date);
        const parentWeek = weekMap.get(wKey);
        
        let dailyTarget = entry.weight; // Fallback
        
        if (parentWeek) {
            const dayNum = new Date(entry.date).getDay(); // 0=Sun
            const dayIndex = dayNum === 0 ? 6 : dayNum - 1; // Mon=0
            
            const weekStartTarget = parentWeek.target - rate;
            const dailyProgress = (dayIndex + 1) / 7;
            
            dailyTarget = weekStartTarget + (rate * dailyProgress);
        }

        return {
            label: formatDate(entry.date),
            actual: entry.weight,
            target: dailyTarget,
            targetUpper: dailyTarget + TUNNEL_TOLERANCE,
            targetLower: dailyTarget - TUNNEL_TOLERANCE,
        };
    });
  }, [weights, weeklyData, chartMode, settings]);


  // --- ACTIONS ---
  const handleRateChange = (val: string, type: 'weekly' | 'monthly') => {
    if (val === '') {
        setWeeklyRate('');
        setMonthlyRate('');
        return;
    }
    
    const num = parseFloat(val);
    if (isNaN(num)) return; // Handle invalid input

    if (type === 'weekly') {
        setWeeklyRate(val);
        setMonthlyRate((num * 4.345).toFixed(2));
    } else {
        setMonthlyRate(val);
        setWeeklyRate((num / 4.345).toFixed(2));
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput || !user) return;
    try {
      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'weights', dateInput), {
        weight: parseFloat(weightInput),
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
      // @ts-ignore
      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), {
        weeklyRate: parseFloat(weeklyRate),
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

  const getRateAdherenceColor = (actualDelta: number) => {
    if (!settings) return 'text-slate-500';
    const targetRate = settings.weeklyRate;
    const deviation = Math.abs(actualDelta - targetRate);
    if (deviation <= RATE_TOLERANCE_GREEN) return 'text-emerald-400';
    if (deviation <= RATE_TOLERANCE_ORANGE) return 'text-amber-400';
    return 'text-rose-400'; 
  };

  // --- CHART COMPONENT ---
  const ChartRenderer = ({ data, mode }: { data: any[], mode: 'weekly' | 'daily' }) => {
    if (!data || data.length < 2) return (
      <div className="h-48 flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
        <p className="text-sm">Log more data to see trend</p>
      </div>
    );

    const height = 220;
    const width = 600; 
    const padding = 30;
    const marginBottom = 20; 

    const allValues = data.flatMap(d => [d.actual, d.targetUpper, d.targetLower]);
    const minVal = Math.min(...allValues) - 0.2;
    const maxVal = Math.max(...allValues) + 0.2;
    const range = maxVal - minVal || 1;

    const getX = (i: number) => padding + (i / (data.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => (height - marginBottom) - padding - ((val - minVal) / range) * ((height - marginBottom) - 2 * padding);

    const labelInterval = mode === 'daily' ? Math.ceil(data.length / 6) : 1;

    const actualPath = data.map((d, i) => `${getX(i)},${getY(d.actual)}`).join(' ');
    const targetPath = data.map((d, i) => `${getX(i)},${getY(d.target)}`).join(' ');
    
    const areaPoints = [
        ...data.map((d, i) => `${getX(i)},${getY(d.targetUpper)}`),
        ...data.slice().reverse().map((d, i) => `${getX(data.length - 1 - i)},${getY(d.targetLower)}`)
    ].join(' ');

    return (
      <div className="w-full overflow-hidden rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <line x1={padding} y1={getY(minVal)} x2={width-padding} y2={getY(minVal)} stroke="#1e293b" strokeWidth="1" />
          <line x1={padding} y1={getY(maxVal)} x2={width-padding} y2={getY(maxVal)} stroke="#1e293b" strokeWidth="1" />
          
          <polygon points={areaPoints} fill="rgba(16, 185, 129, 0.08)" stroke="none" />
          <polyline points={targetPath} fill="none" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1" strokeDasharray="4,4" />
          
          <polyline 
            points={actualPath} 
            fill="none" 
            stroke="#3b82f6" 
            strokeWidth={mode === 'daily' ? "1.5" : "3"} 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            opacity={mode === 'daily' ? "0.6" : "1"}
          />

          {data.map((d, i) => {
             const isOffTrack = Math.abs(d.actual - d.target) > TUNNEL_TOLERANCE;
             const r = mode === 'daily' ? (isOffTrack ? 2.5 : 2) : (isOffTrack ? 3 : 4);
             
             return (
                <circle 
                    key={i} 
                    cx={getX(i)} 
                    cy={getY(d.actual)} 
                    r={r} 
                    fill={isOffTrack ? "#ef4444" : "#3b82f6"} 
                    stroke={mode === 'daily' ? 'none' : (isOffTrack ? "#ef4444" : "#0f172a")}
                    strokeWidth="2" 
                />
             );
          })}

          {data.map((d, i) => {
             if (i % labelInterval !== 0 && i !== data.length - 1) return null;
             return (
                <text key={i} x={getX(i)} y={height - 5} fontSize="10" fill="#64748b" textAnchor="middle">
                    {mode === 'weekly' ? d.weekLabel : d.label}
                </text>
             );
          })}
        </svg>
      </div>
    );
  };

  if (loading) return <div className="h-screen w-full flex items-center justify-center text-blue-500 animate-pulse bg-slate-950">Loading...</div>;

  if (!user) return (
    <div className="min-h-screen w-full bg-slate-950 grid place-items-center p-6 overflow-x-hidden">
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
    // Removed pb-20 if view is settings to prevent extra whitespace
    <div className={`min-h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-x-hidden ${view === 'settings' ? '' : 'pb-20'}`}>
      
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-md px-4 py-4 shadow-sm sticky top-0 z-10 flex justify-between items-center max-w-md mx-auto border-b border-slate-800">
        <div className="flex items-center gap-2 text-blue-500 font-bold">RateTracker</div>
        <div className="flex gap-2">
            <button onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <Settings size={20} className="text-slate-400" />
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-red-400">
                <LogOut size={20} />
            </button>
        </div>
      </div>

      {/* Content Container */}
      <div className={`max-w-md mx-auto p-4 ${view === 'settings' ? 'h-[calc(100vh-80px)] flex flex-col' : 'space-y-5'}`}>
        
        {view === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
                <p className="text-slate-400 text-xs font-medium uppercase mb-1">Current Avg</p>
                <p className="text-2xl font-bold text-white truncate">
                  {weeklyData.length > 0 ? weeklyData[weeklyData.length-1].actual.toFixed(1) : '--'} 
                  <span className="text-sm font-normal text-slate-500 ml-1">kg</span>
                </p>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-800">
                <p className="text-slate-400 text-xs font-medium uppercase mb-1">Last Week Rate</p>
                <div className={`flex items-center gap-1 text-lg font-bold truncate ${getRateAdherenceColor(currentWeeklyDiff)}`}>
                  {currentWeeklyDiff > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {Math.abs(currentWeeklyDiff).toFixed(2)} kg
                </div>
              </div>
            </div>

            {settings && weeklyData.length > 0 && (
               <div className="bg-slate-800 text-white px-4 py-3 rounded-xl flex flex-wrap justify-between items-center text-sm shadow-sm gap-2 border border-slate-700">
                  <div className="flex items-center gap-2">
                     <Target size={16} className="text-emerald-400 shrink-0" />
                     <span>Goal: <span className="font-bold">{settings.weeklyRate > 0 ? '+' : ''}{settings.weeklyRate} kg/wk</span></span>
                  </div>
               </div>
            )}

            <section>
              <div className="flex justify-between items-end mb-3 px-1">
                <div>
                    <h2 className="text-sm font-semibold text-slate-300">Trend Adherence</h2>
                    <p className="text-xs font-normal text-slate-500">Tunnel: ±{TUNNEL_TOLERANCE}kg</p>
                </div>
                
                <div className="bg-slate-800 p-1 rounded-lg flex text-xs font-bold">
                    <button onClick={() => setChartMode('weekly')} className={`px-3 py-1 rounded-md transition-all ${chartMode === 'weekly' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Weekly</button>
                    <button onClick={() => setChartMode('daily')} className={`px-3 py-1 rounded-md transition-all ${chartMode === 'daily' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Daily</button>
                </div>
              </div>
              <ChartRenderer data={chartMode === 'weekly' ? weeklyData : dailyChartData} mode={chartMode}/>
            </section>

            <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-900/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Plus size={18} /> Log Weight</h3>
              <form onSubmit={handleAddWeight} className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <input type="number" step="0.01" placeholder="0.0" required className="flex-1 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 font-bold text-xl" value={weightInput} onChange={(e) => setWeightInput(e.target.value)}/>
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
                {/* TABLE HEADER UPDATED: Center alignment for Delta column */}
                <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 bg-slate-950/50 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div>Week</div>
                  <div className="text-right">Avg</div>
                  <div className="text-center">Δ</div> 
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
                          {/* TABLE ROW UPDATED: Center alignment for Delta column */}
                          <div className={`text-center font-bold text-xs ${rateColor}`}>
                            {item.hasPrev ? (item.delta > 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2)) : '-'}
                          </div>
                          <div className="flex justify-end text-slate-500"><ChevronDown size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} /></div>
                        </div>
                        {isExpanded && (
                          <div className="bg-slate-950/50 px-4 py-2 border-t border-slate-800">
                            <div className="flex justify-between text-[10px] text-slate-500 mb-2 uppercase font-bold">
                                <span>Daily Entries</span>
                                <span className={item.inTunnel ? "text-emerald-500" : "text-rose-500"}>{item.inTunnel ? 'Road: On Track' : 'Road: Deviated'}</span>
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

        {/* --- SETTINGS VIEW UPDATED --- */}
        {view === 'settings' && (
           <div className="flex flex-col h-full">
             <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                    <ChevronRight className="rotate-180 text-slate-400" size={20} />
                </button>
                <h2 className="font-bold text-lg text-white">Plan Settings</h2>
             </div>

             {/* Main Settings Card - Updated for full height / no scroll issues */}
             <form onSubmit={handleSaveSettings} className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800 space-y-6 flex-1 flex flex-col">
                
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Weekly Rate (kg/wk)</label>
                    <input 
                        type="number" step="0.01" required 
                        value={weeklyRate} 
                        onChange={(e) => handleRateChange(e.target.value, 'weekly')}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Monthly Rate (kg/mo)</label>
                    <input 
                        type="number" step="0.01" required 
                        value={monthlyRate} 
                        onChange={(e) => handleRateChange(e.target.value, 'monthly')}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500 font-bold"
                    />
                </div>

                <div className="text-xs text-slate-400 flex items-start gap-2 bg-slate-950/30 p-3 rounded-lg border border-slate-800/50">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-blue-400" />
                    <p className="leading-relaxed">
                        Positive for gaining, negative for losing. <br/>
                        The chart tunnel is ±{TUNNEL_TOLERANCE}kg to account for water weight.
                    </p>
                </div>

                <div className="pt-4 mt-auto">
                    <button type="submit" className="w-full bg-white text-slate-900 font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors">
                        Save Plan
                    </button>
                </div>
             </form>
           </div>
        )}
      </div>
    </div>
  );
}