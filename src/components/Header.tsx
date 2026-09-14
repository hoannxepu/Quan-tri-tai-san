import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  Eye,
  EyeOff,
  RotateCw,
  LogOut,
  Clock,
  ScanFace,
  Menu,
  X,
  ShieldCheck,
  User,
} from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';

interface HeaderProps {
  currentTab: 'pyramid' | 'debts' | 'goals';
  onSwitchTab: (tab: 'pyramid' | 'debts' | 'goals') => void;
  isPrivacyMode: boolean;
  onTogglePrivacy: () => void;
  userDisplay: string;
  onExportJSON: () => void;
  onImportJSON: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
  cloudSyncStatus?: 'synced' | 'syncing' | 'offline';
  onSyncDrive?: () => void;
  isSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSwitchTab,
  isPrivacyMode,
  onTogglePrivacy,
  userDisplay,
  onExportJSON,
  onImportJSON,
  onLogout,
  cloudSyncStatus = 'synced',
  onSyncDrive,
  isSyncing = false,
}) => {
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Real-time Digital Clock State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format real-time clock string: HH:mm:ss
  const timeString = currentTime.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Format full date with 4-digit year: DD/MM/YYYY
  const dateString = currentTime.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Face ID state in localStorage
  const [faceIdActive, setFaceIdActive] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('thaptaisan_faceid_enabled') === '1';
  });

  const handleToggleFaceId = () => {
    const next = !faceIdActive;
    setFaceIdActive(next);
    if (next) {
      localStorage.setItem('thaptaisan_faceid_enabled', '1');
    } else {
      localStorage.removeItem('thaptaisan_faceid_enabled');
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="w-full">
      {/* Top Fixed Header Bar */}
      <div className="h-12 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 min-w-0">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-white p-0.5 sm:p-1 shadow-xs border border-slate-200/90 flex items-center justify-center shrink-0">
            <PyramidLogo className="w-full h-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-black text-xs sm:text-sm md:text-base text-slate-900 tracking-tight block leading-tight truncate">
                Tháp Tài Sản
              </span>
              <span className="text-[7.5px] sm:text-[9.5px] bg-emerald-100 text-emerald-800 px-1 sm:px-1.5 py-0.2 rounded font-bold shrink-0">
                v5.2
              </span>
            </div>
            <span className="hidden md:block text-[10px] text-slate-500 font-medium truncate leading-none mt-0.5">
              Hoạch Định & Quản Trị
            </span>
          </div>
        </div>

        {/* Center: REAL-TIME DIGITAL CLOCK WITH FULL YEAR (HH:mm:ss • DD/MM/YYYY) */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200/80 rounded-lg sm:rounded-xl transition shadow-2xs shrink-0 select-none">
          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 animate-pulse shrink-0" />
          <div className="flex items-center space-x-1 font-mono text-[10px] sm:text-xs font-bold text-slate-800">
            <span className="tracking-tight">{timeString}</span>
            <span className="text-slate-300">•</span>
            <span className="text-[9.5px] sm:text-[11px] text-slate-600 font-medium">{dateString}</span>
          </div>
        </div>

        {/* Right Action Cluster: Drive Save Button, Privacy Eye, 3-Line Menu (Hamburger) */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {/* PROMINENT DRIVE SAVE & SYNC BUTTON (Fixed at top, accessible from any tab) */}
          <button
            type="button"
            onClick={onSyncDrive}
            disabled={isSyncing || cloudSyncStatus === 'syncing'}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs shrink-0 ${
              cloudSyncStatus === 'syncing' || isSyncing
                ? 'bg-blue-600 text-white animate-pulse'
                : cloudSyncStatus === 'synced'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
            title="Lưu dữ liệu ngay lập tức vào máy và đồng bộ lên Google Drive"
          >
            <RotateCw
              className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${
                cloudSyncStatus === 'syncing' || isSyncing ? 'animate-spin' : ''
              }`}
            />
            <span className="hidden xs:inline sm:inline">
              {cloudSyncStatus === 'syncing' || isSyncing ? 'Đang lưu...' : 'Lưu Drive'}
            </span>
            <span className="xs:hidden">Lưu</span>
          </button>

          {/* Privacy Toggle (Eye) */}
          <button
            onClick={onTogglePrivacy}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer shrink-0"
            title={isPrivacyMode ? 'Hiện số tiền' : 'Ẩn số tiền'}
          >
            {isPrivacyMode ? (
              <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500" />
            ) : (
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </button>

          {/* 3-Line Hamburger Menu Button (Thay thế ô cạnh nút thoát bằng 3 gạch, chứa toàn bộ thao tác & nút Thoát) */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 border ${
                showMenu
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
              }`}
              title="Menu thao tác & Thoát"
            >
              {showMenu ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>

            {/* Hamburger Dropdown Action Menu */}
            {showMenu && (
              <div className="absolute right-0 top-9 sm:top-10 z-50 w-60 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 text-xs text-slate-700 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                {/* User Account Info Header */}
                <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0">
                      {(userDisplay || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-400 font-medium">Tài khoản cá nhân:</div>
                      <div className="font-bold text-slate-900 truncate text-xs">{userDisplay || 'Người dùng'}</div>
                    </div>
                  </div>
                </div>

                {/* Face ID Quick Settings Toggle */}
                <div
                  className="px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 cursor-pointer select-none"
                  onClick={handleToggleFaceId}
                >
                  <div className="flex items-center space-x-2">
                    <ScanFace className={`w-4 h-4 ${faceIdActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="font-semibold text-slate-700">Mở khóa Face ID</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      faceIdActive ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {faceIdActive ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </div>

                {/* Backup & Restore Action Buttons */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onExportJSON();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sao lưu file JSON về máy</span>
                  </button>

                  <label className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Phục hồi dữ liệu từ file JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        setShowMenu(false);
                        onImportJSON(e);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Log Out Button (Đưa phần Thoát vào bên trong Menu 3 gạch) */}
                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-rose-50 flex items-center space-x-2 text-rose-600 font-bold cursor-pointer transition rounded-b-xl"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất / Thoát tài khoản</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
