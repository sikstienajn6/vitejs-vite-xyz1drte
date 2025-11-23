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
  Target
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- TYPES ---
interface WeightEntry {
  id: string;
  weight: number;
  date: any; // Firestore Timestamp
  timestamp?: any;
}

interface UserSettings {
  targetWeight?: number;
  goalType?: 'lose' | 'gain' | 'maintain';
  targetRate?: number; // kg per week
  height?: number; // cm
}

// --- UTILS ---
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const calculateEMA = (data: { weight: number; date: Date }[], period: number = 7) => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = data[0].weight;
  return data.map(d => {
    ema = d.weight * k + ema * (1 - k);
    return { ...d, ema };
  });
};

// --- COMPONENTS ---

// 1. Graph Component
const WeightGraph = ({ data, viewMode, onShowInfo }: { data: any[], viewMode: 'daily' | 'weekly', onShowInfo: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 200 });

  useLayoutEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.offsetWidth,
        height: 250
      });
    }
  }, [containerRef.current]);

  if (!data || data.length < 2) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <p>Add more entries to see your trend</p>
      </div>
    );
  }

  // Calculate scales
  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights) - 1;
  const maxW = Math.max(...weights) + 1;
  const range = maxW - minW || 1;
  
  const padding = 20;
  const graphWidth = dimensions.width - padding * 2;
  const graphHeight = dimensions.height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * graphWidth;
    const y = padding + graphHeight - ((d.weight - minW) / range) * graphHeight;
    const emaY = d.ema ? padding + graphHeight - ((d.ema - minW) / range) * graphHeight : y;
    return { x, y, emaY, date: d.date, weight: d.weight, ema: d.ema };
  });

  // SVG Path for Line
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  // SVG Path for EMA (Trend)
  const emaPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.emaY}`).join(' ');
  // Area under EMA
  const areaPath = `${emaPath} L ${points[points.length-1].x},${dimensions.height} L ${points[0].x},${dimensions.height} Z`;

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Weight Trend
        </h3>
        <button 
          onClick={onShowInfo}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
          aria-label="Trend Info"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div ref={containerRef} className="w-full relative select-none">
        {/* Removed onClick from this svg container as requested */}
        <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
          <defs>
            <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = padding + graphHeight - (t * graphHeight);
            return (
              <line 
                key={t} 
                x1={padding} 
                y1={y} 
                x2={dimensions.width - padding} 
                y2={y} 
                stroke="#f1f5f9" 
                strokeWidth="1" 
              />
            );
          })}

          {/* Trend Area */}
          <path d={areaPath} fill="url(#gradientArea)" stroke="none" />

          {/* Raw Data Line */}
          <path d={linePath} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />

          {/* EMA Trend Line */}
          <path d={emaPath} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data Points */}
          {points.map((p, i) => (
            <g key={i} className="group">
              <circle cx={p.x} cy={p.y} r="3" fill="white" stroke="#94a3b8" strokeWidth="2" />
              {/* Tooltip on hover */}
              <foreignObject x={p.x - 20} y={p.y - 40} width="60" height="40" className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-slate-800 text-white text-xs rounded px-1 py-0.5 text-center shadow-lg transform -translate-x-2">
                  {p.weight}
                </div>
              </foreignObject>
            </g>
          ))}
        </svg>

        {/* X Axis Labels */}
        <div className="flex justify-between mt-2 px-4 text-xs text-slate-400">
          <span>{formatDate(points[0]?.date)}</span>
          <span>{formatDate(points[points.length-1]?.date)}</span>
        </div>
      </div>
    </div>
  );
};

// 2. Advice Component (New)
const SmartAdvice = ({ 
  currentWeight, 
  currentTrend, 
  settings 
}: { 
  currentWeight: number, 
  currentTrend: number, // weekly rate of change
  settings: UserSettings 
}) => {
  const goalType = settings.goalType || 'lose';
  const targetRate = settings.targetRate || 0.5; // kg/week absolute
  
  // Calculate deviation: Positive means we are gaining more/losing less than wanted
  // If goal is lose (-0.5), and trend is -0.2. Deviation = -0.2 - (-0.5) = +0.3 (Not losing enough)
  // If goal is lose (-0.5), and trend is -0.8. Deviation = -0.8 - (-0.5) = -0.3 (Losing too fast)
  
  const targetSigned = goalType === 'lose' ? -targetRate : (goalType === 'gain' ? targetRate : 0);
  const deviation = currentTrend - targetSigned;

  // 1kg fat approx 7700 kcal. Daily adjustment = (deviation_kg_per_week * 7700) / 7
  const dailyCalorieAdjustment = Math.round((deviation * 7700) / 7);
  const isLossGoal = goalType === 'lose';

  let advice = "";
  let color = "bg-blue-50 text-blue-700 border-blue-100";
  let Icon = Info;

  // Thresholds for advice (0.1kg per week tolerance)
  if (Math.abs(deviation) < 0.1) {
    advice = "Perfect pace! You're right on track with your goal.";
    color = "bg-green-50 text-green-700 border-green-100";
    Icon = TrendingUp;
  } else if (isLossGoal) {
    if (deviation > 0) {
      // Not losing enough
      advice = `Losing slower than goal. Try reducing daily intake by ~${Math.abs(dailyCalorieAdjustment)} kcal to hit your target rate.`;
      color = "bg-amber-50 text-amber-700 border-amber-100";
      Icon = TrendingDown;
    } else {
      // Losing too fast
      advice = `Losing faster than goal. Consider adding ~${Math.abs(dailyCalorieAdjustment)} kcal/day to preserve muscle mass.`;
      color = "bg-indigo-50 text-indigo-700 border-indigo-100";
      Icon = AlertCircle;
    }
  } else if (goalType === 'gain') {
    if (deviation < 0) {
      // Not gaining enough
      advice = `Gaining slower than goal. Try adding ~${Math.abs(dailyCalorieAdjustment)} kcal/day.`;
      color = "bg-amber-50 text-amber-700 border-amber-100";
    } else {
      // Gaining too fast
      advice = `Gaining faster than goal. Reduce ~${Math.abs(dailyCalorieAdjustment)} kcal/day to minimize fat gain.`;
    }
  } else {
     // Maintain
     if (Math.abs(currentTrend) > 0.1) {
        advice = `Drifting from maintenance. Adjust by ~${Math.abs(dailyCalorieAdjustment)} kcal/day to stabilize.`;
        color = "bg-orange-50 text-orange-700 border-orange-100";
     } else {
       advice = "Maintenance is stable. Keep doing what you're doing!";
       color = "bg-green-50 text-green-700 border-green-100";
     }
  }

  return (
    <div className={`p-4 rounded-xl border ${color} flex items-start gap-3 mt-4`}>
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div>
        <h4 className="font-semibold text-sm mb-1">Adaptive Advice</h4>
        <p className="text-sm opacity-90 leading-relaxed">{advice}</p>
        <div className="mt-2 text-xs opacity-75 font-mono">
          Target: {targetSigned > 0 ? '+' : ''}{targetSigned}kg/wk • Actual: {currentTrend > 0 ? '+' : ''}{currentTrend.toFixed(2)}kg/wk
        </div>
      </div>
    </div>
  );
};


// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({ goalType: 'lose', targetRate: 0.5 });
  const [showGraphInfo, setShowGraphInfo] = useState(false); // Info modal state

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Effect
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/weights`), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate() || new Date()
      })) as WeightEntry[];
      setWeights(data);
    });
    
    // Load Settings
    const loadSettings = async () => {
       // Mock settings or load from firestore logic here
       // For demo, we stick to state default or local storage could be used
    };

    return unsubscribe;
  }, [user]);

  // Derived State: Process Data
  const processedData = useMemo(() => {
    const reversed = [...weights].reverse();
    const withEma = calculateEMA(reversed, 7);
    
    if (viewMode === 'weekly') {
        // Group by week
        // Simple approximation: take last entry of each week or average
        // Here we just filter every 7th for visual clarity or average
        return withEma; // Keeping simple for now, usually you'd aggregate
    }
    return withEma;
  }, [weights, viewMode]);

  const currentWeight = weights[0]?.weight || 0;
  const previousWeight = weights[1]?.weight || currentWeight;
  const weightChange = currentWeight - previousWeight;
  
  // Calculate Trend Rate (Current EMA - EMA 7 days ago)
  const currentTrendRate = useMemo(() => {
    if (processedData.length < 8) return 0;
    const current = processedData[processedData.length - 1].ema;
    const weekAgo = processedData[processedData.length - 8].ema;
    return current - weekAgo; // Change per week
  }, [processedData]);

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newWeight) return;
    
    try {
      await setDoc(doc(collection(db, `users/${user.uid}/weights`)), {
        weight: parseFloat(newWeight),
        date: serverTimestamp(),
        timestamp: Date.now()
      });
      setNewWeight('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if(!user || !confirm('Delete this entry?')) return;
    await deleteDoc(doc(db, `users/${user.uid}/weights`, id));
  };

  const handleLogin = () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => signOut(auth);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Activity className="animate-bounce text-indigo-600" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <TrendingDown className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Weight Tracker</h1>
          <p className="text-slate-500 mb-8">Track your progress with smart trends and adaptive advice.</p>
          <button onClick={handleLogin} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-0">
      <div className="max-w-md mx-auto min-h-screen bg-white shadow-2xl overflow-hidden relative">
        
        {/* HEADER */}
        <header className="bg-indigo-600 text-white p-6 pt-12 pb-8 rounded-b-[2.5rem] shadow-lg relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-indigo-200 text-sm font-medium mb-1">Current Weight</p>
              <h1 className="text-4xl font-bold tracking-tight">
                {currentWeight > 0 ? currentWeight.toFixed(1) : '--'}
                <span className="text-lg font-normal text-indigo-200 ml-1">kg</span>
              </h1>
            </div>
            <button onClick={() => setSettingsOpen(!settingsOpen)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-sm transition">
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex-1 border border-white/10">
              <p className="text-indigo-200 text-xs uppercase font-bold tracking-wider mb-1">Latest Change</p>
              <div className="flex items-center gap-1">
                {weightChange <= 0 ? <TrendingDown className="w-4 h-4 text-emerald-300" /> : <TrendingUp className="w-4 h-4 text-rose-300" />}
                <span className="font-semibold">{Math.abs(weightChange).toFixed(1)} kg</span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex-1 border border-white/10">
              <p className="text-indigo-200 text-xs uppercase font-bold tracking-wider mb-1">7-Day Trend</p>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-indigo-200" />
                <span className="font-semibold">{currentTrendRate > 0 ? '+' : ''}{currentTrendRate.toFixed(2)} kg</span>
              </div>
            </div>
          </div>
        </header>

        {/* SETTINGS PANEL (Collapsible) */}
        {settingsOpen && (
          <div className="bg-slate-100 p-4 border-b border-slate-200 animate-in slide-in-from-top-4">
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" /> Goal Settings
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                {['lose', 'maintain', 'gain'].map(type => (
                  <button 
                    key={type}
                    onClick={() => setSettings({...settings, goalType: type as any})}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg border ${settings.goalType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Target Rate (kg/week)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={settings.targetRate} 
                  onChange={(e) => setSettings({...settings, targetRate: parseFloat(e.target.value)})}
                  className="w-full p-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <button onClick={handleLogout} className="w-full py-2 text-red-500 text-xs font-bold flex items-center justify-center gap-1 mt-2">
                <LogOut className="w-3 h-3" /> Sign Out
              </button>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="p-6 -mt-4 relative z-20">
          
          {/* Controls */}
          <div className="flex justify-between items-center mb-4 px-1">
            <h2 className="font-bold text-slate-800">Overview</h2>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${viewMode === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
              >
                Daily
              </button>
              <button 
                onClick={() => setViewMode('weekly')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${viewMode === 'weekly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
              >
                Week
              </button>
            </div>
          </div>

          {/* Graph */}
          <WeightGraph 
            data={processedData} 
            viewMode={viewMode} 
            onShowInfo={() => setShowGraphInfo(true)} 
          />

          {/* Info Modal for Graph */}
          {showGraphInfo && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  Understanding the Graph
                </h3>
                <div className="space-y-3 text-sm text-slate-600">
                  <p><strong className="text-indigo-600">Solid Line (EMA):</strong> This is the Exponential Moving Average. It smooths out daily water weight fluctuations to show your true trend.</p>
                  <p><strong className="text-slate-400">Dashed Line:</strong> Your raw scale measurements.</p>
                  <p>Focus on the solid line to gauge true progress.</p>
                </div>
                <button 
                  onClick={() => setShowGraphInfo(false)}
                  className="mt-6 w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-200 transition"
                >
                  Got it
                </button>
              </div>
            </div>
          )}

          {/* Smart Advice Section (NEW) */}
          <SmartAdvice 
            currentWeight={currentWeight} 
            currentTrend={currentTrendRate} 
            settings={settings}
          />

          {/* History List */}
          <div className="mt-8">
            <h3 className="font-bold text-slate-800 mb-4 px-1">History</h3>
            <div className="space-y-3">
              {weights.map((entry, idx) => {
                const prev = weights[idx + 1]?.weight;
                const diff = prev ? entry.weight - prev : 0;
                return (
                  <div key={entry.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition group">
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-50 p-2.5 rounded-full text-slate-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">{entry.weight} kg</p>
                        <p className="text-xs text-slate-400">{formatDate(entry.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${diff <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </span>
                      <button onClick={() => handleDelete(entry.id)} className="text-slate-200 hover:text-red-500 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* FLOATING ACTION BUTTON */}
        <div className="fixed bottom-6 right-6 lg:absolute lg:bottom-6 lg:right-6">
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white w-14 h-14 rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* ADD WEIGHT MODAL */}
        {showAddModal && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
            <form onSubmit={handleAddWeight} className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 border border-slate-100 animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Log Weight</h3>
                <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">Close</button>
              </div>
              
              <div className="mb-6">
                <div className="relative">
                  <input 
                    autoFocus
                    type="number" 
                    step="0.1" 
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="0.0"
                    className="w-full text-center text-5xl font-bold text-slate-800 border-none focus:ring-0 placeholder:text-slate-200 p-4"
                  />
                  <span className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 font-medium">kg</span>
                </div>
              </div>

              <button 
                type="submit"
                disabled={!newWeight} 
                className="w-full bg-indigo-600 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl transition"
              >
                Save Entry
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}