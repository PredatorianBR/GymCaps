/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, Dumbbell, Trash2, Plus, RefreshCw, DollarSign, Share2, Loader2, X, 
  Save, ArrowDownUp, PiggyBank, CalendarClock, FileText, Download, Copy, 
  QrCode, CheckCircle, AlertTriangle, Settings, Volume2, VolumeX, 
  AlertOctagon, Edit3, Type, Database, ArrowUp, ArrowDown, LogOut, LogIn, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, googleProvider } from './firebase';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, writeBatch, query, setDoc, getDocFromServer
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

// --- Constants & Defaults ---
const APP_ID = 'gymrats-grupo';
const FINE_PER_MISSING_DAY = 50;
const DAYS_OF_WEEK = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

const DEFAULT_ICONS = {
  leader: '👑',
  met: '🔥',
  unmet: '⚠️',
  check: '✅',
  empty: '⚪',
  extra: '🌟'
};

const DEFAULT_TEMPLATES = {
  weeklyLine: '{MEDALHA} {ICONES_DIAS} *{NOME}* ({QTD_FEITA}/{META}){MULTA_TEXTO}',
  generalLine: '👤 *{NOME}*\n📅 Entrada: {DATA_ENTRADA}\n🎯 Meta: {META} dias | ✅ Feito: {QTD_FEITA} dias ({PCT}%)\n💰 Total Pago: R$ {TOTAL_PAGO}\n----------------'
};

// --- Helper Functions ---
const getWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

