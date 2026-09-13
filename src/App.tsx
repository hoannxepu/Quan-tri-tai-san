import React, { useState, useEffect, useRef } from 'react';
import { DatabaseState, Asset, Debt, Goal } from './types';
import {
  DEFAULT_DATABASE_STATE,
  loadCloudData,
  saveCloudData,
} from './utils/storage';
import { normalizeAccountKey, hashString } from './utils/format';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { TabPyramid } from './components/TabPyramid';
import { TabDebts } from './components/TabDebts';
import { TabGoals } from './components/TabGoals';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'pyramid' | 'debts' | 'goals'>('pyramid');
  const [db, setDb] = useState<DatabaseState>(DEFAULT_DATABASE_STATE);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('thaptaisan_privacy_mode') === '1';
  });

  const [currentAccountKey, setCurrentAccountKey] = useState<string>('');
  const [userDisplay, setUserDisplay] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  // Cloud root memory cache
  const [cloudRoot, setCloudRoot] = useState<{
    passwords: Record<string, string>;
    users: Record<string, DatabaseState>;
  }>({ passwords: {}, users: {} });

  // Refs for background debounce sync
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBackgroundSavingRef = useRef<boolean>(false);
  const pendingDbRef = useRef<DatabaseState | null>(null);
  const currentAccountKeyRef = useRef<string>('');
  const cloudRootRef = useRef(cloudRoot);

  useEffect(() => {
    currentAccountKeyRef.current = currentAccountKey;
  }, [currentAccountKey]);

  useEffect(() => {
    cloudRootRef.current = cloudRoot;
  }, [cloudRoot]);

  // On App Mount: FAST PATH local first (0ms), then background cloud fetch
  useEffect(() => {
    const initApp = async () => {
      const savedAccount = localStorage.getItem('thaptaisan_saved_account');
      const savedPass = localStorage.getItem('thaptaisan_saved_pass');
      const activeAccount = localStorage.getItem('thaptaisan_active_account');
      const targetAccount = savedAccount || activeAccount;

      // 1. FAST PATH: Check local cache first - Opens in 0ms!
      if (targetAccount) {
        const accKey = normalizeAccountKey(targetAccount);
        const localSaved = localStorage.getItem(`thaptaisan_local_${accKey}`);
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            setupUserSession(targetAccount, accKey, parsed);
          } catch (e) {
            console.error('Error parsing local cache:', e);
          }
        }
      }

      // 2. BACKGROUND FETCH: Verify with Google Drive in background without blocking UI
      loadCloudData().then((cloudData) => {
        if (cloudData) {
          setCloudRoot(cloudData);

          if (targetAccount && savedPass) {
            const accKey = normalizeAccountKey(targetAccount);
            const storedHash = cloudData.passwords?.[accKey];
            if (storedHash) {
              hashString(savedPass).then((hashed) => {
                if (storedHash === hashed || storedHash === savedPass) {
                  // Valid cloud user verified
                  const cloudDb = cloudData.users?.[accKey];
                  if (cloudDb && !localStorage.getItem(`thaptaisan_local_${accKey}`)) {
                    setupUserSession(targetAccount, accKey, cloudDb);
                  }
                }
              });
            }
          }
        }
      });

      // If no active session found at all, show Auth modal
      if (!targetAccount) {
        setShowAuthModal(true);
      }
    };

    initApp();
  }, []);

  const setupUserSession = (rawAccount: string, accKey: string, userData?: DatabaseState) => {
    setCurrentAccountKey(accKey);

    let displayLabel = rawAccount;
    if (rawAccount.includes('@')) {
      const [userPart, domain] = rawAccount.split('@');
      displayLabel = (userPart.length > 3 ? userPart.substring(0, 3) + '***' : userPart) + '@' + domain;
    } else {
      displayLabel = rawAccount.length > 4 ? rawAccount.substring(0, 4) + '***' : rawAccount;
    }
    setUserDisplay(displayLabel);
    setShowAuthModal(false);

    if (userData) {
      setDb({
        ...DEFAULT_DATABASE_STATE,
        ...userData,
        assets: userData.assets || [],
        debts: userData.debts || [],
        goals: userData.goals || [],
        history: userData.history || [],
      });
    }
  };

  const handleLogin = async (rawAccount: string, pass: string, remember: boolean): Promise<boolean> => {
    const accKey = normalizeAccountKey(rawAccount);
    const hashed = await hashString(pass);

    let latestCloud = cloudRootRef.current;
    const fetched = await loadCloudData();
    if (fetched) {
      latestCloud = fetched;
      setCloudRoot(fetched);
    }

    if (!latestCloud.passwords) latestCloud.passwords = {};
    if (!latestCloud.users) latestCloud.users = {};

    if (latestCloud.passwords[accKey]) {
      const savedHash = latestCloud.passwords[accKey];
      if (savedHash !== hashed && savedHash !== pass) {
        return false;
      }
    } else {
      // New user registration
      latestCloud.passwords[accKey] = hashed;
      latestCloud.users[accKey] = {
        ...DEFAULT_DATABASE_STATE,
        lastUpdate: new Date().toLocaleDateString('vi-VN'),
      };
      saveCloudData(latestCloud); // Run in background
    }

    const userData = latestCloud.users[accKey] || DEFAULT_DATABASE_STATE;

    if (remember) {
      localStorage.setItem('thaptaisan_saved_account', rawAccount);
      localStorage.setItem('thaptaisan_saved_pass', pass);
    } else {
      localStorage.setItem('thaptaisan_saved_account', rawAccount);
      localStorage.removeItem('thaptaisan_saved_pass');
    }
    localStorage.setItem('thaptaisan_active_account', rawAccount);
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(userData));

    setupUserSession(rawAccount, accKey, userData);
    return true;
  };

  const handleLogout = () => {
    if (confirm('Bạn có muốn đăng xuất để chuyển sang tài khoản khác?')) {
      localStorage.removeItem('thaptaisan_active_account');
      localStorage.removeItem('thaptaisan_saved_pass');
      setShowAuthModal(true);
      setUserDisplay('');
    }
  };

  const handleTogglePrivacy = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      localStorage.setItem('thaptaisan_privacy_mode', next ? '1' : '0');
      return next;
    });
  };

  // OPTIMISTIC UI + NON-BLOCKING BACKGROUND SYNC
  const triggerBackgroundSync = (newDb: DatabaseState, immediate: boolean = false) => {
    const accKey = currentAccountKeyRef.current;
    if (!accKey) return;

    // Step 1: Instant local save (0ms - completely immune to lag)
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(newDb));
    pendingDbRef.current = newDb;

    // Step 2: Clear any pending debounce timer
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    const performSave = async () => {
      const targetDb = pendingDbRef.current;
      const targetKey = currentAccountKeyRef.current;
      if (!targetDb || !targetKey) return;

      if (isBackgroundSavingRef.current) {
        // If already saving, queue a retry right after
        syncTimeoutRef.current = setTimeout(performSave, 2000);
        return;
      }

      isBackgroundSavingRef.current = true;
      setCloudSyncStatus('syncing');

      const updatedCloud = {
        ...cloudRootRef.current,
        users: {
          ...cloudRootRef.current.users,
          [targetKey]: targetDb,
        },
      };
      setCloudRoot(updatedCloud);

      const success = await saveCloudData(updatedCloud);
      isBackgroundSavingRef.current = false;

      if (success) {
        setCloudSyncStatus('synced');
        // Check if user made another change while we were uploading
        if (pendingDbRef.current && pendingDbRef.current !== targetDb) {
          syncTimeoutRef.current = setTimeout(performSave, 1500);
        }
      } else {
        setCloudSyncStatus('offline');
      }
    };

    if (immediate) {
      setCloudSyncStatus('syncing');
      performSave();
    } else {
      setCloudSyncStatus('syncing');
      // 1.5s debounce so rapid clicks don't spam Google Apps Script
      syncTimeoutRef.current = setTimeout(performSave, 1500);
    }
  };

  // State mutators - ALL INSTANT LOCAL FIRST
  const handleUpdateAsset = (updatedAsset: Asset) => {
    setDb((prev) => {
      const idx = prev.assets.findIndex((a) => a.id === updatedAsset.id);
      let newAssets = [...prev.assets];
      if (idx !== -1) {
        newAssets[idx] = updatedAsset;
      } else {
        newAssets.push(updatedAsset);
      }
      const newDb = { ...prev, assets: newAssets };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleRemoveAsset = (id: number) => {
    setDb((prev) => {
      const newAssets = prev.assets.filter((a) => a.id !== id);
      const newDb = { ...prev, assets: newAssets };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleUpdateDebt = (updatedDebt: Debt) => {
    setDb((prev) => {
      const idx = prev.debts.findIndex((d) => d.id === updatedDebt.id);
      let newDebts = [...prev.debts];
      if (idx !== -1) {
        newDebts[idx] = updatedDebt;
      } else {
        newDebts.push(updatedDebt);
      }
      const newDb = { ...prev, debts: newDebts };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleRemoveDebt = (id: number) => {
    setDb((prev) => {
      const newDebts = prev.debts.filter((d) => d.id !== id);
      const newDb = { ...prev, debts: newDebts };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleUpdateGoal = (updatedGoal: Goal) => {
    setDb((prev) => {
      const idx = prev.goals.findIndex((g) => g.id === updatedGoal.id);
      let newGoals = [...prev.goals];
      if (idx !== -1) {
        newGoals[idx] = updatedGoal;
      } else {
        newGoals.push(updatedGoal);
      }
      const newDb = { ...prev, goals: newGoals };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleRemoveGoal = (id: number) => {
    setDb((prev) => {
      const newGoals = prev.goals.filter((g) => g.id !== id);
      const newDb = { ...prev, goals: newGoals };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  const handleUpdateIncome = (salary: number, other: number) => {
    setDb((prev) => {
      const newDb = { ...prev, salaryIncome: salary, otherIncome: other };
      triggerBackgroundSync(newDb, false);
      return newDb;
    });
  };

  // Drive sync button on Tab 1: Instant snapshot + background upload
  const handleSyncDrive = () => {
    setIsSyncing(true);
    const now = new Date();
    const timeStr = now.toLocaleDateString('vi-VN');

    const totalAssets = db.assets.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalDebts = db.debts.reduce((sum, d) => {
      if (d.category === 'type1' || d.category === 'type2' || d.category === 'type_free') {
        return sum + Math.max(0, d.amount - (d.paidPrincipal || 0));
      }
      return sum;
    }, 0);
    const netWorth = totalAssets - totalDebts;

    const totalPassiveInflow = db.assets.reduce((sum, a) => {
      if (a.type === 'realestate_rent' || a.type === 'private_equity' || a.type === 'peer_lending') {
        return sum + (a.cashflow || 0);
      }
      if (a.type === 'stock' && a.quantity && a.divCash) {
        return sum + Math.round((a.quantity * a.divCash) / 12);
      }
      if (a.type === 'saving' && a.rate && a.termMonths) {
        return sum + Math.round((a.amount * (a.rate / 100) * (a.termMonths / 12)) / a.termMonths);
      }
      return sum;
    }, 0);
    const totalInflow = (db.salaryIncome || 0) + (db.otherIncome || 0) + totalPassiveInflow;

    let totalOutflow = 0;
    db.debts.forEach((d) => {
      if (d.status !== 'Đã tất toán' && d.category !== 'type_free') {
        let m = d.monthlyBefore || d.installmentAmount || d.periodicAmount || 0;
        if (d.frequency === 'annual') m = Math.round(m / 12);
        else if (d.frequency === 'biannual') m = Math.round(m / 6);
        else if (d.frequency === 'quarterly') m = Math.round(m / 3);
        totalOutflow += m;
      }
    });

    const netCashFlow = totalInflow - totalOutflow;

    let totalDebtPaid = 0;
    let totalDebtOriginal = 0;
    db.debts.forEach((d) => {
      if (d.category !== 'type4' && d.category !== 'type_free') {
        const remaining = d.status === 'Đã tất toán' ? 0 : d.amount;
        const paid = d.paidPrincipal || 0;
        totalDebtPaid += paid;
        totalDebtOriginal += remaining + paid;
      }
    });
    const debtProgressPercent = totalDebtOriginal > 0 ? Math.min(100, Math.round((totalDebtPaid / totalDebtOriginal) * 100)) : 0;

    const dcaGoals = db.goals.filter((g) => g.group === 'dca' || g.goalType === 'dca');
    const dcaProgressPercent = dcaGoals.length > 0
      ? Math.round((dcaGoals.filter((g) => (g.totalBought || 0) >= (g.targetQty || 1)).length / dcaGoals.length) * 100)
      : 85;

    let liquidAssets = 0;
    db.assets.forEach((a) => {
      if (a.level === '1' && (a.type === 'cash' || a.type === 'saving' || a.type === 'gold')) {
        liquidAssets += a.amount;
      }
    });
    const runwayGoal = db.goals.find((g) => g.group === 'runway' || g.name.toLowerCase().includes('runway'));
    const runwayTarget = runwayGoal?.target || totalOutflow * 6 || 1;
    const runwayPercent = Math.min(100, Math.round((liquidAssets / runwayTarget) * 100));

    let milestoneTarget = 0;
    let milestoneAccumulated = 0;
    db.goals.filter((g) => g.group === 'milestone' || g.goalType === 'milestone').forEach((g) => {
      milestoneTarget += g.target || 0;
      milestoneAccumulated += g.totalBought || 0;
    });
    const milestoneProgressPercent = milestoneTarget > 0 ? Math.min(100, Math.round((milestoneAccumulated / milestoneTarget) * 100)) : 0;

    const existingIndex = (db.history || []).findIndex(
      (h) => h.date === timeStr || (h.timestamp && Math.abs(h.timestamp - now.getTime()) < 3600000)
    );
    let newHistory = [...(db.history || [])];
    const newEntry = {
      date: timeStr,
      netWorth,
      totalAssets,
      totalDebts,
      totalInflow,
      totalOutflow,
      netCashFlow,
      debtProgressPercent,
      dcaProgressPercent,
      runwayPercent,
      milestoneProgressPercent,
      timestamp: now.getTime(),
    };
    if (existingIndex !== -1) {
      newHistory[existingIndex] = newEntry;
    } else {
      newHistory.push(newEntry);
    }

    const updatedDb: DatabaseState = {
      ...db,
      lastUpdate: timeStr,
      history: newHistory,
    };

    // Instant local commit
    setDb(updatedDb);
    triggerBackgroundSync(updatedDb, true);

    // Fast UI button feedback (no 5s blocking)
    setTimeout(() => {
      setIsSyncing(false);
    }, 500);
  };

  // JSON Export / Import
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = (userDisplay || 'user').replace(/[^a-zA-Z0-9]/g, '_');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ThapTaiSan_${safeName}_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          const newDb = { ...db, ...parsed };
          setDb(newDb);
          triggerBackgroundSync(newDb, true);
          alert('✓ Đã khôi phục dữ liệu tức thì và đang đồng bộ ngầm lên Google Drive!');
        }
      } catch (err) {
        alert('Lỗi: Định dạng file JSON không hợp lệ!');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen pb-16 font-sans overflow-x-hidden">
      <AuthModal isOpen={showAuthModal} onLogin={handleLogin} />

      {/* Fixed Header Top Bar - ALWAYS Permanently Pinned at Top */}
      <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <Header
            currentTab={currentTab}
            onSwitchTab={setCurrentTab}
            isPrivacyMode={isPrivacyMode}
            onTogglePrivacy={handleTogglePrivacy}
            userDisplay={userDisplay}
            onExportJSON={handleExportJSON}
            onImportJSON={handleImportJSON}
            onLogout={handleLogout}
            cloudSyncStatus={cloudSyncStatus}
          />
        </div>
      </header>

      {/* Main Content Area - 100% Fluid & Fully Responsive with top offset for fixed header */}
      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pt-[74px] sm:pt-26 lg:pt-20 pb-8 sm:pb-12">
        {currentTab === 'pyramid' && (
          <TabPyramid
            db={db}
            isPrivacyMode={isPrivacyMode}
            onUpdateAsset={handleUpdateAsset}
            onRemoveAsset={handleRemoveAsset}
            onSyncDrive={handleSyncDrive}
            isSyncing={isSyncing}
          />
        )}

        {currentTab === 'debts' && (
          <TabDebts
            db={db}
            isPrivacyMode={isPrivacyMode}
            onUpdateDebt={handleUpdateDebt}
            onRemoveDebt={handleRemoveDebt}
            onUpdateIncome={handleUpdateIncome}
          />
        )}

        {currentTab === 'goals' && (
          <TabGoals
            db={db}
            isPrivacyMode={isPrivacyMode}
            onUpdateGoal={handleUpdateGoal}
            onRemoveGoal={handleRemoveGoal}
            onUpdateAssetDirectly={handleUpdateAsset}
            onUpdateDebtDirectly={handleUpdateDebt}
          />
        )}
      </main>
    </div>
  );
}
