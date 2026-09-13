import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, Eye, EyeOff, Layers, Scale, Target, CheckCircle2, CloudOff, RotateCw, LogOut } from 'lucide-react';
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
}) => {
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="w-full">
      {/* Top Bar */}
      <div className="h-11 sm:h-16 flex items-center justify-between gap-1 sm:gap-2">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0 min-w-0">
          <div className="w-6.5 h-6.5 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white p-0.5 sm:p-1 shadow-xs border border-slate-200/90 flex items-center justify-center shrink-0">
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

        {/* Center: Desktop-only Navigation Tabs */}
        <nav className="hidden lg:flex space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold shrink-0">
          <button
            onClick={() => onSwitchTab('pyramid')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              currentTab === 'pyramid'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tháp Tài Sản</span>
          </button>
          <button
            onClick={() => onSwitchTab('debts')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              currentTab === 'debts'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-rose-600" />
            <span>Dòng Tiền & Nợ</span>
          </button>
          <button
            onClick={() => onSwitchTab('goals')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              currentTab === 'goals'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-blue-600" />
            <span>Mục Tiêu Tài Chính</span>
          </button>
        </nav>

        {/* Right: Actions, User & Logout (Guaranteed 100% visible on ANY mobile screen) */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {/* Cloud Sync Status Indicator */}
          {cloudSyncStatus === 'syncing' && (
            <div
              className="flex items-center space-x-1 text-[9px] sm:text-xs bg-blue-50 text-blue-700 border border-blue-200/80 font-bold px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition animate-pulse shrink-0"
              title="Đang đồng bộ ngầm lên Google Drive..."
            >
              <RotateCw className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 animate-spin text-blue-600" />
              <span className="hidden md:inline">Lưu Drive...</span>
            </div>
          )}
          {cloudSyncStatus === 'synced' && (
            <div
              className="flex items-center space-x-1 text-[9px] sm:text-xs bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition shrink-0"
              title="Dữ liệu đã lưu an toàn trên Máy & Google Drive"
            >
              <CheckCircle2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Drive ✓</span>
            </div>
          )}
          {cloudSyncStatus === 'offline' && (
            <div
              className="flex items-center space-x-1 text-[9px] sm:text-xs bg-amber-50 text-amber-800 border border-amber-200/80 font-bold px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition shrink-0"
              title="Đã lưu an toàn trong máy"
            >
              <CloudOff className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-amber-600" />
              <span className="hidden md:inline">Đã lưu máy</span>
            </div>
          )}

          {/* Desktop/Tablet Backup & Restore Buttons */}
          <div className="hidden md:flex items-center space-x-1">
            <button
              onClick={onExportJSON}
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer"
              title="Tải file dữ liệu dự phòng về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sao lưu</span>
            </button>

            <label
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-xl cursor-pointer transition"
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
            className="w-6.5 h-6.5 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer shrink-0"
            title={isPrivacyMode ? 'Hiện số tiền' : 'Ẩn số tiền'}
          >
            {isPrivacyMode ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
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
              <span className="hidden md:inline truncate max-w-[85px]">{userDisplay}</span>
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 top-9 sm:top-10 z-50 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-xs text-slate-700">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium">Đang đăng nhập:</div>
                  <div className="font-bold text-slate-800 truncate">{userDisplay || 'Người dùng'}</div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onExportJSON();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sao lưu file JSON</span>
                  </button>
                  <label className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer">
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
                    className="w-full text-left px-3 py-2 hover:bg-rose-50 flex items-center space-x-2 text-rose-600 font-bold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất / Đổi tài khoản</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Direct Logout Button (ALWAYS 100% VISIBLE & PROMINENT) */}
          <button
            onClick={onLogout}
            className="flex items-center space-x-1 text-[10px] sm:text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 sm:px-2.5 sm:py-1.5 rounded-md sm:rounded-xl cursor-pointer transition active:scale-95 shrink-0"
            title="Đăng xuất khỏi tài khoản"
          >
            <LogOut className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>Thoát</span>
          </button>
        </div>
      </div>

      {/* Mobile/Tablet Navigation Tabs (Compact 3-Segment Control) */}
      <nav className="lg:hidden w-full pb-1 pt-0.5">
        <div className="grid grid-cols-3 gap-1 bg-slate-100/90 p-0.5 rounded-lg text-slate-600">
          <button
            onClick={() => onSwitchTab('pyramid')}
            className={`flex items-center justify-center space-x-1 py-1 px-0.5 rounded-md transition cursor-pointer text-[10px] sm:text-xs font-bold tracking-tight ${
              currentTab === 'pyramid'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'hover:text-slate-900 text-slate-600'
            }`}
          >
            <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
            <span className="whitespace-nowrap">Tháp Tài Sản</span>
          </button>
          <button
            onClick={() => onSwitchTab('debts')}
            className={`flex items-center justify-center space-x-1 py-1 px-0.5 rounded-md transition cursor-pointer text-[10px] sm:text-xs font-bold tracking-tight ${
              currentTab === 'debts'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'hover:text-slate-900 text-slate-600'
            }`}
          >
            <Scale className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-600 shrink-0" />
            <span className="whitespace-nowrap">Dòng Tiền & Nợ</span>
          </button>
          <button
            onClick={() => onSwitchTab('goals')}
            className={`flex items-center justify-center space-x-1 py-1 px-0.5 rounded-md transition cursor-pointer text-[10px] sm:text-xs font-bold tracking-tight ${
              currentTab === 'goals'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'hover:text-slate-900 text-slate-600'
            }`}
          >
            <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 shrink-0" />
            <span className="whitespace-nowrap">Mục Tiêu</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
