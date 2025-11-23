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
const MEDIAN_WINDOW_SIZE = 7; 
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

interface DailyData {
    date: string;
    raw: number | null;
    trend: number | null;
    target: number;
    inTunnel: boolean;
}

interface WeeklySummary {
  weekId: string;
  weekLabel: string;
  median: number; // Replaced actual/rawAvg with explicit median
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

  // --- ENGINE: CONTINUOUS DAILY CALCULATION ---
  const { dailyDataMap, weeklyData, currentTrendRate } = useMemo(() => {
    if (weights.length === 0 || !settings) {
        return { dailyDataMap: new Map(), weeklyData: [] as WeeklySummary[], currentTrendRate: 0 };
    }

    const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const earliestDate = sortedWeights[0].date;
    const latestDate = new Date().toISOString().split('T')[0];
    
    // 1. Generate Full Daily Timeline (Fill gaps for tunnel logic)
    const allDays = getDaysArray(new Date(earliestDate), new Date(latestDate));
    const weightMap = new Map(weights.map(w => [w.date, w.weight]));
    
    // 2. Calculate Rolling Median Trend (Day by Day)
    const tMap = new Map<string, number>();
    const dMap = new Map<string, DailyData>();
    
    let activeWindow: number[] = []; // Stores weights for median calc
    
    // Populate trend map strictly based on RECORDED entries first
    sortedWeights.forEach((entry, index) => {
         const startIndex = Math.max(0, index - MEDIAN_WINDOW_SIZE + 1);
         const windowSlice = sortedWeights.slice(startIndex, index + 1);
         const windowValues = windowSlice.map(w => w.weight);
         tMap.set(entry.date, calculateMedian(windowValues));
    });

    // 3. Run Tunnel Simulation (Day by Day)
    const dailyRate = (settings.weeklyRate || 0) / 7;
    let currentTarget = tMap.get(earliestDate) || sortedWeights[0].weight;
    let lastKnownTrend = currentTarget;

    allDays.forEach((dayStr) => {
        // Update trend if we have a real entry today
        if (tMap.has(dayStr)) {
            lastKnownTrend = tMap.get(dayStr)!;
        }

        // Tunnel Logic: Check distance
        const dist = Math.abs(lastKnownTrend - currentTarget);
        let inTunnel = true;

        if (dist <= TARGET_TOLERANCE) {
            // Smooth sailing: Target moves by daily rate
            currentTarget += dailyRate;
        } else {
            // Reset: Target snaps to trend + daily rate
            currentTarget = lastKnownTrend + dailyRate;
            inTunnel = false;
        }

        dMap.set(dayStr, {
            date: dayStr,
            raw: weightMap.get(dayStr) || null,
            trend: tMap.get(dayStr) || null, // Sparse trend (only on data days)
            target: currentTarget,
            inTunnel
        });
    });

    // 4. Aggregate Weekly Data (Using Medians)
    const groups: Record<string, WeightEntry[]> = {};
    sortedWeights.forEach(entry => {
      const weekKey = getWeekKey(entry.date);
      if (!groups[weekKey]) groups[weekKey] = [];
      groups[weekKey].push(entry);
    });

    let processedWeeks: WeeklySummary[] = Object.keys(groups).sort().map((weekKey) => {
      const entries = groups[weekKey];
      // MEDIAN LOGIC for Weekly Dot
      const rawMedian = calculateMedian(entries.map(e => e.weight));
      
      const lastEntryDate = entries[entries.length - 1].date;
      const endOfWeekData = dMap.get(lastEntryDate);

      return {
        weekId: weekKey,
        weekLabel: formatDate(lastEntryDate),
        median: rawMedian, // This is now the MEDIAN
        count: entries.length,
        entries: entries,
        target: endOfWeekData ? endOfWeekData.target : 0,
        delta: 0,
        hasPrev: false,
        inTunnel: endOfWeekData ? endOfWeekData.inTunnel : true
      };
    });

    // Calculate Week-over-Week Delta (Median vs Median)
    for (let i = 0; i < processedWeeks.length; i++) {
        if (i > 0) {
            const prev = processedWeeks[i-1];
            processedWeeks[i].delta = processedWeeks[i].median - prev.median;
            processedWeeks[i].hasPrev = true;
        }
    }

    // 5. Current Rate Calculation (Last Trend - Trend 7 Days Ago)
    // This gives "Instant Velocity"
    const lastEntry = sortedWeights[sortedWeights.length - 1];
    const currentTrendVal = tMap.get(lastEntry.date) || 0;
    
    const sevenDaysAgo = new Date(lastEntry.date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sdaString = sevenDaysAgo.toISOString().split('T')[0];
    
    // Find closest trend value to 7 days ago
    let prevTrendVal = currentTrendVal; 
    for(let i = sortedWeights.length - 2; i >= 0; i--) {
        if (sortedWeights[i].date <= sdaString) {
            prevTrendVal = tMap.get(sortedWeights[i].date) || 0;
            break;
        }
    }
    
    const rate = currentTrendVal - prevTrendVal;

    return { dailyDataMap: dMap, weeklyData: processedWeeks, currentTrendRate: rate };
  }, [weights, settings]);


  // --- CHART DATA PREP ---
  const finalChartData = useMemo<Chart