const getWeekRange = () => {
  const today = new Date();
  const day = today.getDay(); 
  const diffToMonday = day === 0 ? 6 : day - 1; 
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${format(monday)} a ${format(sunday)}`;
};

const playSound = (type: 'click' | 'toggle' | 'success' | 'delete' = 'click', enabled = true) => {
  if (!enabled) return;
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'toggle') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'success') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.linearRampToValueAtTime(1000, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'delete') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-center">
          <div className="bg-slate-800 p-8 rounded-2xl border border-red-500 max-w-md">
            <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
            <h2 className="text-xl font-bold text-white mb-2">Ops! Algo deu errado.</h2>
            <p className="text-slate-400 text-sm mb-4">
              {this.state.error?.message || "Erro inesperado."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold transition"
            >
              Recarregar App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [usersData, setUsersData] = useState<any[]>([]);
  const [appSettings, setAppSettings] = useState<any>({ icons: DEFAULT_ICONS, templates: DEFAULT_TEMPLATES });
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'frequency' | 'fine'>('name'); 
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); 
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'icons' | 'templates' | 'reports'>('icons');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('gymcapy_sound') !== 'false');
  const [toast, setToast] = useState<{ message: string, type: string } | null>(null);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState(3);
  const [editTotalPaid, setEditTotalPaid] = useState(0);
  const [editPix, setEditPix] = useState('');
  const [editCreatedAt, setEditCreatedAt] = useState('');

  // Modals
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [closingReport, setClosingReport] = useState<any>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  const currentWeek = getWeekNumber(new Date());
  const weekRange = getWeekRange();

  // Validate Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'app_settings', 'global'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Firebase offline. Verifique sua configuração.");
        }
      }
    };
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listener
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setDbError(null);
    const q = query(collection(db, 'gymrats_users'));
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      const users: any[] = [];
      snapshot.docs.forEach(docSnap => {
        users.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsersData(users);
      setLoading(false);
      setDbError(null);
    }, (error: any) => {
      console.error("Erro Firestore Users:", error);
      setLoading(false);
      if (error.message?.includes('Missing or insufficient permissions')) {
        setDbError("Erro de Permissão: O banco de dados está bloqueando o acesso. Verifique as regras do Firestore no console do Firebase.");
      } else {
        setDbError("Erro ao carregar dados: " + error.message);
      }
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'app_settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAppSettings({
          icons: { ...DEFAULT_ICONS, ...data.icons },
          templates: { ...DEFAULT_TEMPLATES, ...data.templates }
        });
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeSettings();
    };
  }, [authReady, user]);

  // --- Handlers ---
  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    playSound('success', soundEnabled);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSort = (key: 'name' | 'frequency' | 'fine') => {
    playSound('click', soundEnabled);
    if (sortBy === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    localStorage.setItem('gymcapy_sound', String(newState));
    if (newState) playSound('success', true);
  };

  const addUser = async () => {
    if (!newName.trim() || !user) return;
    playSound('click', soundEnabled);
    try {
      await addDoc(collection(db, 'gymrats_users'), {
        name: newName,
        target: 3,
        totalPaid: 0,
        pix: '',
        activities: [false, false, false, false, false, false, false],
        history: [],
        createdAt: Date.now(),
        uid: user.uid,
        createdByName: user.displayName,
        lastModifiedBy: user.uid,
        lastModifiedByName: user.displayName,
        lastModifiedAt: Date.now()
      });
      setNewName('');
      showToast('Atleta adicionado!');
    } catch (error) {
      console.error("Add User Error:", error);
    }
  };

  const removeUser = async (id: string) => {
    if (!confirm("Remover este atleta permanentemente?")) return;
    playSound('delete', soundEnabled);
    try {
      await deleteDoc(doc(db, 'gymrats_users', id));
      setEditingId(null);
      showToast('Atleta removido.');
    } catch (error) {
      console.error("Remove User Error:", error);
    }
  };

  const startEditing = (u: any) => {
    playSound('click', soundEnabled);
    setEditingId(u.id);
    setEditName(u.name);
    setEditTarget(u.target || 3);
    setEditTotalPaid(u.totalPaid || 0);
    setEditPix(u.pix || '');
    if (u.createdAt) {
      const d = new Date(u.createdAt);
      setEditCreatedAt(d.toISOString().split('T')[0]);
    } else {
      setEditCreatedAt('');
    }
  };

  const saveEdit = async () => {
    if (!editingId || !user) return;
    playSound('success', soundEnabled);
    try {
      const updateData: any = {
        name: editName,
        target: Math.min(7, Math.max(1, editTarget)),
        totalPaid: Number(editTotalPaid) || 0,
        pix: editPix,
        lastModifiedBy: user.uid,
        lastModifiedByName: user.displayName,
        lastModifiedAt: Date.now()
      };
      if (editCreatedAt) {
        updateData.createdAt = new Date(editCreatedAt).getTime();
      }
      await updateDoc(doc(db, 'gymrats_users', editingId), updateData);
      setEditingId(null);
      showToast('Dados atualizados!');
    } catch (error) {
      console.error("Update User Error:", error);
    }
  };

  const toggleActivity = async (userId: string, dayIndex: number, currentActivities: any[]) => {
    if (!user) return;
    playSound('toggle', soundEnabled);
    const newActivities = [...currentActivities];
    if (newActivities[dayIndex]) {
      newActivities[dayIndex] = false;
    } else {
      const today = new Date();
      const currentDayOfWeek = today.getDay(); 
      const currentAppIndex = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      const diffDays = dayIndex - currentAppIndex;
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + diffDays);
      newActivities[dayIndex] = targetDate.toISOString().split('T')[0];
    }
    try {
      await updateDoc(doc(db, 'gymrats_users', userId), { 
        activities: newActivities,
        lastModifiedBy: user.uid,
        lastModifiedByName: user.displayName,
        lastModifiedAt: Date.now()
      });
    } catch (error) {
      console.error("Toggle Activity Error:", error);
    }
  };

  // --- Stats Calculation ---
  const statsData = useMemo(() => {
    const stats = usersData.map(u => {
      const count = (u.activities || []).filter(Boolean).length;
      const userTarget = u.target || 3;
      const missing = Math.max(0, userTarget - count);
      const fine = missing * FINE_PER_MISSING_DAY;
      
      const history = u.history || [];
      const historyTarget = history.reduce((acc: number, h: any) => acc + (h.target || 0), 0);
      const historyCount = history.reduce((acc: number, h: any) => acc + (h.count || 0), 0);
      
      const totalTarget = historyTarget + userTarget;
      const totalCount = historyCount + count;
      const overallPercentage = totalTarget > 0 ? (totalCount / totalTarget) * 100 : 0;

      return { 
        ...u, 
        count, 
        fine, 
        userTarget, 
        overallPercentage
      };
    });

    const totalPot = stats.reduce((acc, curr) => acc + curr.fine, 0);
    const maxCount = Math.max(...stats.map(s => s.count), 0);
    const winners = maxCount > 0 ? stats.filter(s => s.count === maxCount) : [];
    const prizePerWinner = winners.length > 0 ? totalPot / winners.length : 0;

    const sorted = [...stats].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'name') {
        diff = a.name.localeCompare(b.name);
      } else if (sortBy === 'frequency') {
        diff = a.count - b.count;
      } else if (sortBy === 'fine') {
        const netA = (a.count > 0 && a.count === maxCount ? prizePerWinner : 0) - a.fine;
        const netB = (b.count > 0 && b.count === maxCount ? prizePerWinner : 0) - b.fine;
        diff = netA - netB;
      }
      return sortDirection === 'asc' ? diff : -diff;
    });

    return { sorted, totalPot, maxCount, winners, prizePerWinner };
  }, [usersData, sortBy, sortDirection]);

  // --- Closing Week Logic ---
  const openCloseWeekModal = () => {
    playSound('click', soundEnabled);
    const { sorted, totalPot, winners, prizePerWinner } = statsData;
    
    const processedStats = sorted.map(u => {
      const isLeader = winners.some(w => w.id === u.id);
      const prize = isLeader ? prizePerWinner : 0;
      const net = prize - u.fine;
      return { ...u, net, isLeader };
    });

    setClosingReport({
      totalPot,
      receivers: processedStats.filter(u => u.net > 0).sort((a,b) => b.net - a.net),
      payers: processedStats.filter(u => u.net < 0).sort((a,b) => a.net - b.net)
    });
    setClosingModalOpen(true);
  };

  const confirmCloseWeek = async () => {
    if (!user) return;
    setLoading(true);
    const weekId = `W${currentWeek}-${new Date().getFullYear()}`;
    try {
      const batch = writeBatch(db);
      usersData.forEach(u => {
        const count = (u.activities || []).filter(Boolean).length;
        const userTarget = u.target || 3;
        const missing = Math.max(0, userTarget - count);
        const fine = missing * FINE_PER_MISSING_DAY;

        const newHistory = [...(u.history || []), {
          weekId,
          date: Date.now(),
          target: userTarget,
          count,
          fine
        }];

        batch.update(doc(db, 'gymrats_users', u.id), { 
          activities: [false, false, false, false, false, false, false],
          totalPaid: (u.totalPaid || 0) + fine,
          history: newHistory,
          lastModifiedBy: user.uid,
          lastModifiedByName: user.displayName,
          lastModifiedAt: Date.now()
        });
      });
      await batch.commit();
      setClosingModalOpen(false);
      showToast('Semana fechada com sucesso!');
    } catch (error) {
      console.error("Close Week Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Sharing ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copiado para a área de transferência!');
    });
  };

  const handleShareScoreboard = () => {
    const { sorted, totalPot, winners, maxCount, prizePerWinner } = statsData;
    let text = `*💪 PLACAR SEMANAL GYMCAPYBARAS 💪* (Semana ${currentWeek})\n📅 ${weekRange}\n\n`;

    sorted.sort((a, b) => a.name.localeCompare(b.name)).forEach(u => {
      const isLeader = u.count > 0 && u.count === maxCount;
      let medalha = isLeader ? appSettings.icons.leader : (u.fine > 0 ? '💸' : (u.count >= u.userTarget ? appSettings.icons.met : appSettings.icons.unmet));
      
      let activeCount = 0;
      const iconesDias = (u.activities || []).map((val: any) => {
        if (!val) return appSettings.icons.empty;
        activeCount++;
        return activeCount > u.userTarget ? appSettings.icons.extra : appSettings.icons.check;
      }).join('');

      text += `${medalha} ${iconesDias} *${u.name}* (${u.count}/${u.userTarget})\n`;
    });

    text += `\n💰 *Pote Total:* R$ ${totalPot},00\n`;
    copyToClipboard(text);
  };

  // --- Auth Handlers ---
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
      showToast("Erro ao fazer login", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // --- Render ---
  if (!authReady || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-4 font-sans">
        <div className="max-w-sm w-full bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center space-y-6 shadow-2xl">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center">
              <Dumbbell className="text-orange-500 w-10 h-10" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">GymCaps</h1>
            <p className="text-slate-400 text-sm">Faça login para acessar o placar e registrar suas atividades.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-slate-900 hover:bg-slate-100 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans selection:bg-orange-500 selection:text-white pb-24">
        <div className="max-w-md mx-auto space-y-6">
          
          {dbError && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl text-sm font-medium">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={16} className="text-red-400" />
                <span className="font-bold text-red-400">Erro de Conexão</span>
              </div>
              {dbError}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-amber-600 bg-clip-text text-transparent flex items-center gap-2">
                <Dumbbell className="text-orange-500" /> GymCaps
              </h1>
              <div className="flex gap-2">
                <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white transition">
                  <Settings size={20} />
                </button>
                <button onClick={openCloseWeekModal} className="p-2 text-slate-400 hover:text-red-400 transition">
                  <RefreshCw size={20} />
                </button>
                <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-white transition" title="Sair">
                  <LogOut size={20} />
                </button>
              </div>
            </div>
            <div className="text-slate-500 text-sm font-medium pl-9">
              Semana {currentWeek} ({weekRange})
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <div className="text-slate-400 text-xs flex items-center gap-1 mb-1">
                <DollarSign size={12} /> Pote da Vergonha
              </div>
              <div className="text-2xl font-bold text-red-400">R$ {statsData.totalPot}</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative overflow-hidden">
              <div className="absolute -right-2 -top-2 text-yellow-500/10"><Trophy size={64} /></div>
              <div className="text-slate-400 text-xs flex items-center gap-1 mb-1">
                <Trophy size={12} /> Prêmio (Líderes)
              </div>
              <div className="text-2xl font-bold text-yellow-400">R$ {statsData.prizePerWinner.toFixed(0)}</div>
            </div>
          </div>

          {/* Sort Filters */}
          <div className="flex gap-2 text-xs overflow-x-auto pb-1 no-scrollbar">
            {(['name', 'frequency', 'fine'] as const).map(key => (
              <button 
                key={key}
                onClick={() => toggleSort(key)}
                className={`px-4 py-2 rounded-full border transition whitespace-nowrap flex items-center gap-2 ${
                  sortBy === key ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {key === 'name' ? 'Nome A-Z' : key === 'frequency' ? 'Frequência' : 'Saldo'}
                {sortBy === key && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            ))}
          </div>

          {/* Athlete List */}
          <div className="space-y-4">
            {statsData.sorted.length === 0 && (
              <div className="text-center text-slate-500 py-12 border border-dashed border-slate-700 rounded-3xl">
                Nenhum atleta cadastrado.
              </div>
            )}
            
            <AnimatePresence mode="popLayout">
              {statsData.sorted.map(u => {
                const isEditing = editingId === u.id;
                const isTargetMet = u.count >= u.userTarget;
                const isLeader = u.count > 0 && u.count === statsData.maxCount;
                const netAmount = (isLeader ? statsData.prizePerWinner : 0) - u.fine;

                if (isEditing) {
                  return (
                    <motion.div 
                      key={u.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-5 rounded-3xl bg-slate-800 border border-orange-500 shadow-xl"
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Nome</label>
                            <input 
                              value={editName} onChange={e => setEditName(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-orange-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Meta</label>
                            <input 
                              type="number" min="1" max="7"
                              value={editTarget} onChange={e => setEditTarget(Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-orange-500 outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Chave Pix</label>
                          <input 
                            value={editPix} onChange={e => setEditPix(e.target.value)}
                            placeholder="CPF, Email ou Aleatória"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div className="flex gap-2 justify-between mt-6 pt-4 border-t border-slate-700">
                          <button onClick={() => removeUser(u.id)} className="text-red-400 hover:bg-red-900/20 p-2 rounded-xl transition">
                            <Trash2 size={20} />
                          </button>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)} className="p-3 text-slate-400 hover:text-white">
                              <X size={20} />
                            </button>
                            <button onClick={saveEdit} className="bg-orange-600 hover:bg-orange-500 px-6 py-3 rounded-xl font-bold flex items-center gap-2">
                              <Save size={18} /> Salvar
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div 
                    key={u.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-3xl border transition-all ${
                      isTargetMet ? 'bg-slate-800/40 border-emerald-500/20' : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        {isLeader && <span className="text-xl">{appSettings.icons.leader}</span>}
                        <span 
                          onClick={() => startEditing(u)}
                          className="font-bold text-lg cursor-pointer hover:text-orange-400 transition"
                        >
                          {u.name}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isTargetMet ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {u.count}/{u.userTarget}
                        </span>
                      </div>
                      {Math.abs(netAmount) >= 1 && (
                        <div className={`text-xs font-bold ${netAmount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {netAmount > 0 ? `+ R$${netAmount.toFixed(0)}` : `- R$${Math.abs(netAmount).toFixed(0)}`}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between gap-1">
                      {DAYS_OF_WEEK.map((day, idx) => {
                        const activeVal = u.activities?.[idx];
                        const isActive = !!activeVal;
                        return (
                          <button
                            key={idx}
                            onClick={() => toggleActivity(u.id, idx, u.activities)}
                            className={`flex-1 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${
                              isActive 
                                ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20' 
                                : 'bg-slate-700/30 text-slate-500 hover:bg-slate-700/50'
                            }`}
                          >
                            <span className="text-[10px] font-black">{day}</span>
                            {isActive && <div className="w-1 h-1 bg-white/50 rounded-full mt-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Add Athlete Input */}
          <div className="flex gap-2">
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUser()}
              placeholder="Nome do novo atleta..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-orange-500 transition"
            />
            <button onClick={addUser} className="bg-orange-600 hover:bg-orange-500 p-4 rounded-2xl transition shadow-lg shadow-orange-900/20">
              <Plus color="white" />
            </button>
          </div>

          <div className="text-center text-slate-600 text-[10px] pt-8">
            GymCaps &copy; {new Date().getFullYear()} • Foco Capivara
          </div>
        </div>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-slate-800 rounded-3xl max-w-sm w-full max-h-[80vh] border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Settings size={20} /> Configurações
                  </h3>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex border-b border-slate-700">
                  {(['icons', 'templates', 'reports'] as const).map(tab => (
                    <button 
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${
                        settingsTab === tab ? 'bg-slate-700/50 text-orange-400 border-b-2 border-orange-500' : 'text-slate-500'
                      }`}
                    >
                      {tab === 'icons' ? 'Ícones' : tab === 'templates' ? 'Modelos' : 'Dados'}
                    </button>
                  ))}
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3 text-slate-300">
                      {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                      Efeitos Sonoros
                    </div>
                    <button 
                      onClick={toggleSound}
                      className={`w-12 h-6 rounded-full p-1 transition-colors ${soundEnabled ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {settingsTab === 'reports' && (
                    <div className="space-y-3">
                      <button onClick={handleShareScoreboard} className="w-full py-4 bg-slate-700 hover:bg-slate-600 rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
                        <Share2 size={18} /> Compartilhar Placar
                      </button>
                    </div>
                  )}

                  {settingsTab === 'icons' && (
                    <div className="space-y-4">
                      {Object.entries(appSettings.icons).map(([key, val]: any) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-slate-400 capitalize">{key}</span>
                          <input 
                            value={val}
                            onChange={(e) => setAppSettings({ ...appSettings, icons: { ...appSettings.icons, [key]: e.target.value } })}
                            className="w-12 bg-slate-900 border border-slate-700 rounded-lg p-2 text-center"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Closing Week Modal */}
        <AnimatePresence>
          {closingModalOpen && closingReport && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-slate-800 rounded-3xl max-w-sm w-full border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <RefreshCw size={20} className="text-orange-500" /> Fechar Semana
                  </h3>
                  <button onClick={() => setClosingModalOpen(false)} className="text-slate-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700">
                    <div className="text-xs text-slate-500 mb-1">Pote Total Acumulado</div>
                    <div className="text-3xl font-bold text-emerald-400">R$ {closingReport.totalPot},00</div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-yellow-500 uppercase tracking-widest mb-3">Líderes (Recebem)</h4>
                    <div className="space-y-2">
                      {closingReport.receivers.map((u: any) => (
                        <div key={u.id} className="bg-slate-700/20 p-3 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="font-bold text-white">{u.name}</div>
                            {u.pix && <div className="text-[10px] text-slate-500">Pix: {u.pix}</div>}
                          </div>
                          <div className="text-emerald-400 font-bold">+ R${u.net.toFixed(0)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-red-500 uppercase tracking-widest mb-3">Multas (Pagam)</h4>
                    <div className="space-y-1">
                      {closingReport.payers.map((u: any) => (
                        <div key={u.id} className="flex justify-between text-sm py-1 border-b border-slate-700/50">
                          <span className="text-slate-400">{u.name}</span>
                          <span className="text-red-400 font-bold">R$ {Math.abs(u.net).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-900/50 border-t border-slate-700 space-y-3">
                  <button 
                    onClick={confirmCloseWeek}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition shadow-lg shadow-red-900/20"
                  >
                    Confirmar e Zerar Semana
                  </button>
                  <button 
                    onClick={() => setClosingModalOpen(false)}
                    className="w-full py-4 text-slate-500 hover:text-white font-bold transition"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-slate-800 border border-slate-700 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3"
            >
              <CheckCircle className="text-emerald-500" size={18} />
              <span className="text-sm font-bold text-white">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
