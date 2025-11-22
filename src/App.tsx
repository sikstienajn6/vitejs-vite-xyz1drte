import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  signOut,
  signInAnonymously,
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
  ChevronRight, 
  ChevronDown,
  Clock,
  LogOut,
  LogIn,
  Activity,
  Target,
  Calendar
} from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = {
  // Fixed: Removed 'import.meta' to prevent build errors. 
  // Using the specific key you provided.
  apiKey: "AIzaSyBxmZXjDUpeOUPWFD_Bg-dOP4J4_F3R1rE", 
  authDomain: "weighttracker-b4b79.firebaseapp.com",
  projectId: "weighttracker-b4b79",
  storageBucket: "weighttracker-b4b79.firebasestorage.app",
  messagingSenderId: "895893600072",
  appId: "1:895893600072:web:e329aba69602d46fa8e57d",
  measurementId: "G-N2CH917QQB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

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
  delta: number;
  hasPrev: boolean;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState('dashboard'); 
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [weeklyRate, setWeeklyRate] = useState('0.2'); 

  // --- AUTH AND INITIAL LOAD ---
  useEffect(() => {
    const storedAnonId = localStorage.getItem('anonId');

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUserId(currentUser.uid);
        setIsAuthReady(true);
      } else if (storedAnonId) {
        signInAnonymously(auth).then(anonUser => {
          setUserId(anonUser.user.uid);
          setIsAuthReady(true);
        }).catch(() => {
          setIsAuthReady(true); 
        });
      } else {
        setIsAuthReady(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  // --- GOOGLE SIGN IN HANDLERS ---
  const handleGoogleSignIn = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, provider);
      
      const anonUser = auth.currentUser;
      let currentAnonId = anonUser?.isAnonymous ? anonUser.uid : null;
      
      if (currentAnonId && currentAnonId !== result.user.uid) {
        // Linking logic handled by Firebase if providers match
      }
      
      setUserId(result.user.uid);
      localStorage.setItem('anonId', result.user.uid); 
      setView('dashboard');
      
    } catch (error: any) {
      console.error("Login failed:", error);
      alert("Login failed. Check console for details.");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUserId(null);
    setWeights([]);
    setSettings(null);
    localStorage.removeItem('anonId');
    setView('login');
  };


  // --- DATA FETCHING ---
  useEffect(() => {
    if (!isAuthReady || !userId) return;

    const getCollectionPath = (uid: string) => collection(db, 'users', uid, 'weights');
    const qWeights = query(getCollectionPath(userId), orderBy('date', 'desc'));

    const unsubWeights = onSnapshot(qWeights, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WeightEntry[];
      setWeights(data);
    }, (err) => console.error("Weight fetch error:", err));

    // @ts-ignore
    const docRef = doc(db, 'users', userId, 'settings', 'config');
    const unsubSettings = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const s = snapshot.data() as SettingsData;
        setSettings(s);
        setWeeklyRate(s.weeklyRate ? s.weeklyRate.toString() : '0.0');
      } else {
        setSettings(null);
        setView('settings');
      }
    }, (err) => console.error("Settings fetch error:", err));

    return () => {
      unsubWeights();
      unsubSettings();
    };
  }, [userId, isAuthReady]); 

  // --- LOGIC ---
  const weeklyData = useMemo<WeeklySummary[]>(() => {
    if (weights.length === 0 || !settings) return [];

    const groups: Record<string, WeightEntry[]> = {};
    weights.forEach(entry => {
      const weekKey = getWeekKey(entry.date);
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(entry);
    });

    let processed = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      const valSum = entries.reduce((sum, e) => sum + e.weight, 0);
      const avg = valSum / entries.length;
      const earliestDate = entries[entries.length - 1].date; 

      return {
        weekId: weekKey,
        weekLabel: formatDate(earliestDate),
        actual: avg,
        count: entries.length,
        entries: entries,
        target: 0, 
        delta: 0,
        hasPrev: false
      };
    });

    if (processed.length > 0) {
      const rate = parseFloat(settings.weeklyRate.toString()) || 0;
      
      for (let i = 0; i < processed.length; i++) {
        if (i === 0) {
            processed[i].target = processed[i].actual;
            processed[i].delta = 0;
            processed[i].hasPrev = false;
        } else {
            const prevActual = processed[i-1].actual;
            processed[i].target = prevActual + rate;
            processed[i].delta = processed[i].actual - prevActual;
            processed[i].hasPrev = true;
        }
      }
    }

    return processed;
  }, [weights, settings]);

  const currentWeeklyDiff = useMemo(() => {
    if (weeklyData.length < 2) return 0;
    const last = weeklyData[weeklyData.length - 1];
    const prev = weeklyData[weeklyData.length - 2];
    return last.actual - prev.actual;
  }, [weeklyData]);

  // --- HANDLERS ---
  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput || !userId) return;
    
    try {
      // @ts-ignore
      await setDoc(doc(db, 'users', userId, 'weights', dateInput), {
        weight: parseFloat(weightInput),
        date: dateInput,
        createdAt: serverTimestamp()
      });
      setWeightInput('');
    } catch (err) {
      console.error("Error adding weight:", err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      // @ts-ignore
      await setDoc(doc(db, 'users', userId, 'settings', 'config'), {
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
    if (!userId) return;
    try {
      // @ts-ignore
      await deleteDoc(doc(db, 'users', userId, 'weights', id));
    } catch (err) {
      console.error("Delete error", err);
    }
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks(prev => 
        prev.includes(weekId) ? prev.filter(id => id !== weekId) : [...prev, weekId]
    );
  };
  
  // --- COMPONENTS ---
  
  const getDeltaColor = (delta: number) => {
    const rate = settings ? parseFloat(settings.weeklyRate.toString()) : 0;
    const isBulking = rate >= 0;
    
    if (delta === 0) return 'text-slate-500';
    
    if (isBulking) {
        return delta > 0 ? 'text-emerald-400' : 'text-rose-400';
    } else {
        return delta < 0 ? 'text-emerald-400' : 'text-rose-400';
    }
  };

  const SimpleChart = ({ data }: { data: WeeklySummary[] }) => {
    if (!data || data.length < 2) return (
      <div className="h-48 flex items-center justify-center text-slate-400 bg-slate-900 rounded-xl border border-dashed border-slate-700">
        <p className="text-sm">Log data for 2+ weeks to see trend</p>
      </div>
    );

    const height = 200;
    const width = 600; 
    const padding = 30;
    const marginBottom = 20; 

    const allValues = data.flatMap(d => [d.actual, d.target]);
    const minVal = Math.min(...allValues) - 0.5;
    const maxVal = Math.max(...allValues) + 0.5;
    const range = maxVal - minVal || 1;

    const getX = (i: number) => padding + (i / (data.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => (height - marginBottom) - padding - ((val - minVal) / range) * ((height - marginBottom) - 2 * padding);

    const actualPath = data.map((d, i) => `${getX(i)},${getY(d.actual)}`).join(' ');
    const targetPath = data.map((d, i) => `${getX(i)},${getY(d.target)}`).join(' ');

    return (
      <div className="w-full overflow-hidden rounded-xl bg-slate-900 border border-slate-700 shadow-xl">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <line x1={padding} y1={getY(minVal)} x2={width-padding} y2={getY(minVal)} stroke="#475569" strokeWidth="1" />
          <line x1={padding} y1={getY(maxVal)} x2={width-padding} y2={getY(maxVal)} stroke="#475569" strokeWidth="1" />
          
          {minVal < 0 && maxVal > 0 && (
             <line x1={padding} y1={getY(0)} x2={width-padding} y2={getY(0)} stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" />
          )}

          <polyline points={targetPath} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5,5" />
          <polyline points={actualPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => (
            <circle key={i} cx={getX(i)} cy={getY(d.actual)} r="4" fill="#020617" stroke="#3b82f6" strokeWidth="2" />
          ))}

          <text x={padding} y={height - 5} fontSize="14" fill="#64748b" textAnchor="start">
            {data[0]?.weekLabel}
          </text>
          <text x={width - padding} y={height - 5} fontSize="14" fill="#64748b" textAnchor="end">
            {data[data.length - 1]?.weekLabel}
          </text>
        </svg>
      </div>
    );
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-blue-400 animate-pulse bg-slate-950">Loading...</div>;

  // --- LOGIN SCREEN ---
  if (!userId) return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 shadow-2xl p-8 rounded-2xl w-full max-w-sm border border-slate-800 flex flex-col items-center text-center">
        <Activity size={48} className="text-blue-500 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">RateTracker</h1>
        <p className="text-sm text-slate-400 mb-8">Track your progress securely.</p>
        
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-900/50"
        >
          <LogIn size={20} /> Sign in with Google
        </button>

        <p className="text-xs text-slate-500 mt-6">Your data is stored securely in the cloud.</p>
      </div>
    </div>
  );
    
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-20">
      
      {/* Header */}
      <div className="bg-slate-900 px-4 py-4 shadow-xl sticky top-0 z-10 flex justify-end items-center border-b border-slate-800">
        <button onClick={() => setView('settings')} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <Settings size={20} className="text-slate-400" />
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto p-4 space-y-5">
        
        {view === 'dashboard' && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-4 rounded-2xl shadow-lg border border-slate-800">
                <p className="text-slate-500 text-xs font-medium uppercase mb-1">Current Avg</p>
                <p className="text-2xl font-bold text-white truncate">
                  {weeklyData.length > 0 ? weeklyData[weeklyData.length-1].actual.toFixed(1) : '--'} 
                  <span className="text-sm font-normal text-slate-400 ml-1">kg</span>
                </p>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl shadow-lg border border-slate-800">
                <p className="text-slate-500 text-xs font-medium uppercase mb-1">Last Week</p>
                <div className={`flex items-center gap-1 text-lg font-bold truncate ${getDeltaColor(currentWeeklyDiff)}`}>
                  {currentWeeklyDiff > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {Math.abs(currentWeeklyDiff).toFixed(2)} kg
                </div>
              </div>
            </div>

            {settings && weeklyData.length > 0 && (
               <div className="bg-slate-800 text-white px-4 py-3 rounded-xl flex flex-wrap justify-between items-center text-sm shadow-inner gap-2">
                    <div className="flex items-center gap-2 text-slate-300">
                       <Target size={16} className="text-blue-400 shrink-0" />
                       <span>Rate: <span className="font-bold">{settings.weeklyRate > 0 ? '+' : ''}{settings.weeklyRate.toFixed(2)} kg/wk</span></span>
                    </div>
                    <button onClick={handleSignOut} className="text-xs text-red-400 hover:text-red-300 transition-colors p-1 rounded-md flex items-center gap-1">
                      <LogOut size={14} /> Sign Out
                    </button>
                 </div>
            )}

            {/* Chart */}
            <section>
              <h2 className="text-sm font-semibold text-white mb-2 ml-1">Trend Adherence</h2>
              <SimpleChart data={weeklyData} />
            </section>

            {/* Quick Add */}
            <div className="bg-blue-800 rounded-2xl p-4 text-white shadow-xl shadow-blue-900/50">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                <Plus size={18} /> Log Weight
              </h3>
              <form onSubmit={handleAddWeight} className="flex flex-col gap-3">
                <div className="flex gap-2">
                    <input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.0"
                    className="flex-1 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50 font-bold text-xl"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    required
                    />
                    <button 
                    type="submit"
                    className="bg-white text-blue-600 font-bold px-6 rounded-xl hover:bg-blue-50 transition-colors text-lg"
                    >
                    Add
                    </button>
                </div>
                <div className="relative">
                     <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-200 pointer-events-none">
                        <Clock size={16} />
                     </div>
                     <input 
                        type="date" 
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
                        value={dateInput}
                        onChange={(e) => setDateInput(e.target.value)}
                        aria-label="Select date"
                    />
                </div>
              </form>
            </div>

            {/* Weekly Table */}
            <section>
              <h2 className="text-sm font-semibold text-white mb-3 px-1">Weekly Breakdown</h2>
              
              <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 bg-slate-800/50 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div>Week Start</div>
                  <div className="text-right">Avg</div>
                  <div className="text-right">Diff</div>
                  <div className="w-5"></div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-slate-800">
                  {weeklyData.slice().reverse().map((item) => {
                    const isExpanded = expandedWeeks.includes(item.weekId);
                    
                    return (
                      <div key={item.weekId} className="transition-colors hover:bg-slate-800/50">
                        {/* Main Row */}
                        <div 
                          className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 px-4 py-3 items-center cursor-pointer"
                          onClick={() => toggleWeek(item.weekId)}
                        >
                          <div className="flex flex-col">
                             <span className="text-sm font-semibold text-white">{item.weekLabel}</span>
                             <span className="text-[10px] text-slate-400">{item.count} entries</span>
                          </div>
                          
                          <div className="text-right font-bold text-white">
                            {item.actual.toFixed(1)}
                          </div>
                          
                          <div className={`text-right font-bold text-xs ${getDeltaColor(item.delta)}`}>
                            {item.hasPrev ? (item.delta > 0 ? `+${item.delta.toFixed(1)}` : item.delta.toFixed(1)) : '-'}
                          </div>

                          <div className="flex justify-end text-slate-500">
                             <ChevronDown size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="bg-slate-800/50 px-4 py-2 border-t border-slate-700">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Daily Entries</p>
                            <div className="space-y-2">
                              {item.entries.map((entry) => (
                                <div key={entry.id} className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2 text-slate-400">
                                    <Clock size={12} />
                                    <span>{formatDate(entry.date)}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                     <span className="font-medium text-white">{entry.weight.toFixed(2)} kg</span>
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                                        className="text-slate-500 hover:text-red-500"
                                     >
                                        <Trash2 size={12} />
                                     </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {weeklyData.length === 0 && (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No data recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {view === 'settings' && (
           <div className="space-y-4 w-full">
            <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                    <ChevronRight className="rotate-180 text-slate-400" size={20} />
                </button>
                <h2 className="font-bold text-lg text-white">Plan Settings</h2>
             </div>

             <form onSubmit={handleSaveSettings} className="bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-800 space-y-5 w-full block">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Desired Weekly Rate (kg/week)</label>
                    <div className="relative">
                        <input 
                            type="number" step="0.01" required 
                            value={weeklyRate} onChange={e => setWeeklyRate(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500"
                            placeholder="e.g. 0.5 or -0.5"
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Use positive (0.5) for bulk, negative (-0.5) for cut.</p>
                </div>

                <div className="pt-4">
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