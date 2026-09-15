import React, { useState, useEffect, useRef } from 'react';
import { DatabaseState, Asset, Debt, Goal } from './types';
import {
  DEFAULT_DATABASE_STATE,
  loadCloudData,
  saveCloudData,
} from './utils/storage';
import { normalizeAccountKey, hashString, getCurrentTimestampVN, getDbTimestamp } from './utils/format';
import { recordRegisteredAccount, getRegisteredAccountsList } from './utils/faceIdEngine';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { FixedBottomNav } from './components/FixedBottomNav';
import { TabPyramid } from './components/TabPyramid';
import { TabDebts } from './components/TabDebts';
import { TabGoals } from './components/TabGoals';
import { PyramidLogo } from './components/PyramidLogo';
import { EmailReportModal } from './components/EmailReportModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SmartExcelModal } from './components/SmartExcelModal';
import { exportAssetsToExcel } from './utils/excelEngine';
import { EmailScheduleSettings } from './types';
import { Lock, ScanFace, LogIn } from 'lucide-react';

// Thuật toán đối soát dữ liệu đa thiết bị (Timestamp-based Conflict Resolution)
function reconcileUserData(
  cloudData?: DatabaseState | null,
  localData?: DatabaseState | null
): { data: DatabaseState; shouldUploadToCloud: boolean } {
  if (!cloudData && !localData) {
    return { data: DEFAULT_DATABASE_STATE, shouldUploadToCloud: false };
  }
  if (!cloudData && localData) {
    return { data: localData, shouldUploadToCloud: true };
  }
  if (cloudData && !localData) {
    return { data: cloudData, shouldUploadToCloud: false };
  }
  const cloudTime = getDbTimestamp(cloudData);
  const localTime = getDbTimestamp(localData);

  if (cloudTime > localTime) {
    // Cloud mới hơn (do vừa chỉnh trên điện thoại/máy tính khác) -> Cập nhật Local theo Cloud
    return { data: cloudData!, shouldUploadToCloud: false };
  } else if (localTime > cloudTime) {
    // Local mới hơn -> Giữ Local và cần đẩy lên Cloud
    return { data: localData!, shouldUploadToCloud: true };
  } else {
    // Cùng thời gian -> Ưu tiên Cloud
    return { data: cloudData!, shouldUploadToCloud: false };
  }
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<'pyramid' | 'debts' | 'goals'>('pyramid');
  const [db, setDb] = useState<DatabaseState>(DEFAULT_DATABASE_STATE);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('thaptaisan_privacy_mode') === '1';
  });

  const [currentAccountKey, setCurrentAccountKey] = useState<string>('');
  const [userDisplay, setUserDisplay] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(true);
  const [showEmailReportModal, setShowEmailReportModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showSmartExcelModal, setShowSmartExcelModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  // Cloud root memory cache - nạp ngay từ local cache nếu có để kiểm tra trong 0.001s
  const [cloudRoot, setCloudRoot] = useState<{
    passwords: Record<string, string>;
    users: Record<string, DatabaseState>;
  }>(() => {
    try {
      const cached = localStorage.getItem('thaptaisan_cloud_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          passwords: parsed.passwords || {},
          users: parsed.users || {},
        };
      }
    } catch (e) {}
    return { passwords: {}, users: {} };
  });

  // Refs for background debounce sync & lifecycle exit auto-save
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBackgroundSavingRef = useRef<boolean>(false);
  const pendingDbRef = useRef<DatabaseState | null>(null);
  const currentAccountKeyRef = useRef<string>('');
  const cloudRootRef = useRef(cloudRoot);
  const dbRef = useRef(db);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    currentAccountKeyRef.current = currentAccountKey;
  }, [currentAccountKey]);

  useEffect(() => {
    cloudRootRef.current = cloudRoot;
  }, [cloudRoot]);

  // Tự động đồng bộ ngầm khi thoát, ẩn tab, chuyển app trên điện thoại hoặc đóng trình duyệt
  useEffect(() => {
    const handleAutoSync = () => {
      const targetKey = currentAccountKeyRef.current;
      const currentDb = pendingDbRef.current || dbRef.current;
      if (targetKey && currentDb && (currentDb.assets?.length > 0 || currentDb.debts?.length > 0 || currentDb.goals?.length > 0 || currentDb.salaryIncome > 0)) {
        const updatedCloud = {
          ...cloudRootRef.current,
          users: {
            ...cloudRootRef.current.users,
            [targetKey]: currentDb,
          },
        };
        saveCloudData(updatedCloud, true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAutoSync();
      }
    };

    window.addEventListener('pagehide', handleAutoSync);
    window.addEventListener('beforeunload', handleAutoSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handleAutoSync);
      window.removeEventListener('beforeunload', handleAutoSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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

  // Face ID Biometric Unlock Handler - ĐỒNG BỘ 2 CHIỀU CHUẨN XÁC THEO THỜI GIAN
  const handleFaceIdUnlock = async (accountName?: string): Promise<boolean> => {
    const savedAccount =
      accountName ||
      localStorage.getItem('thaptaisan_faceid_account') ||
      localStorage.getItem('thaptaisan_saved_account') ||
      localStorage.getItem('thaptaisan_active_account') ||
      '';

    if (!savedAccount) return false;

    const accKey = normalizeAccountKey(savedAccount);
    const localSavedStr = localStorage.getItem(`thaptaisan_local_${accKey}`);
    let localData: DatabaseState | null = null;
    if (localSavedStr) {
      try {
        localData = JSON.parse(localSavedStr);
      } catch (e) {
        console.error('Error parsing local cache for Face ID:', e);
      }
    }
    const cloudData = cloudRootRef.current.users?.[accKey];
    const { data: bestData, shouldUploadToCloud } = reconcileUserData(cloudData, localData);

    localStorage.setItem('thaptaisan_saved_account', savedAccount);
    localStorage.setItem('thaptaisan_faceid_account', savedAccount);
    localStorage.setItem('thaptaisan_active_account', savedAccount);
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(bestData));
    recordRegisteredAccount(savedAccount);

    // 1. Vào App ngay lập tức với bản dữ liệu tối ưu nhất
    setupUserSession(savedAccount, accKey, bestData);
    setCurrentTab('pyramid');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 2. Tải bản Cloud mới nhất từ Google Drive và đối soát lại
    setCloudSyncStatus('syncing');
    loadCloudData().then((fetched) => {
      if (fetched) {
        setCloudRoot(fetched);
        const freshCloudUser = fetched.users?.[accKey];
        const currentLocalStr = localStorage.getItem(`thaptaisan_local_${accKey}`);
        const currentLocal = currentLocalStr ? JSON.parse(currentLocalStr) : bestData;
        const reconciled = reconcileUserData(freshCloudUser, currentLocal);

        if (reconciled.data !== currentLocal) {
          setDb({
            ...DEFAULT_DATABASE_STATE,
            ...reconciled.data,
            assets: reconciled.data.assets || [],
            debts: reconciled.data.debts || [],
            goals: reconciled.data.goals || [],
            history: reconciled.data.history || [],
          });
          localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(reconciled.data));
        }

        if (reconciled.shouldUploadToCloud) {
          const latestPayload = {
            ...fetched,
            users: {
              ...fetched.users,
              [accKey]: reconciled.data,
            },
          };
          saveCloudData(latestPayload).then((ok) => setCloudSyncStatus(ok ? 'synced' : 'offline'));
        } else {
          setCloudSyncStatus('synced');
        }
      } else {
        setCloudSyncStatus('offline');
      }
    });

    return true;
  };

  const handleLogin = async (
    rawAccount: string,
    pass: string,
    remember: boolean
  ): Promise<{ success: boolean; reason?: string }> => {
    const accKey = normalizeAccountKey(rawAccount);
    const hashed = await hashString(pass);

    // 1. Xác thực tức thì từ Local / RAM Cache (< 0.05s)
    const localSavedStr = localStorage.getItem(`thaptaisan_local_${accKey}`);
    const localPassHash = localStorage.getItem(`thaptaisan_pass_${accKey}`);
    const registeredList = getRegisteredAccountsList();
    const isKnownLocally = registeredList.some(
      (a) => normalizeAccountKey(a) === accKey
    );
    const currentMemoryCloud = cloudRootRef.current;
    const knownCloudPass = currentMemoryCloud.passwords?.[accKey];

    const isMatch =
      (localPassHash && (localPassHash === hashed || localPassHash === pass)) ||
      (knownCloudPass && (knownCloudPass === hashed || knownCloudPass === pass)) ||
      (localStorage.getItem('thaptaisan_saved_account')?.trim().toLowerCase() === rawAccount.trim().toLowerCase() &&
        localStorage.getItem('thaptaisan_saved_pass') === pass);

    if (isMatch) {
      let localData: DatabaseState | null = null;
      if (localSavedStr) {
        try {
          localData = JSON.parse(localSavedStr);
        } catch (e) {}
      }
      const { data: userData, shouldUploadToCloud } = reconcileUserData(
        currentMemoryCloud.users?.[accKey],
        localData
      );

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
      localStorage.setItem(`thaptaisan_pass_${accKey}`, hashed);
      localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(userData));
      recordRegisteredAccount(rawAccount);

      // Mở màn hình chính ngay lập tức
      setupUserSession(rawAccount, accKey, userData);
      setCurrentTab('pyramid');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Đồng bộ ngầm với Google Drive và giải quyết xung đột
      setCloudSyncStatus('syncing');
      loadCloudData().then((fetched) => {
        if (fetched) {
          setCloudRoot(fetched);
          const freshCloudUser = fetched.users?.[accKey];
          const currentLocalStr = localStorage.getItem(`thaptaisan_local_${accKey}`);
          const currentLocal = currentLocalStr ? JSON.parse(currentLocalStr) : userData;
          const reconciled = reconcileUserData(freshCloudUser, currentLocal);

          if (reconciled.data !== currentLocal) {
            setDb({
              ...DEFAULT_DATABASE_STATE,
              ...reconciled.data,
              assets: reconciled.data.assets || [],
              debts: reconciled.data.debts || [],
              goals: reconciled.data.goals || [],
              history: reconciled.data.history || [],
            });
            localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(reconciled.data));
          }

          if (reconciled.shouldUploadToCloud) {
            const latestPayload = {
              ...fetched,
              users: {
                ...fetched.users,
                [accKey]: reconciled.data,
              },
            };
            saveCloudData(latestPayload).then((ok) => setCloudSyncStatus(ok ? 'synced' : 'offline'));
          } else {
            setCloudSyncStatus('synced');
          }
        } else {
          setCloudSyncStatus('offline');
        }
      });

      return { success: true };
    }

    // Nếu thông tin đã biết nhưng sai mật khẩu -> Báo lỗi ngay lập tức
    if (
      (localPassHash && localPassHash !== hashed && localPassHash !== pass) ||
      (knownCloudPass && knownCloudPass !== hashed && knownCloudPass !== pass)
    ) {
      return {
        success: false,
        reason: 'Mật khẩu không chính xác. Vui lòng thử lại!',
      };
    }

    // 2. Fallback: Nếu là tài khoản hoàn toàn mới trên thiết bị này và chưa có trong cache
    setCloudSyncStatus('syncing');
    let latestCloud = currentMemoryCloud;
    const fetched = await loadCloudData();
    if (fetched) {
      latestCloud = fetched;
      setCloudRoot(fetched);
      setCloudSyncStatus('synced');
    } else {
      setCloudSyncStatus('offline');
    }

    if (!latestCloud.passwords) latestCloud.passwords = {};
    if (!latestCloud.users) latestCloud.users = {};

    // Nếu tài khoản không tồn tại ở cả cloud lẫn máy
    if (!latestCloud.passwords[accKey] && !isKnownLocally && !localSavedStr) {
      return {
        success: false,
        reason: 'Tài khoản chưa tồn tại trên hệ thống. Vui lòng chuyển sang tab Đăng Ký để tạo tài khoản và cài đặt Face ID!',
      };
    }

    // Kiểm tra mật khẩu từ cloud
    if (latestCloud.passwords[accKey]) {
      const savedHash = latestCloud.passwords[accKey];
      if (savedHash !== hashed && savedHash !== pass) {
        return {
          success: false,
          reason: 'Mật khẩu không chính xác. Vui lòng thử lại!',
        };
      }
    }

    let fallbackLocal: DatabaseState | null = null;
    if (localSavedStr) {
      try {
        fallbackLocal = JSON.parse(localSavedStr);
      } catch (e) {}
    }
    const { data: userData } = reconcileUserData(latestCloud.users[accKey], fallbackLocal);

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
    localStorage.setItem(`thaptaisan_pass_${accKey}`, hashed);
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(userData));
    recordRegisteredAccount(rawAccount);

    setupUserSession(rawAccount, accKey, userData);
    setCurrentTab('pyramid');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return { success: true };
  };

  const handleRegister = async (
    rawAccount: string,
    pass: string,
    remember: boolean
  ): Promise<{ success: boolean; reason?: string }> => {
    const accKey = normalizeAccountKey(rawAccount);
    const hashed = await hashString(pass);
    const now = Date.now();

    const initialUserData: DatabaseState = {
      ...DEFAULT_DATABASE_STATE,
      lastUpdate: getCurrentTimestampVN(),
      updatedAtTimestamp: now,
    };

    // Lưu ngay cục bộ để vào App lập tức (< 0.05s)
    localStorage.setItem(`thaptaisan_pass_${accKey}`, hashed);
    localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(initialUserData));
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
    recordRegisteredAccount(rawAccount);

    // Mở màn hình chính ngay lập tức
    setupUserSession(rawAccount, accKey, initialUserData);
    setCurrentTab('pyramid');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Đồng bộ tài khoản mới lên Google Drive chạy ngầm (non-blocking)
    setCloudSyncStatus('syncing');
    loadCloudData().then((fetched) => {
      const latest = fetched || cloudRootRef.current || { passwords: {}, users: {} };
      if (!latest.passwords) latest.passwords = {};
      if (!latest.users) latest.users = {};
      latest.passwords[accKey] = hashed;
      latest.users[accKey] = initialUserData;
      setCloudRoot(latest);
      saveCloudData(latest).then((ok) => {
        setCloudSyncStatus(ok ? 'synced' : 'offline');
      });
    });

    return { success: true };
  };

  const handleLogout = async () => {
    // Tự động đồng bộ dữ liệu mới nhất lên Cloud trước khi đăng xuất
    const targetKey = currentAccountKeyRef.current;
    const currentDb = pendingDbRef.current || dbRef.current;
    if (targetKey && currentDb) {
      setCloudSyncStatus('syncing');
      const updatedCloud = {
        ...cloudRootRef.current,
        users: {
          ...cloudRootRef.current.users,
          [targetKey]: currentDb,
        },
      };
      await saveCloudData(updatedCloud, true);
      setCloudSyncStatus('synced');
    }

    // Xóa phiên làm việc hiện tại
    localStorage.removeItem('thaptaisan_active_account');
    localStorage.removeItem('thaptaisan_saved_pass');
    setUserDisplay('');
    setCurrentAccountKey('');
    currentAccountKeyRef.current = '';
    // Đưa giao diện về trạng thái mặc định sạch để bảo vệ tính riêng tư
    setDb(DEFAULT_DATABASE_STATE);
    // Mở màn hình đăng nhập
    setShowAuthModal(true);
  };

  // Đổi mật khẩu từ bên ngoài (khi chưa đăng nhập / quên mật khẩu)
  const handleResetPassword = async (
    rawAccount: string,
    newPass: string
  ): Promise<{ success: boolean; reason?: string }> => {
    const accKey = normalizeAccountKey(rawAccount);
    const hashed = await hashString(newPass);

    // Cập nhật pass hash local
    localStorage.setItem(`thaptaisan_pass_${accKey}`, hashed);
    localStorage.setItem('thaptaisan_saved_account', rawAccount);
    localStorage.removeItem('thaptaisan_saved_pass');
    recordRegisteredAccount(rawAccount);

    // Cập nhật cloud root
    setCloudSyncStatus('syncing');
    const latest = cloudRootRef.current || { passwords: {}, users: {} };
    if (!latest.passwords) latest.passwords = {};
    latest.passwords[accKey] = hashed;
    setCloudRoot(latest);
    saveCloudData(latest).then((ok) => {
      setCloudSyncStatus(ok ? 'synced' : 'offline');
    });

    return { success: true };
  };

  // Đổi mật khẩu từ bên trong ứng dụng (khi đã đăng nhập)
  const handleChangePasswordInside = async (
    oldPass: string,
    newPass: string
  ): Promise<{ success: boolean; reason?: string }> => {
    const rawAccount = userDisplay || localStorage.getItem('thaptaisan_active_account') || '';
    if (!rawAccount) {
      return { success: false, reason: 'Chưa xác định được tài khoản đang đăng nhập' };
    }
    const accKey = normalizeAccountKey(rawAccount);
    const oldHashed = await hashString(oldPass);

    // Kiểm tra mật khẩu cũ
    const localPassHash = localStorage.getItem(`thaptaisan_pass_${accKey}`);
    const cloudPassHash = cloudRootRef.current?.passwords?.[accKey];
    const savedPass = localStorage.getItem('thaptaisan_saved_pass');

    const isOldCorrect =
      (localPassHash && (localPassHash === oldHashed || localPassHash === oldPass)) ||
      (cloudPassHash && (cloudPassHash === oldHashed || cloudPassHash === oldPass)) ||
      (savedPass && savedPass === oldPass);

    if (!isOldCorrect) {
      return { success: false, reason: 'Mật khẩu hiện tại không chính xác!' };
    }

    const newHashed = await hashString(newPass);
    localStorage.setItem(`thaptaisan_pass_${accKey}`, newHashed);
    localStorage.setItem('thaptaisan_saved_account', rawAccount);
    localStorage.removeItem('thaptaisan_saved_pass');

    // Đồng bộ lên cloud ngầm
    setCloudSyncStatus('syncing');
    const latest = cloudRootRef.current || { passwords: {}, users: {} };
    if (!latest.passwords) latest.passwords = {};
    latest.passwords[accKey] = newHashed;
    setCloudRoot(latest);
    saveCloudData(latest).then((ok) => {
      setCloudSyncStatus(ok ? 'synced' : 'offline');
    });

    return { success: true };
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
    setCloudSyncStatus('syncing');
    const accKey = currentAccountKeyRef.current;
    if (!accKey) {
      setIsSyncing(false);
      setCloudSyncStatus('synced');
      return;
    }

    try {
      const fetched = await loadCloudData();
      if (fetched) {
        setCloudRoot(fetched);
        const cloudUserData = fetched.users?.[accKey];
        const localSavedStr = localStorage.getItem(`thaptaisan_local_${accKey}`);
        let localUserData: DatabaseState | null = null;
        if (localSavedStr) {
          try {
            localUserData = JSON.parse(localSavedStr);
          } catch (e) {}
        }
        if (!localUserData) localUserData = db;

        const reconciled = reconcileUserData(cloudUserData, localUserData);

        setDb({
          ...DEFAULT_DATABASE_STATE,
          ...reconciled.data,
          assets: reconciled.data.assets || [],
          debts: reconciled.data.debts || [],
          goals: reconciled.data.goals || [],
          history: reconciled.data.history || [],
        });
        localStorage.setItem(`thaptaisan_local_${accKey}`, JSON.stringify(reconciled.data));

        if (reconciled.shouldUploadToCloud) {
          const latestPayload = {
            ...fetched,
            users: {
              ...fetched.users,
              [accKey]: reconciled.data,
            },
          };
          await saveCloudData(latestPayload);
        }
        setCloudSyncStatus('synced');
      } else {
        const newTimestamp = getCurrentTimestampVN();
        const updatedDb = { ...db, lastUpdate: newTimestamp, updatedAtTimestamp: Date.now() };
        setDb(updatedDb);
        triggerBackgroundSync(updatedDb, true);
      }
    } catch (err) {
      console.warn('Sync drive failed:', err);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
      }, 600);
    }
  };

  // State mutation actions (instant state update + silent async sync + timestamp tracking)
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
      const now = Date.now();
      const newDb = {
        ...prev,
        assets: newAssets,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveAsset = (id: number) => {
    setDb((prev) => {
      const newAssets = prev.assets.filter((a) => a.id !== id);
      const now = Date.now();
      const newDb = {
        ...prev,
        assets: newAssets,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
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
      const now = Date.now();
      const newDb = {
        ...prev,
        debts: newDebts,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveDebt = (id: number) => {
    setDb((prev) => {
      const newDebts = prev.debts.filter((d) => d.id !== id);
      const now = Date.now();
      const newDb = {
        ...prev,
        debts: newDebts,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleUpdateIncome = (salary: number, other: number) => {
    setDb((prev) => {
      const now = Date.now();
      const newDb = {
        ...prev,
        salaryIncome: salary,
        otherIncome: other,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
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
      const now = Date.now();
      const newDb = {
        ...prev,
        goals: newGoals,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleRemoveGoal = (id: number) => {
    setDb((prev) => {
      const newGoals = prev.goals.filter((g) => g.id !== id);
      const now = Date.now();
      const newDb = {
        ...prev,
        goals: newGoals,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  const handleReloginAfterChangePass = () => {
    setShowChangePasswordModal(false);
    handleLogout();
  };

  const handleExportExcel = () => {
    exportAssetsToExcel(db, userDisplay);
  };

  const handleImportDataFromExcel = (
    data: {
      assets: Omit<Asset, 'id'>[];
      debts: Omit<Debt, 'id'>[];
      goals: Omit<Goal, 'id'>[];
      salaryIncome?: number;
      otherIncome?: number;
    },
    mode: 'append' | 'replace'
  ) => {
    setDb((prev) => {
      let updatedAssets: Asset[];
      let updatedDebts: Debt[];
      let updatedGoals: Goal[];

      if (mode === 'replace') {
        updatedAssets =
          data.assets.length > 0
            ? data.assets.map((item, idx) => ({
                ...item,
                id: Date.now() + idx,
              }))
            : prev.assets;

        updatedDebts =
          data.debts.length > 0
            ? data.debts.map((item, idx) => ({
                ...item,
                id: Date.now() + 1000 + idx,
              }))
            : prev.debts;

        updatedGoals =
          data.goals.length > 0
            ? data.goals.map((item, idx) => ({
                ...item,
                id: Date.now() + 2000 + idx,
              }))
            : prev.goals;
      } else {
        // Mode Append
        const existingAssetIds = new Set(prev.assets.map((a) => a.id));
        let nextAssetId = Date.now();
        const formattedNewAssets: Asset[] = data.assets.map((item) => {
          while (existingAssetIds.has(nextAssetId)) nextAssetId++;
          existingAssetIds.add(nextAssetId);
          return { ...item, id: nextAssetId };
        });
        updatedAssets = [...prev.assets, ...formattedNewAssets];

        const existingDebtIds = new Set(prev.debts.map((d) => d.id));
        let nextDebtId = Date.now() + 1000;
        const formattedNewDebts: Debt[] = data.debts.map((item) => {
          while (existingDebtIds.has(nextDebtId)) nextDebtId++;
          existingDebtIds.add(nextDebtId);
          return { ...item, id: nextDebtId };
        });
        updatedDebts = [...prev.debts, ...formattedNewDebts];

        const existingGoalIds = new Set(prev.goals.map((g) => g.id));
        let nextGoalId = Date.now() + 2000;
        const formattedNewGoals: Goal[] = data.goals.map((item) => {
          while (existingGoalIds.has(nextGoalId)) nextGoalId++;
          existingGoalIds.add(nextGoalId);
          return { ...item, id: nextGoalId };
        });
        updatedGoals = [...prev.goals, ...formattedNewGoals];
      }

      const now = Date.now();
      const newDb: DatabaseState = {
        ...prev,
        assets: updatedAssets,
        debts: updatedDebts,
        goals: updatedGoals,
        salaryIncome:
          data.salaryIncome !== undefined && data.salaryIncome > 0 ? data.salaryIncome : prev.salaryIncome,
        otherIncome:
          data.otherIncome !== undefined && data.otherIncome > 0 ? data.otherIncome : prev.otherIncome,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb, true);
      return newDb;
    });
  };

  const handleSaveEmailSchedule = (newSchedule: EmailScheduleSettings) => {
    setDb((prev) => {
      const now = Date.now();
      const newDb = {
        ...prev,
        emailSchedule: newSchedule,
        lastUpdate: getCurrentTimestampVN(),
        updatedAtTimestamp: now,
      };
      triggerBackgroundSync(newDb);
      return newDb;
    });
  };

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen pb-24 sm:pb-28 font-sans overflow-x-hidden">
      <AuthModal
        isOpen={showAuthModal}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onResetPassword={handleResetPassword}
        onFaceIdUnlock={handleFaceIdUnlock}
        onClose={userDisplay ? () => setShowAuthModal(false) : undefined}
      />

      {/* Modal Đổi mật khẩu bên trong ứng dụng */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        accountName={userDisplay}
        onClose={() => setShowChangePasswordModal(false)}
        onChangePassword={handleChangePasswordInside}
        onSuccessRelogin={handleReloginAfterChangePass}
      />

      {/* Modal Cài đặt Lịch Gửi Email Báo Cáo Tự Động */}
      <EmailReportModal
        isOpen={showEmailReportModal}
        onClose={() => setShowEmailReportModal(false)}
        db={db}
        userDisplay={userDisplay}
        onSaveSchedule={handleSaveEmailSchedule}
      />

      {/* Modal Trợ Lý Excel Thông Minh (AI Smart Excel) */}
      <SmartExcelModal
        isOpen={showSmartExcelModal}
        currentAssetsCount={db.assets.length}
        currentDebtsCount={db.debts.length}
        currentGoalsCount={db.goals.length}
        onClose={() => setShowSmartExcelModal(false)}
        onImportData={handleImportDataFromExcel}
      />

      {/* When user closes modal without logging in: Show clean exit/locked screen */}
      {!userDisplay && !showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-lg text-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
          <div className="w-16 h-16 bg-white/10 rounded-2xl p-2.5 flex items-center justify-center mb-4 border border-white/20 shadow-2xl backdrop-blur-md relative">
            <PyramidLogo className="w-full h-full" />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs shadow-xs">
              <Lock className="w-3 h-3" />
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white mb-1.5">
            Ứng Dụng Đang Khóa
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
            Phiên làm việc đã đóng để bảo vệ dữ liệu tài chính. Vui lòng đăng nhập hoặc xác thực sinh trắc học để tiếp tục.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-xs">
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng Nhập / Mở Khóa</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Sticky */}
      <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <Header
            currentTab={currentTab}
            onSwitchTab={setCurrentTab}
            isPrivacyMode={isPrivacyMode}
            onTogglePrivacy={handleTogglePrivacy}
            userDisplay={userDisplay}
            onOpenImportExcel={() => setShowSmartExcelModal(true)}
            onExportExcel={handleExportExcel}
            onLogout={handleLogout}
            cloudSyncStatus={cloudSyncStatus}
            onSyncDrive={handleSyncDrive}
            isSyncing={isSyncing}
            lastUpdate={db.lastUpdate || getCurrentTimestampVN()}
            onOpenEmailReport={() => setShowEmailReportModal(true)}
            onOpenChangePassword={() => setShowChangePasswordModal(true)}
          />
        </div>
      </header>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pt-[62px] sm:pt-22 pb-6">
        {currentTab === 'pyramid' && (
          <TabPyramid
            db={db}
            isPrivacyMode={isPrivacyMode}
            onUpdateAsset={handleUpdateAsset}
            onRemoveAsset={handleRemoveAsset}
            onSyncDrive={handleSyncDrive}
            isSyncing={isSyncing}
            cloudSyncStatus={cloudSyncStatus}
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

      {/* Fixed Bottom Navigation (Mobile + Tablet + Desktop Dock) */}
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
