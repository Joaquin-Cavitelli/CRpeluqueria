import React, { useState, useEffect, useMemo, Component, memo, useCallback, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  onSnapshot, 
  increment,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  FirebaseUser,
  handleFirestoreError,
  OperationType,
  limit,
  getDocs,
  collectionGroup,
  arrayUnion
} from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, 
  LogOut, 
  Plus, 
  Minus,
  Star, 
  Award, 
  User as UserIcon, 
  Sparkles, 
  History, 
  LayoutDashboard, 
  Users, 
  Settings,
  ChevronRight,
  Search,
  Filter,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  TrendingUp,
  Package,
  Clock,
  QrCode,
  Camera,
  CameraOff,
  MessageCircle,
  Bell,
  BarChart3,
  ArrowLeft
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { cn } from './lib/utils';

// --- Types ---
type UserRole = 'admin' | 'client';
type UserLevel = 'Bronce' | 'Plata' | 'Oro';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  turns: number;
  totalTurns: number;
  role: UserRole;
  createdAt?: any;
  lastActivity?: any;
}

// --- Utils ---
const getLevel = (turns: number, allTurns: number[]): { name: UserLevel; color: string; icon: React.ReactNode } => {
  const icon = <Award className="w-4 h-4" />;
  if (allTurns.length === 0) return { name: 'Bronce', color: 'text-orange-500 border-orange-200 bg-white', icon };
  
  const sortedTurns = [...allTurns].sort((a, b) => b - a);
  const total = sortedTurns.length;
  
  // Gold: Top 20%
  const goldLimit = Math.ceil(total * 0.2);
  // Silver: Next 60% (Top 80% total) -> Wait, user said "el 60% plata y el otro 40% bronce"
  // 20% + 60% + 40% = 120%. 
  // Let's assume: 20% Gold, 40% Silver (Top 60%), 40% Bronze (Bottom 40%)
  const silverLimit = Math.ceil(total * 0.6);
  
  const goldThreshold = sortedTurns[goldLimit - 1] || 0;
  const silverThreshold = sortedTurns[silverLimit - 1] || 0;

  if (turns >= goldThreshold && turns > 0) return { name: 'Oro', color: 'text-yellow-600 border-yellow-200 bg-white', icon };
  if (turns >= silverThreshold && turns > 0) return { name: 'Plata', color: 'text-slate-500 border-slate-200 bg-white', icon };
  return { name: 'Bronce', color: 'text-orange-500 border-orange-200 bg-white', icon };
};

const sendWhatsApp = (phone: string, message: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
};

interface Reward {
  id: string;
  name: string;
  requiredTurns: number;
  type: 'descuento' | 'servicio' | 'producto';
  description: string;
}

interface Transaction {
  id: string;
  type: 'sum' | 'subtract' | 'redeem';
  amount: number;
  description: string;
  rewardId?: string;
  rewardName?: string;
  createdAt: any;
  userId?: string;
  userName?: string;
  realized?: boolean;
}

// --- Error Boundary Component ---
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function QRScanner({ onScan, onClose }: { onScan: (uid: string) => void; onClose: () => void }) {
  const [isStarting, setIsStarting] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(() => {
    const stored = localStorage.getItem('camera_permission_accepted');
    return stored === 'true' ? true : null;
  });
  const [showPrompt, setShowPrompt] = useState(() => {
    return localStorage.getItem('camera_permission_accepted') !== 'true';
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanner = async () => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("reader");
    }
    
    setIsStarting(true);
    setShowPrompt(false);

    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          if (scannerRef.current?.isScanning) {
            scannerRef.current.stop().then(() => {
              onScan(decodedText);
            });
          }
        },
        undefined
      );
      setIsStarting(false);
      setHasPermission(true);
      localStorage.setItem('camera_permission_accepted', 'true');
    } catch (err) {
      console.error("Error starting scanner:", err);
      setIsStarting(false);
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.message.includes('Permission denied'))) {
        setHasPermission(false);
      }
    }
  };

  useEffect(() => {
    if (localStorage.getItem('camera_permission_accepted') === 'true') {
      startScanner();
    }

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear();
        });
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="relative aspect-square w-full max-w-[300px] mx-auto overflow-hidden rounded-2xl border-4 border-neutral-100 bg-neutral-900 shadow-inner">
        <div id="reader" className="w-full h-full" />
        
        {showPrompt && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 p-6 text-center z-30">
            <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mb-4">
              <Camera className="w-8 h-8 text-brand-400" />
            </div>
            <p className="text-white font-bold mb-2">Permiso de Cámara</p>
            <p className="text-neutral-400 text-xs mb-6">Para escanear códigos QR, necesitamos acceso a tu cámara.</p>
            <button 
              onClick={startScanner}
              className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 transition-all active:scale-95 shadow-lg shadow-brand-600/20"
            >
              Habilitar Cámara
            </button>
          </div>
        )}

        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-white gap-3 z-20">
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Camera className="w-8 h-8 opacity-50" />
            </motion.div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Iniciando Cámara...</p>
          </div>
        )}

        {hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 p-6 text-center z-30">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-4">
              <CameraOff className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-white font-bold mb-2">Acceso denegado</p>
            <p className="text-neutral-400 text-xs mb-4">Por favor, habilitá el permiso de cámara en tu navegador para escanear códigos QR.</p>
            <button 
              onClick={() => {
                localStorage.removeItem('camera_permission_accepted');
                setHasPermission(null);
                setShowPrompt(true);
              }}
              className="px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20 transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isStarting && !showPrompt && hasPermission !== false && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute inset-0 border-[40px] border-black/40" />
            <motion.div 
              animate={{ 
                top: ["20%", "80%", "20%"],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className="absolute left-[15%] right-[15%] h-0.5 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] z-20"
            />
          </div>
        )}
      </div>

      <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900">Escanea el código</p>
            <p className="text-xs text-neutral-500">Apunta la cámara al código QR del cliente para cargar su perfil.</p>
          </div>
        </div>
      </div>

      <button 
        onClick={onClose}
        className="w-full py-3 text-neutral-500 text-sm font-medium hover:text-neutral-800 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}

interface NotificationToastProps {
  key?: React.Key;
  message: string;
  type: 'success' | 'info';
  onClose: () => void;
}

function NotificationToast({ message, type, onClose }: NotificationToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className={cn(
        "px-6 py-4 rounded-md shadow-2xl flex items-center gap-3 min-w-[300px] pointer-events-auto",
        type === 'success' ? "bg-emerald-900 text-white" : "bg-neutral-900 text-white"
      )}
    >
      {type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Bell className="w-5 h-5 text-indigo-400" />}
      <p className="text-sm font-bold">{message}</p>
    </motion.div>
  );
}
// --- Components ---

function SortButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
        active 
          ? "bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-neutral-200" 
          : "bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200"
      )}
    >
      {label}
    </button>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-md" 
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden mx-auto border border-neutral-100"
        >
          <div className="p-4 border-b border-neutral-50 flex justify-between items-center">
            <h3 className="font-bold text-lg tracking-tight text-neutral-900">{title}</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-50 rounded-full transition-colors">
              <X className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
          <div className="p-5 max-h-[80vh] overflow-y-auto no-scrollbar">
            {children}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// --- Admin Views ---

const AdminDashboard = memo(function AdminDashboard({ 
  users, 
  rewards, 
  transactions,
  onMarkRealized 
}: { 
  users: UserProfile[]; 
  rewards: Reward[]; 
  transactions: Transaction[];
  onMarkRealized: (t: Transaction) => void;
}) {
  const stats = useMemo(() => {
    const clients = users.filter(u => u.role === 'client');
    const totalTurns = clients.reduce((acc, u) => acc + u.turns, 0);
    const redemptions = transactions.filter(t => t.type === 'redeem');
    
    const rewardUsage = redemptions.reduce((acc, t) => {
      const reward = rewards.find(r => r.id === t.rewardId);
      if (reward) acc[reward.name] = (acc[reward.name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedRewards = Object.entries(rewardUsage).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      totalClients: clients.length,
      totalTurns,
      totalRedemptions: redemptions.length,
      topRewards: sortedRewards
    };
  }, [users, rewards, transactions]);

  const enrichedTransactions = useMemo(() => {
    return transactions.map(t => {
      if (t.userName) return t;
      const user = users.find(u => u.uid === t.userId);
      return { ...t, userName: user?.displayName || 'Cliente' };
    });
  }, [transactions, users]);

  const recentRedemptions = useMemo(() => {
    return enrichedTransactions
      .filter(t => t.type === 'redeem' && !t.realized)
      .sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis())
      .slice(0, 10);
  }, [enrichedTransactions]);

  if (users.length === 0) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm space-y-2">
          <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 tracking-tighter">{stats.totalClients}</p>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Clientes</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm space-y-2">
          <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <p className="text-3xl font-extrabold text-neutral-900 tracking-tighter">{stats.totalTurns}</p>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Turnos</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-neutral-50 flex items-center justify-between">
          <h3 className="font-bold text-neutral-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-neutral-400" />
            Canjes Pendientes
          </h3>
          <span className="px-2 py-1 bg-brand-50 text-brand-600 text-[10px] font-bold rounded-full">
            {recentRedemptions.length} TOTAL
          </span>
        </div>
        <div className="divide-y divide-neutral-50">
          {recentRedemptions.length > 0 ? recentRedemptions.map(t => (
            <div key={t.id} className="p-6 flex items-center justify-between hover:bg-neutral-50 transition-colors">
              <div className="space-y-1">
                <p className="font-bold text-neutral-900">{t.userName}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-600 font-bold">{t.rewardName}</span>
                  <span className="text-[10px] text-neutral-400">•</span>
                  <span className="text-[10px] text-neutral-400 font-medium">{t.createdAt?.toDate().toLocaleDateString()}</span>
                </div>
              </div>
              <button 
                onClick={() => onMarkRealized(t)}
                className="px-4 py-2 bg-brand-900 text-white text-xs font-bold rounded-xl shadow-lg hover:bg-brand-950 transition-all active:scale-95"
              >
                Entregar
              </button>
            </div>
          )) : (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 text-neutral-100 mx-auto mb-3" />
              <p className="text-sm text-neutral-400 font-medium">No hay canjes pendientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const AdminUsers = memo(function AdminUsers({ users, onSelectUser, onScan, allTurns }: { users: UserProfile[]; onSelectUser: (u: UserProfile) => void; onScan: () => void; allTurns: number[] }) {
  const [search, setSearch] = useState('');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'total' | 'current' | 'recent'>(() => {
    return (localStorage.getItem('admin_users_sort') as any) || 'name';
  });

  useEffect(() => {
    localStorage.setItem('admin_users_sort', sortBy);
  }, [sortBy]);

  const filtered = useMemo(() => {
    const result = users.filter(u => u.role === 'client' && (u.displayName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));
    
    return result.sort((a, b) => {
      if (sortBy === 'name') return a.displayName.localeCompare(b.displayName);
      if (sortBy === 'total') return (b.totalTurns ?? b.turns ?? 0) - (a.totalTurns ?? a.turns ?? 0);
      if (sortBy === 'current') return b.turns - a.turns;
      if (sortBy === 'recent') {
        const timeA = a.lastActivity?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const timeB = b.lastActivity?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [users, search, sortBy]);

  const sortOptions = [
    { id: 'name', label: 'Nombre' },
    { id: 'total', label: 'Puntos Totales' },
    { id: 'current', label: 'Puntos Actuales' },
    { id: 'recent', label: 'Más Reciente' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-300" />
          <input 
            type="text" 
            placeholder="Buscar cliente..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-neutral-100 rounded-2xl shadow-sm focus:ring-4 focus:ring-brand-500/5 outline-none transition-all font-medium placeholder:text-neutral-300"
          />
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsSortOpen(!isSortOpen)}
            className={cn(
              "h-full px-4 bg-white border border-neutral-100 rounded-2xl shadow-sm flex items-center justify-center transition-all active:scale-95",
              isSortOpen ? "ring-2 ring-neutral-900 border-neutral-900" : "hover:border-neutral-200"
            )}
          >
            <Filter className={cn("w-5 h-5 transition-colors", isSortOpen ? "text-neutral-900" : "text-neutral-400")} />
          </button>

          <AnimatePresence>
            {isSortOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsSortOpen(false)}
                  className="fixed inset-0 z-40"
                />
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-white border border-neutral-100 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-2">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-3 py-2">Ordenar por</p>
                    {sortOptions.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSortBy(opt.id as any);
                          setIsSortOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-between",
                          sortBy === opt.id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
                        )}
                      >
                        {opt.label}
                        {sortBy === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-brand-300" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden divide-y divide-neutral-50">
        {filtered.map(u => {
          const level = getLevel(u.totalTurns ?? u.turns ?? 0, allTurns);
          return (
            <button 
              key={u.uid} 
              onClick={() => onSelectUser(u)}
              className="w-full p-6 flex items-center justify-between hover:bg-neutral-50 transition-all group active:bg-neutral-100"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                  <UserIcon className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-neutral-900 group-hover:text-brand-600 transition-colors">{u.displayName}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", level.color)}>
                      {level.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-medium">{u.email}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-extrabold text-neutral-900 tracking-tight">
                    {sortBy === 'total' ? (u.totalTurns ?? u.turns ?? 0) : u.turns} 
                    <span className="text-[10px] text-neutral-400 font-bold ml-1 uppercase tracking-tighter">
                      {sortBy === 'total' ? 'Total' : 'Pts'}
                    </span>
                  </p>
                  {sortBy === 'recent' && (
                    <p className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest mt-0.5">
                      {u.lastActivity?.toDate ? u.lastActivity.toDate().toLocaleDateString() : 
                       u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-200 group-hover:text-neutral-400 transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

function AdminRewards({ rewards, onEdit, onDelete, onAdd }: { rewards: Reward[]; onEdit: (r: Reward) => void; onDelete: (id: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-4">
      <button 
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 py-4 bg-neutral-900 text-white rounded-md font-bold shadow-lg shadow-neutral-200 active:scale-95 transition-all"
      >
        <Plus className="w-5 h-5" />
        Nueva Recompensa
      </button>

      <div className="space-y-3">
        {[...rewards].sort((a, b) => a.requiredTurns - b.requiredTurns).map(r => (
          <div key={r.id} className="bg-white p-5 rounded-md border border-neutral-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neutral-50 rounded-md flex items-center justify-center text-neutral-400">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-neutral-900">{r.name}</p>
                <p className="text-xs text-neutral-500">{r.requiredTurns} turnos • {r.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onEdit(r)} className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                <Edit2 className="w-5 h-5" />
              </button>
              <button onClick={() => onDelete(r.id)} className="p-2 text-neutral-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Client Views ---

const ClientHome = memo(function ClientHome({ profile, rewards, onRedeem, allTurns }: { profile: UserProfile; rewards: Reward[]; onRedeem: (r: Reward) => void; allTurns: number[] }) {
  const nextReward = rewards.length > 0 
    ? (rewards.filter(r => r.requiredTurns > profile.turns).sort((a, b) => a.requiredTurns - b.requiredTurns)[0] || rewards[rewards.length - 1])
    : null;
  const progress = nextReward ? Math.min((profile.turns / nextReward.requiredTurns) * 100, 100) : 0;
  const level = getLevel(profile.totalTurns ?? profile.turns ?? 0, allTurns);

  return (
    <div className="space-y-8">
      {/* Card Section */}
      <div className="relative overflow-hidden bg-brand-900 rounded-xl p-8 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-300/20 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-500/10 blur-[80px] -ml-24 -mb-24" />
        
        <div className="relative z-10 space-y-6">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Tarjeta de premios</p>
              <h2 className="text-2xl font-extrabold tracking-tighter">{profile.displayName}</h2>
            </div>
            <div className={cn("w-10 h-10 rounded-full border flex items-center justify-center shadow-sm transition-all duration-500", level.color)}>
              {level.icon}
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-5xl font-black tracking-tighter">{profile.turns}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Puntos Disponibles</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-end text-[10px] font-bold uppercase tracking-widest">
              <div className="flex flex-col gap-1">
                <span className="text-white/40">Próximo Premio</span>
                <span className="text-white text-xs lowercase first-letter:uppercase tracking-tight">{nextReward?.name || '---'}</span>
              </div>
              <span className="text-white">
                {nextReward && (nextReward.requiredTurns - profile.turns >= 1) 
                  ? `${nextReward.requiredTurns - profile.turns} pts faltantes` 
                  : ''}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-gradient-to-r from-brand-300 to-brand-400 rounded-full shadow-[0_0_10px_rgba(241,205,193,0.3)]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* QR Section */}
      <div className=" py-2 flex flex-col items-center gap-4">
        <div className="text-center">
          <h3 className="font-bold text-neutral-900">Tu Código QR</h3>
          <p className="text-xs text-neutral-400 font-medium tracking-tight">Mostralo en la peluquería para sumar turnos</p>
        </div>
        <div className=" ">
          <QRCodeSVG value={profile.uid} size={200} level="H" includeMargin={false} />
        </div>
      </div>

      {/* Rewards Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold text-neutral-900 tracking-tight">Premios Disponibles</h3>
          <Gift className="w-4 h-4 text-neutral-300" />
        </div>
        
        <div className="grid gap-3">
          {rewards.length > 0 ? (
            [...rewards].sort((a, b) => a.requiredTurns - b.requiredTurns).map(r => {
              const isUnlocked = profile.turns >= r.requiredTurns;
              const rewardProgress = Math.min((profile.turns / r.requiredTurns) * 100, 100);
              return (
                <div 
                  key={r.id} 
                  className={cn(
                    "group relative bg-white p-5 rounded-xl border transition-all duration-300",
                    isUnlocked ? "border-brand-900/10 shadow-sm hover:shadow-md" : "border-neutral-100 opacity-80"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500",
                      isUnlocked ? "bg-brand-900 text-white shadow-lg shadow-brand-900/20" : "bg-neutral-50 text-neutral-300"
                    )}>
                      {r.type === 'producto' ? <Package className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                    </div>
                    <div className="space-y-0.5 flex-1">
                      <p className="font-bold text-neutral-900 tracking-tight">{r.name}</p>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-bold tracking-wider",
                          isUnlocked ? "text-brand-900" : "text-neutral-400"
                        )}>
                          {r.requiredTurns} PUNTOS
                        </span>
                        {isUnlocked && (
                          <div className="w-1 h-1 rounded-full bg-brand-900/30" />
                        )}
                        <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-tight">
                          {isUnlocked ? 'Disponible' : 'Necesarios'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isUnlocked ? (
                    <button 
                      onClick={() => onRedeem(r)}
                      className="mt-4 w-full py-2.5 bg-brand-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-950 transition-all active:scale-95 shadow-sm"
                    >
                      Canjear
                    </button>
                  ) : (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                        <span>Progreso</span>
                        <span>{profile.turns} / {r.requiredTurns}</span>
                      </div>
                      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${rewardProgress}%` }}
                          className="h-full bg-brand-900/40 rounded-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl border border-neutral-100 border-dashed">
              <Gift className="w-10 h-10 text-neutral-200 mx-auto mb-2" />
              <p className="text-sm text-neutral-400 font-medium">No hay premios configurados aún.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function ActivityView({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold text-neutral-900 tracking-tight">Actividad Reciente</h3>
          <History className="w-4 h-4 text-neutral-300" />
        </div>
        
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-neutral-100 shadow-sm">
              <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-neutral-200" />
              </div>
              <p className="text-neutral-400 font-medium tracking-tight">No hay actividad registrada aún.</p>
            </div>
          ) : (
            transactions.map(t => (
              <div key={t.id} className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner",
                    t.type === 'sum' ? "bg-emerald-50 text-emerald-600" : 
                    t.type === 'redeem' ? "bg-brand-900/10 text-brand-900" : "bg-red-50 text-red-600"
                  )}>
                    {t.type === 'sum' ? <Plus className="w-4 h-4" /> : 
                     t.type === 'redeem' ? <Gift className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-neutral-900 group-hover:text-brand-900 transition-colors">
                      {t.description.replace(/^Canje: /, '')}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">
                        {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                      </p>
                      {t.type === 'redeem' && (
                        <span className="text-[7px] bg-brand-900/10 text-brand-900 px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                          Canje
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-black text-lg tracking-tighter leading-none",
                    t.type === 'sum' ? "text-emerald-600" : 
                    t.type === 'redeem' ? "text-brand-900" : "text-red-600"
                  )}>
                    {t.type === 'sum' ? '+' : '-'}{t.amount}
                  </p>
                  <p className="text-[7px] text-neutral-400 font-black uppercase tracking-widest mt-0.5">puntos</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main App ---

function AdminUserDetail({ 
  user, 
  onBack, 
  allTurns, 
  managePoints, 
  addNotification,
  transactions,
  rewards
}: { 
  user: UserProfile; 
  onBack: () => void; 
  allTurns: number[];
  managePoints: (uid: string, amount: number, type: 'sum' | 'subtract' | 'redeem', description: string) => void;
  addNotification: (msg: string, type: 'success' | 'info') => void;
  transactions: Transaction[];
  rewards: Reward[];
}) {
  const handleSendWhatsApp = () => {
    if (!user.phone) return;
    
    const availableRewards = rewards.filter(r => r.requiredTurns <= user.turns);
    const upcomingRewards = rewards.filter(r => r.requiredTurns > user.turns).sort((a, b) => a.requiredTurns - b.requiredTurns);
    
    let message = `Hola ${user.displayName}! Tenés ${user.turns} puntos acumulados en CR Peluquería. ✂️\n\n`;
    
    if (availableRewards.length > 0) {
      message += `🎁 Premios que ya podés canjear:\n`;
      availableRewards.forEach(r => {
        message += `- ${r.name} (${r.requiredTurns} pts)\n`;
      });
      message += `\n`;
    }
    
    if (upcomingRewards.length > 0) {
      const next = upcomingRewards[0];
      message += `🚀 Te faltan solo ${next.requiredTurns - user.turns} puntos para tu próximo premio: ${next.name}!\n`;
      if (upcomingRewards.length > 1) {
        message += `\nTambién podés seguir acumulando para:\n`;
        upcomingRewards.slice(1, 3).forEach(r => {
          message += `- ${r.name} (${r.requiredTurns} pts)\n`;
        });
      }
    }
    
    sendWhatsApp(user.phone, message);
  };

  const displayPhone = user.phone?.startsWith('54') ? user.phone.substring(2) : user.phone;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-neutral-100 rounded-full transition-all">
          <ArrowLeft className="w-5 h-5 text-neutral-600" />
        </button>
        <h2 className="font-bold text-neutral-900 tracking-tight">Detalle del Cliente</h2>
      </div>

      <div className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-neutral-50 rounded-xl flex items-center justify-center shadow-inner">
            <UserIcon className="w-7 h-7 text-neutral-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-lg text-neutral-900 leading-tight">{user.displayName}</h4>
              <div className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full border text-[8px]", getLevel(user.totalTurns ?? user.turns ?? 0, allTurns).color)}>
                {getLevel(user.totalTurns ?? user.turns ?? 0, allTurns).icon}
              </div>
            </div>
            <p className="text-xs text-neutral-400 font-medium">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-900 text-white p-5 rounded-2xl text-center shadow-xl">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Puntos Actuales</p>
          <p className="text-3xl font-black">{user.turns}</p>
        </div>
        <div className="bg-white border border-neutral-100 p-5 rounded-2xl text-center flex flex-col justify-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Puntos Totales</p>
          <p className="text-2xl font-bold text-neutral-900">{user.totalTurns ?? user.turns ?? 0}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm space-y-3">
        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">WhatsApp</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-neutral-50 border border-neutral-100 rounded-xl px-4 focus-within:ring-2 focus-within:ring-neutral-900 transition-all">
            <span className="text-neutral-400 font-bold text-sm mr-1">+54</span>
            <input 
              type="tel" 
              placeholder="Ej: 353 65..."
              defaultValue={displayPhone}
              onBlur={async (e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (!val) return;
                const fullPhone = `54${val}`;
                if (fullPhone === user.phone) return;
                try {
                  await updateDoc(doc(db, 'users', user.uid), { phone: fullPhone });
                  addNotification("Teléfono actualizado", "success");
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
                }
              }}
              className="flex-1 py-3 bg-transparent outline-none font-mono text-sm"
            />
          </div>
          {user.phone && (
            <button 
              onClick={handleSendWhatsApp}
              className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center"
              title="Enviar WhatsApp"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-2">Acciones Rápidas</p>
        <div className="grid grid-cols-3 gap-3">
          <button 
            onClick={() => managePoints(user.uid, -1, 'subtract', 'Turno restado')}
            className="col-span-1 flex items-center justify-center gap-2 py-4 bg-red-50 text-red-700 rounded-xl font-bold active:scale-95 transition-all border border-red-100 text-sm shadow-sm"
          >
            <Minus className="w-4 h-4" /> Restar
          </button>
          <button 
            onClick={() => managePoints(user.uid, 1, 'sum', 'Turno sumado')}
            className="col-span-2 flex items-center justify-center gap-3 py-4 bg-emerald-600 text-white rounded-xl font-black active:scale-95 transition-all shadow-xl shadow-emerald-500/20 text-base"
          >
            <Plus className="w-6 h-6" /> SUMAR PUNTO
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Historial de Actividad</p>
          <History className="w-4 h-4 text-neutral-400" />
        </div>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-md border border-neutral-100 shadow-sm">
              <p className="text-neutral-400 font-medium italic">Sin actividad reciente</p>
            </div>
          ) : (
            transactions.map(t => (
              <div key={t.id} className="bg-white p-3 rounded-2xl border border-neutral-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner",
                    t.type === 'sum' ? "bg-emerald-50 text-emerald-600" : 
                    t.type === 'subtract' ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
                  )}>
                    {t.type === 'sum' ? <Plus className="w-4 h-4" /> : 
                     t.type === 'subtract' ? <Minus className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-neutral-900 group-hover:text-brand-600 transition-colors">{t.description}</p>
                    <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">
                      {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : 'Reciente'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-black text-lg tracking-tighter leading-none",
                    t.type === 'sum' ? "text-emerald-600" : "text-red-600"
                  )}>
                    {t.type === 'sum' ? '+' : '-'}{t.amount}
                  </p>
                  <p className="text-[7px] text-neutral-400 font-black uppercase tracking-widest mt-0.5">puntos</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Admin Data
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  
  // Client Data
  const [myTransactions, setMyTransactions] = useState<Transaction[]>([]);
  
  const [selectedUserTransactions, setSelectedUserTransactions] = useState<Transaction[]>([]);
  
  const [allTurns, setAllTurns] = useState<number[]>([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'rewards' | 'client' | 'activity' | 'settings'>('dashboard');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [confirmingReward, setConfirmingReward] = useState<Reward | null>(null);
  const [confirmingDeleteReward, setConfirmingDeleteReward] = useState<string | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'info' }[]>([]);

  const addNotification = (message: string, type: 'success' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleScan = useCallback((uid: string) => {
    const user = allUsers.find(u => u.uid === uid);
    if (user) {
      setSelectedUser(user);
      setIsScannerOpen(false);
      addNotification(`Cliente encontrado: ${user.displayName}`, 'success');
    } else {
      addNotification('Código QR no válido o cliente no encontrado', 'info');
    }
  }, [allUsers]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for profile
        const unsubProfile = onSnapshot(userDocRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as UserProfile;
            // Initialize totalTurns for existing users if missing
            if (data.totalTurns === undefined) {
              const initialTotal = data.turns || 0;
              await updateDoc(userDocRef, { totalTurns: initialTotal });
              data.totalTurns = initialTotal;
            }
            setProfile(data);
            if (data.role === 'client') setActiveTab('client');
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Usuario',
              email: firebaseUser.email || '',
              turns: 0,
              totalTurns: 0,
              role: firebaseUser.email === 'jcavitellihs@gmail.com' ? 'admin' : 'client',
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
            // Initial stats update will be handled by admin later or we can try here if rules allow
            if (newProfile.role === 'client') {
              const statsRef = doc(db, 'stats', 'global');
              updateDoc(statsRef, { allTotalTurns: arrayUnion(0) }).catch(() => {
                // If it fails (e.g. doc doesn't exist), admin will fix it on next point addition
                setDoc(statsRef, { allTotalTurns: [0] }, { merge: true }).catch(() => {});
              });
            }
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`));

        // Listen for rewards (global)
        const unsubRewards = onSnapshot(collection(db, 'rewards'), (snapshot) => {
          setRewards(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reward)));
        }, (err) => handleFirestoreError(err, OperationType.GET, 'rewards'));

        // Listen for global stats
        const unsubStats = onSnapshot(doc(db, 'stats', 'global'), (snapshot) => {
          if (snapshot.exists()) {
            setAllTurns(snapshot.data().allTotalTurns || []);
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'stats/global'));

        return () => {
          unsubProfile();
          unsubRewards();
          unsubStats();
        };
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Admin Listeners
  useEffect(() => {
    if (profile?.role === 'admin') {
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(d => d.data() as UserProfile));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));

      const q = query(collectionGroup(db, 'history'), orderBy('createdAt', 'desc'), limit(50));
      const unsubAllHistory = onSnapshot(q, (snapshot) => {
        setAllTransactions(snapshot.docs.map(d => {
          const data = d.data() as any;
          const userId = data.userId || d.ref.parent.parent?.id;
          return { id: d.id, ...data, userId } as Transaction;
        }));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'history (collectionGroup)'));

      setLoading(false);
      return () => {
        unsubUsers();
        unsubAllHistory();
      };
    }
  }, [profile]);

  // Client Listeners
  useEffect(() => {
    if (profile?.role === 'client' || (profile?.role === 'admin' && selectedUser)) {
      const targetUid = selectedUser ? selectedUser.uid : profile!.uid;
      const q = query(collection(db, 'users', targetUid, 'history'), orderBy('createdAt', 'desc'));
      const unsubHistory = onSnapshot(q, (snapshot) => {
        const trans = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
        if (selectedUser) {
          setSelectedUserTransactions(trans);
        } else {
          setMyTransactions(trans);
        }
      }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${targetUid}/history`));
      setLoading(false);
      return () => unsubHistory();
    }
  }, [profile, selectedUser]);

  // --- Actions ---

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const updateGlobalStats = async (newTotalTurns?: number, oldTotalTurns?: number) => {
    if (profile?.role !== 'admin') return; 
    const statsRef = doc(db, 'stats', 'global');
    try {
      const statsDoc = await getDoc(statsRef);
      let allTotalTurns: number[] = [];
      
      if (statsDoc.exists()) {
        allTotalTurns = statsDoc.data().allTotalTurns || [];
      }
      
      if (oldTotalTurns !== undefined) {
        const index = allTotalTurns.indexOf(oldTotalTurns);
        if (index > -1) {
          allTotalTurns.splice(index, 1);
        }
      }
      
      if (newTotalTurns !== undefined) {
        allTotalTurns.push(newTotalTurns);
      }
      
      // Sort and limit to keep document size manageable if needed, 
      // but for now just update
      await setDoc(statsRef, { 
        allTotalTurns,
        lastUpdate: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Error updating global stats:", err);
    }
  };

  const managePoints = async (uid: string, amount: number, type: 'sum' | 'subtract' | 'redeem', desc: string, rewardId?: string, rewardName?: string) => {
    // Optimistic update for selected user
    if (selectedUser && selectedUser.uid === uid) {
      setSelectedUser(prev => {
        if (!prev) return null;
        const newTotalTurns = amount > 0 ? (prev.totalTurns ?? prev.turns) + amount : (prev.totalTurns ?? prev.turns);
        return { 
          ...prev, 
          turns: prev.turns + amount,
          totalTurns: newTotalTurns
        };
      });
    }

    try {
      const userRef = doc(db, 'users', uid);
      const historyRef = collection(db, 'users', uid, 'history');
      
      // Use local state if available to avoid getDoc delay
      const targetUser = allUsers.find(u => u.uid === uid) || (profile?.uid === uid ? profile : null);
      const currentTurns = targetUser?.turns || 0;
      const currentTotalTurns = targetUser?.totalTurns ?? currentTurns;
      const newTurns = currentTurns + amount;

      const updateData: any = { 
        turns: increment(amount),
        lastActivity: serverTimestamp()
      };
      
      if (targetUser?.totalTurns === undefined) {
        updateData.totalTurns = currentTotalTurns + (amount > 0 ? amount : 0);
      } else if (amount > 0) {
        updateData.totalTurns = increment(amount);
      }

      if (amount > 0) {
        updateGlobalStats(currentTotalTurns + amount, currentTotalTurns);
      }

      // Fire and forget (Firestore handles sync in background)
      updateDoc(userRef, updateData).catch(err => {
        console.error("Update failed", err);
        // Rollback if needed
        if (selectedUser && selectedUser.uid === uid) {
          setSelectedUser(prev => {
            if (!prev) return null;
            const oldTotalTurns = amount > 0 ? (prev.totalTurns ?? prev.turns) - amount : (prev.totalTurns ?? prev.turns);
            return { 
              ...prev, 
              turns: prev.turns - amount,
              totalTurns: oldTotalTurns
            };
          });
        }
      });

      addDoc(historyRef, {
        type,
        amount: Math.abs(amount),
        description: desc,
        rewardId: rewardId || null,
        rewardName: rewardName || null,
        userId: uid,
        userName: targetUser?.displayName || 'Usuario',
        realized: false,
        createdAt: serverTimestamp()
      });

      // Check for reward milestones
      const unlockedRewards = rewards.filter(r => r.requiredTurns > currentTurns && r.requiredTurns <= newTurns);
      if (unlockedRewards.length > 0) {
        addNotification(`¡Felicidades! Desbloqueaste: ${unlockedRewards.map(r => r.name).join(', ')}`, 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/history`);
    }
  };

  const saveReward = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      requiredTurns: Number(formData.get('requiredTurns')),
      type: formData.get('type') as any,
      description: formData.get('description') as string,
    };

    try {
      if (editingReward) {
        await updateDoc(doc(db, 'rewards', editingReward.id), data);
      } else {
        await addDoc(collection(db, 'rewards'), data);
      }
      setIsRewardModalOpen(false);
      setEditingReward(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'rewards');
    }
  };

  const deleteReward = async (id: string) => {
    setConfirmingDeleteReward(id);
  };

  const confirmDeleteReward = async () => {
    if (!confirmingDeleteReward) return;
    const id = confirmingDeleteReward;
    setConfirmingDeleteReward(null);
    try {
      await deleteDoc(doc(db, 'rewards', id));
      addNotification('Recompensa eliminada', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rewards/${id}`);
    }
  };

  const redeemReward = async (reward: Reward) => {
    if (profile!.turns < reward.requiredTurns) return;
    setConfirmingReward(reward);
  };

  const confirmRedeem = async () => {
    if (!confirmingReward || !profile) return;
    const reward = confirmingReward;
    setConfirmingReward(null);
    
    try {
      await managePoints(profile.uid, -reward.requiredTurns, 'redeem', reward.name, reward.id, reward.name);
      addNotification(`¡Canjeaste ${reward.name} con éxito!`, 'success');
    } catch (err) {
      addNotification('Error al procesar el canje', 'info');
    }
  };

  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6 pb-32">
        <div className="max-w-md mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="w-32 h-8" />
              <Skeleton className="w-48 h-4" />
            </div>
            <Skeleton className="w-12 h-12 rounded-full" />
          </div>
          {/* We don't know the role yet, so we show a generic skeleton or the client one as default */}
          <ClientSkeleton />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#34364c] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="max-w-sm w-full space-y-10 relative z-10"
        >
          <div className="space-y-6">
            <div className="w-64 h-64 mx-auto relative group overflow-hidden">
              <img 
                src="/logo.png" 
                alt="Camila Ramirez Logo" 
                className="w-full h-full object-contain relative z-10"
              />
            </div>
            <p className="text-white/40 font-medium tracking-tight">Tu estilo merece ser recompensado.</p>
          </div>

          <button 
            onClick={handleLogin} 
            className="group max-w-[240px] mx-auto w-full flex items-center justify-center gap-3 bg-white border border-white/10 text-neutral-700 font-bold py-3 px-4 rounded-2xl shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 text-sm"
          >
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm border border-neutral-50 group-hover:scale-110 transition-transform">
              <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="Google" className="w-4 h-4" />
            </div>
            <span className="tracking-tight">Ingresar con Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-neutral-50 pb-32">
        <main className="max-w-2xl mx-auto p-6 no-scrollbar">
          <AnimatePresence mode="wait">
            {profile?.role === 'admin' ? (
              <motion.div key={selectedUser ? 'detail' : activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                {selectedUser ? (
                  <AdminUserDetail 
                    user={selectedUser} 
                    onBack={() => setSelectedUser(null)} 
                    allTurns={allTurns}
                    managePoints={managePoints}
                    addNotification={addNotification}
                    transactions={selectedUserTransactions}
                    rewards={rewards}
                  />
                ) : (
                  <>
                    {activeTab === 'dashboard' && (
                      <AdminDashboard 
                        users={allUsers} 
                        rewards={rewards} 
                        transactions={allTransactions} 
                        onMarkRealized={async (t) => {
                          if (!t.userId) return;
                          try {
                            await updateDoc(doc(db, 'users', t.userId, 'history', t.id), { realized: true });
                            addNotification("Canje marcado como realizado", "success");
                          } catch (err) {
                            handleFirestoreError(err, OperationType.WRITE, `users/${t.userId}/history/${t.id}`);
                          }
                        }}
                      />
                    )}
                    {activeTab === 'users' && <AdminUsers users={allUsers} onSelectUser={setSelectedUser} onScan={() => setIsScannerOpen(true)} allTurns={allTurns} />}
                    {activeTab === 'client' && <ClientHome profile={profile!} rewards={rewards} onRedeem={redeemReward} allTurns={allTurns} />}
                    {activeTab === 'rewards' && <AdminRewards rewards={rewards} onAdd={() => { setEditingReward(null); setIsRewardModalOpen(true); }} onEdit={(r) => { setEditingReward(r); setIsRewardModalOpen(true); }} onDelete={deleteReward} />}
                    {activeTab === 'settings' && <SettingsView profile={profile!} onLogout={() => setIsLogoutConfirmOpen(true)} />}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                {activeTab === 'client' && <ClientHome profile={profile!} rewards={rewards} onRedeem={redeemReward} allTurns={allTurns} />}
                {activeTab === 'activity' && <ActivityView transactions={myTransactions} />}
                {activeTab === 'settings' && <SettingsView profile={profile!} onLogout={() => setIsLogoutConfirmOpen(true)} />}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Navigation */}
        {!selectedUser && (
          <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-2xl border border-white/50 p-2 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center gap-1 z-50 ring-1 ring-black/5">
            {profile?.role === 'admin' ? (
              <>
                <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-5 h-5" />} label="Inicio" hideLabel />
                <NavButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users className="w-5 h-5" />} label="Clientes" hideLabel />
                
                <button 
                  onClick={() => setIsScannerOpen(true)}
                  className="w-14 h-14 bg-brand-900 text-white rounded-full flex items-center justify-center shadow-xl shadow-brand-900/40 hover:bg-brand-950 transition-all active:scale-90 mx-2 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <QrCode className="w-7 h-7 relative z-10" />
                </button>

                <NavButton active={activeTab === 'rewards'} onClick={() => setActiveTab('rewards')} icon={<Gift className="w-5 h-5" />} label="Premios" hideLabel />
                <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings className="w-5 h-5" />} label="Ajustes" hideLabel />
              </>
            ) : (
              <>
                <NavButton active={activeTab === 'client'} onClick={() => setActiveTab('client')} icon={<Star className="w-5 h-5" />} label="Mi Tarjeta" hideLabel />
                <NavButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} icon={<History className="w-5 h-5" />} label="Actividad" hideLabel />
                <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings className="w-5 h-5" />} label="Ajustes" hideLabel />
              </>
            )}
          </nav>
        )}

        {/* QR Scanner Modal */}
        <Modal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} title="Escanear Cliente">
          <QRScanner 
            onScan={handleScan}
            onClose={() => setIsScannerOpen(false)}
          />
        </Modal>

        {/* Notifications */}
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4">
          <AnimatePresence>
            {notifications.map(n => (
              <NotificationToast 
                key={n.id} 
                message={n.message} 
                type={n.type as 'success' | 'info'} 
                onClose={() => removeNotification(n.id)} 
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Reward Modal */}
        <Modal isOpen={isRewardModalOpen} onClose={() => setIsRewardModalOpen(false)} title={editingReward ? "Editar Recompensa" : "Nueva Recompensa"}>
          <form onSubmit={saveReward} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Nombre</label>
              <input name="name" defaultValue={editingReward?.name} required className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-md outline-none focus:ring-2 focus:ring-neutral-900" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Turnos</label>
                <input name="requiredTurns" type="number" defaultValue={editingReward?.requiredTurns} required className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-md outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tipo</label>
                <select name="type" defaultValue={editingReward?.type || 'servicio'} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-md outline-none focus:ring-2 focus:ring-neutral-900">
                  <option value="servicio">Servicio</option>
                  <option value="producto">Producto</option>
                  <option value="descuento">Descuento</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Descripción</label>
              <textarea name="description" defaultValue={editingReward?.description} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-md outline-none focus:ring-2 focus:ring-neutral-900 min-h-[100px]" />
            </div>
            <button type="submit" className="w-full py-4 bg-neutral-900 text-white rounded-md font-bold shadow-lg active:scale-95 transition-all">
              Guardar Recompensa
            </button>
          </form>
        </Modal>

        {/* Confirmation Modal */}
        <Modal isOpen={!!confirmingReward} onClose={() => setConfirmingReward(null)} title="Confirmar Canje">
          {confirmingReward && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 bg-neutral-900 text-white rounded-md flex items-center justify-center mx-auto shadow-xl">
                <Gift className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-neutral-900">¿Canjear {confirmingReward.name}?</h3>
                <p className="text-sm text-neutral-500">Se descontarán <span className="font-bold text-neutral-900">{confirmingReward.requiredTurns} turnos</span> de tu saldo actual.</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setConfirmingReward(null)}
                  className="flex-1 py-4 bg-neutral-100 text-neutral-500 rounded-md font-bold active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmRedeem}
                  className="flex-1 py-4 bg-neutral-900 text-white rounded-md font-bold shadow-lg active:scale-95 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Reward Confirmation */}
        <Modal isOpen={!!confirmingDeleteReward} onClose={() => setConfirmingDeleteReward(null)} title="Eliminar Recompensa">
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-md flex items-center justify-center mx-auto">
              <Trash2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-neutral-900">¿Estás seguro?</h3>
              <p className="text-sm text-neutral-500">Esta acción no se puede deshacer y la recompensa dejará de estar disponible para los clientes.</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setConfirmingDeleteReward(null)}
                className="flex-1 py-4 bg-neutral-100 text-neutral-500 rounded-md font-bold active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteReward}
                className="flex-1 py-4 bg-red-500 text-white rounded-md font-bold shadow-lg active:scale-95 transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </Modal>

        {/* Logout Confirmation */}
        <Modal isOpen={isLogoutConfirmOpen} onClose={() => setIsLogoutConfirmOpen(false)} title="">
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-neutral-900">¿Cerrar sesión?</h3>
              <p className="text-sm text-neutral-500">Tendrás que volver a ingresar con tu cuenta para ver tus puntos.</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 py-2 bg-neutral-100 text-neutral-500 rounded-md font-bold active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 py-2 bg-red-500 text-white rounded-md font-bold shadow-lg active:scale-95 transition-all"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </Modal>

      </div>
    </ErrorBoundary>
  );
}

function SettingsView({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const displayName = formData.get('displayName') as string;
    const phone = formData.get('phone') as string;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName,
        phone
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-bold text-neutral-900 tracking-tight ">Configuración</h3>
        <Settings className="w-5 h-5 text-neutral-300" />
      </div>

      <div className="bg-white p-6 rounded-xl border border-neutral-100 shadow-sm space-y-6">
        <div className="px-1">
          <p className="font-black text-xl text-neutral-900 tracking-tighter leading-none">{profile.displayName}</p>
          <p className="text-xs text-neutral-400 font-medium tracking-tight mt-1">{profile.email}</p>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.2em] px-1">Nombre Completo</label>
            <input 
              name="displayName" 
              defaultValue={profile.displayName} 
              required 
              className="w-full p-3.5 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-200 transition-all font-medium text-sm" 
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.2em] px-1">Número de Teléfono</label>
            <input 
              name="phone" 
              type="tel"
              placeholder="Ej: 353 65..."
              defaultValue={profile.phone} 
              className="w-full p-3.5 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-200 transition-all font-medium text-sm" 
            />
          </div>
          <button 
            type="submit" 
            disabled={isSaving}
            className="w-full py-4 bg-neutral-900 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-neutral-900/10 active:scale-95 transition-all disabled:opacity-50 text-xs"
          >
            {isSaving ? "Guardando..." : "Actualizar Perfil"}
          </button>
        </form>
      </div>

      <div className="bg-red-50/50 p-5 rounded-xl border border-red-100 group hover:bg-red-50 transition-colors">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="font-bold text-red-900 tracking-tight text-sm">Cerrar Sesión</p>
            <p className="text-[11px] text-red-600/70 font-medium">Saldrás de tu cuenta de forma segura.</p>
          </div>
          <button 
            onClick={onLogout}
            className="w-11 h-11 bg-white text-red-500 rounded-xl shadow-sm border border-red-100 flex items-center justify-center hover:shadow-md hover:scale-105 active:scale-95 transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string; key?: React.Key }) {
  return (
    <div className={cn("animate-pulse bg-neutral-200 rounded-md", className)} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="bg-white p-6 rounded-md border border-neutral-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10" />
            <div className="space-y-2">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-48 h-3" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-64 w-full rounded-md" />
      <div className="bg-white p-8 rounded-md border border-neutral-100 shadow-sm flex flex-col items-center gap-6">
        <Skeleton className="w-48 h-48" />
        <div className="space-y-2 w-full flex flex-col items-center">
          <Skeleton className="w-32 h-4" />
          <Skeleton className="w-48 h-3" />
        </div>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, hideLabel }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hideLabel?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center justify-center p-3 rounded-full transition-all duration-300 active:scale-95",
        active 
          ? "bg-brand-900/10 text-brand-900 shadow-sm" 
          : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
      )}
      title={label}
    >
      <span className={cn("transition-transform duration-300", active && "scale-110")}>
        {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
      </span>
    </button>
  );
}
