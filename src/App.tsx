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
import { FixedBottomNav } from './components/FixedBottomNav';
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
  const [showAuthModal, setShowAuthModal] = useState<boolean>(true);
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

  // On App Mount: Always show login screen / Face ID lock so user explicitly clicks to unlock
  useEffect(() => {
    const initApp = async () => {
      // Fetch cloud root in background to be ready for instant verification
      loadCloudData().then((cloudData) => {
        if (cloudData) {
          setCloudRoot(cloudData);
        }
      });

      // Always require explicit Face ID tap or login click upon reopening the app
      setShowAuthModal(true);
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

  // Face ID Biometric Unlock Handler
  const handleFaceIdUnlock = async (): Promise<boolean> => {
    const savedAccount =
      localStorage.getItem('thaptaisan_faceid_account') ||
      localStorage.getItem('thaptaisan_saved_account') ||
      localStorage.getItem('thaptaisan_active_account') ||
      '';

    if (!savedAccount) return false;

    const accKey = normalizeAccountKey(savedAccount);
    const localSaved = localStorage.getItem(`thaptaisan_local_${accKey}`);
    let userData: DatabaseState = DEFAULT_DATABASE_STATE;

    if (localSaved) {
      try {
        userData = JSON.parse(localSaved);
      } catch (e) {
        console.error('Error parsing local cache for Face ID:', e);
      }
    } else if (cloudRoot.users?.[accKey]) {
      userData = cloudRoot.users[accKey];
    }

    setupUserSession(savedAccount, accKey, userData);
    setCurrentTab('pyramid');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
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
      localStorage.setItem('thaptaisan_faceid_enabled', '1');
      localStorage.setItem('thaptaisan_faceid_account', rawAccount);
    } else {
      localStorage.setItem('thaptaisan_saved_account', rawAccount);
      localStorage.removeItem('thaptaisan_saved_pass');
    }
    localStorage.setItem('thaptaisan_active_account', rawAccount);
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(userData));

    setupUserSession(rawAccount, accKey, userData);
    setCurrentTab('pyramid');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleLogout = () => {
    if (confirm('Bạn có muốn đăng xuất khỏi tài khoản hiện tại?')) {
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

  // Manual Explicit Google Drive Sync Action (Clickable from Header in any tab)
  const handleSyncDrive = async () => {
    setIsSyncing(true);
    triggerBackgroundSync(db, true);
    setTimeout(() => {
      setIsSyncing(false);
    }, 1200);
  };

  // State mutation actions (instant state update + silent async sync)
  const handleUpdateAsset = (asset: Asset) => {
    setDb((prev) => {
      const index = prev.assets.findIndex((a) => a.id === asset.id);
      let newAssets: Asset[];
      if (index >= 0) {
        newAssets = [...prev.assets];
        newAssets[index] = asset;
      } else {
        newAssets = [...prev.assets, asset];
      }
      const newDb = { ...prev, assets: newAssets, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveAsset = (id: number) => {
    setDb((prev) => {
      const newAssets = prev.assets.filter((a) => a.id !== id);
      const newDb = { ...prev, assets: newAssets, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleUpdateDebt = (debt: Debt) => {
    setDb((prev) => {
      const index = prev.debts.findIndex((d) => d.id === debt.id);
      let newDebts: Debt[];
      if (index >= 0) {
        newDebts = [...prev.debts];
        newDebts[index] = debt;
      } else {
        newDebts = [...prev.debts, debt];
      }
      const newDb = { ...prev, debts: newDebts, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveDebt = (id: number) => {
    setDb((prev) => {
      const newDebts = prev.debts.filter((d) => d.id !== id);
      const newDb = { ...prev, debts: newDebts, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleUpdateIncome = (salary: number, other: number) => {
    setDb((prev) => {
      const newDb = { ...prev, salaryIncome: salary, otherIncome: other, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleUpdateGoal = (goal: Goal) => {
    setDb((prev) => {
      const index = prev.goals.findIndex((g) => g.id === goal.id);
      let newGoals: Goal[];
      if (index >= 0) {
        newGoals = [...prev.goals];
        newGoals[index] = goal;
      } else {
        newGoals = [...prev.goals, goal];
      }
      const newDb = { ...prev, goals: newGoals, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveGoal = (id: number) => {
    setDb((prev) => {
      const newGoals = prev.goals.filter((g) => g.id !== id);
      const newDb = { ...prev, goals: newGoals, lastUpdate: new Date().toLocaleDateString('vi-VN') };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `ThapTaiSan_Backup_${userDisplay || 'User'}_${new Date().toISOString().split('T')[0]}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
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
    <div className="bg-slate-50 text-slate-800 min-h-screen pb-24 sm:pb-28 font-sans overflow-x-hidden">
      <AuthModal
        isOpen={showAuthModal}
        onLogin={handleLogin}
        onFaceIdUnlock={handleFaceIdUnlock}
      />

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
            onSyncDrive={handleSyncDrive}
            isSyncing={isSyncing}
          />
        </div>
      </header>

      {/* Main Content Area - Responsive with top offset for fixed header */}
      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pt-[62px] sm:pt-22 pb-6">
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

      {/* Fixed Bottom Navigation Bar - Easy to reach & clear */}
      <FixedBottomNav
        currentTab={currentTab}
        onSwitchTab={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        assetCount={db.assets.length}
        debtCount={db.debts.length}
        goalCount={db.goals.length}
      />
    </div>
  );
}
