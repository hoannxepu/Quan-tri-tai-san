import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  Eye,
  EyeOff,
  Layers,
  Scale,
  Target,
  CheckCircle2,
  CloudOff,
  RotateCw,
  LogOut,
  Clock,
  ScanFace,
  CloudUpload,
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
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Real-time Digital Clock State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format real-time clock string: HH:mm:ss • DD/MM/YYYY
  const timeString = currentTime.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const dateString = currentTime.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
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
        setShowUserMenu(false);
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
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0 min-w-0">
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white p-0.5 sm:p-1 shadow-xs border border-slate-200/90 flex items-center justify-center shrink-0">
            <PyramidLogo className="w-full h-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="font-black text-xs sm:text-base text-slate-900 tracking-tight block leading-tight truncate">
                Tháp Tài Sản
              </span>
              <span className="text-[7.5px] sm:text-[10px] bg-emerald-100 text-emerald-800 px-1 sm:px-1.5 py-0.2 rounded font-bold shrink-0">
                v5.2
              </span>
            </div>
            <span className="hidden sm:block text-[10px] sm:text-[11px] text-slate-500 font-medium truncate leading-none mt-0.5">
              Hoạch Định & Quản Trị
            </span>
          </div>
        </div>

        {/* Center: REAL-TIME DIGITAL CLOCK */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200/80 rounded-xl transition shadow-2xs shrink-0">
          <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse shrink-0" />
          <div className="flex items-center space-x-1 font-mono text-[11px] sm:text-xs font-bold text-slate-800">
            <span className="tracking-tight">{timeString}</span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium hidden sm:inline">{dateString}</span>
          </div>
        </div>

        {/* Right Action Cluster: Drive Save Button, Privacy Eye, User, Logout */}
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

          {/* Backup & Restore (Desktop) */}
          <div className="hidden lg:flex items-center space-x-1">
            <button
              onClick={onExportJSON}
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1.5 rounded-xl transition cursor-pointer"
              title="Tải file JSON dự phòng về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sao lưu</span>
            </button>

            <label
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1.5 rounded-xl cursor-pointer transition"
              title="Khôi phục dữ liệu từ file JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Phục hồi</span>
              <input type="file" accept=".json" onChange={onImportJSON} className="hidden" />
            </label>
          </div>

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

          {/* User Profile Avatar with Dropdown Menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200/80 p-0.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer shrink-0"
              title={`Tài khoản: ${userDisplay || 'Người dùng'}`}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-black text-[10px] shadow-xs shrink-0">
                {(userDisplay || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:inline truncate max-w-[80px]">{userDisplay}</span>
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 top-9 sm:top-10 z-50 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 text-xs text-slate-700 space-y-1">
                <div className="px-3.5 py-2 border-b border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium">Đang đăng nhập:</div>
                  <div className="font-bold text-slate-900 truncate">{userDisplay || 'Người dùng'}</div>
                </div>

                {/* Face ID Settings Toggle */}
                <div className="px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 cursor-pointer" onClick={handleToggleFaceId}>
                  <div className="flex items-center space-x-2">
                    <ScanFace className={`w-4 h-4 ${faceIdActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="font-semibold text-slate-700">Mở khóa Face ID</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      faceIdActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {faceIdActive ? 'Bật' : 'Tắt'}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onExportJSON();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sao lưu file JSON</span>
                  </button>
                  <label className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Phục hồi file JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        setShowUserMenu(false);
                        onImportJSON(e);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-rose-50 flex items-center space-x-2 text-rose-600 font-bold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất / Đổi tài khoản</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Direct Logout Button */}
          <button
            onClick={onLogout}
            className="flex items-center space-x-1 text-[10px] sm:text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl cursor-pointer transition active:scale-95 shrink-0"
            title="Đăng xuất khỏi tài khoản"
          >
            <LogOut className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>Thoát</span>
          </button>
        </div>
      </div>
    </header>
  );
};
