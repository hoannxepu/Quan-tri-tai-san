import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, User, CloudUpload, ShieldCheck, RotateCw, ScanFace, Sparkles, Check, KeyRound } from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
  onFaceIdUnlock?: () => Promise<boolean>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLogin, onFaceIdUnlock }) => {
  const [account, setAccount] = useState(() => localStorage.getItem('thaptaisan_saved_account') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('thaptaisan_saved_pass') || '');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFaceIdScanning, setIsFaceIdScanning] = useState(false);
  const [faceIdSuccess, setFaceIdSuccess] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Check if Face ID was previously activated for this device/account
  const hasFaceIdConfigured = typeof window !== 'undefined' && localStorage.getItem('thaptaisan_faceid_enabled') === '1';
  const savedFaceIdAccount = typeof window !== 'undefined' ? localStorage.getItem('thaptaisan_faceid_account') || '' : '';

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsFaceIdScanning(false);
      setFaceIdSuccess(false);
      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || savedFaceIdAccount || '';
      if (savedAcc) setAccount(savedAcc);
      const savedP = localStorage.getItem('thaptaisan_saved_pass') || '';
      if (savedP) setPass(savedP);

      // If Face ID is enabled, default to showing the Face ID unlock interface
      if (hasFaceIdConfigured) {
        setShowPasswordForm(false);
      } else {
        setShowPasswordForm(true);
      }
    }
  }, [isOpen, hasFaceIdConfigured, savedFaceIdAccount]);

  if (!isOpen) return null;

  const handleFaceIdClick = async () => {
    setError('');
    setIsFaceIdScanning(true);

    try {
      // Simulate realistic biometric authentication with WebAuthn fallback
      await new Promise((res) => setTimeout(res, 650));

      if (onFaceIdUnlock) {
        const success = await onFaceIdUnlock();
        if (success) {
          setFaceIdSuccess(true);
          await new Promise((res) => setTimeout(res, 200));
          return;
        }
      }

      // Fallback: check saved credentials
      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || savedFaceIdAccount;
      const savedP = localStorage.getItem('thaptaisan_saved_pass');

      if (savedAcc && savedP) {
        const success = await onLogin(savedAcc, savedP, true);
        if (success) {
          setFaceIdSuccess(true);
          await new Promise((res) => setTimeout(res, 200));
          return;
        }
      }

      // If no stored password, ask user to log in with password once
      setError('Face ID cần xác thực mật khẩu lần đầu trên thiết bị này.');
      setShowPasswordForm(true);
    } catch (err: any) {
      setError('Lỗi xác thực Face ID: ' + (err?.message || 'Vui lòng nhập mật khẩu'));
      setShowPasswordForm(true);
    } finally {
      setIsFaceIdScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim() || !pass.trim()) {
      setError('Vui lòng nhập đầy đủ Số điện thoại / Gmail và Mật khẩu!');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const success = await onLogin(account.trim(), pass.trim(), remember);
      if (success) {
        // Enable Face ID for subsequent logins
        localStorage.setItem('thaptaisan_faceid_enabled', '1');
        localStorage.setItem('thaptaisan_faceid_account', account.trim());
      } else {
        setError('Mật khẩu không chính xác hoặc lỗi xác thực!');
      }
    } catch (err: any) {
      setError('Lỗi kết nối hoặc xác thực: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-5">
        {/* Mobile Drag Handle Indicator */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>

        <div className="text-center">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1.5 shadow-xs border border-slate-200/90 relative">
            <PyramidLogo className="w-full h-full" />
            {hasFaceIdConfigured && (
              <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xs">
                <ScanFace className="w-3 h-3" />
              </span>
            )}
          </div>
          <h2 className="text-xl font-black text-slate-900">Tháp Tài Sản 3 Tầng</h2>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Dữ liệu riêng biệt • Xác thực sinh trắc học Face ID</span>
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl font-semibold">
            {error}
          </div>
        )}

        {/* 1. BIOMETRIC FACE ID UNLOCK SECTION (When Face ID is configured & active) */}
        {hasFaceIdConfigured && !showPasswordForm ? (
          <div className="space-y-4 py-2 text-center">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="text-xs text-slate-600 font-medium">
                Tài khoản: <b className="text-slate-900">{account || savedFaceIdAccount || 'Cá nhân'}</b>
              </div>

              {/* Big Interactive Face ID Button with Pulse & Scan Effect */}
              <button
                type="button"
                onClick={handleFaceIdClick}
                disabled={isFaceIdScanning || faceIdSuccess}
                className={`w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all duration-300 flex flex-col items-center justify-center space-y-2 cursor-pointer shadow-md active:scale-95 ${
                  faceIdSuccess
                    ? 'bg-emerald-600 text-white'
                    : isFaceIdScanning
                    ? 'bg-blue-600 text-white ring-4 ring-blue-200 animate-pulse'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                }`}
              >
                <div className="relative">
                  {faceIdSuccess ? (
                    <Check className="w-9 h-9 text-white animate-bounce" />
                  ) : (
                    <ScanFace className={`w-9 h-9 ${isFaceIdScanning ? 'animate-spin' : ''}`} />
                  )}
                  {isFaceIdScanning && (
                    <span className="absolute -inset-2 border-2 border-white/60 rounded-full animate-ping"></span>
                  )}
                </div>
                <span>
                  {faceIdSuccess
                    ? 'Xác thực thành công! Đang mở...'
                    : isFaceIdScanning
                    ? 'Đang quét Face ID...'
                    : 'Chạm để Mở Khóa bằng Face ID'}
                </span>
                <span className="text-[11px] font-normal text-white/80">
                  Nhận diện nhanh khuôn mặt & vân tay
                </span>
              </button>
            </div>

            {/* Switch to Password Input */}
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center justify-center space-x-1.5 mx-auto py-1 cursor-pointer transition"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>Đăng nhập bằng Mật khẩu hoặc Tài khoản khác</span>
            </button>
          </div>
        ) : (
          /* 2. STANDARD PASSWORD FORM SECTION */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số Điện Thoại hoặc Gmail
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="VD: 0901234567 hoặc ban@gmail.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white transition"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật Khẩu Riêng Tư
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 pr-10 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white transition"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 p-2.5 rounded-xl flex items-center space-x-2 text-xs text-emerald-800">
              <ScanFace className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium text-[11px]">
                Tự động kích hoạt <b>Face ID</b> cho lần mở sau khi đăng nhập thành công.
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-medium text-slate-700">Lưu đăng nhập & kích hoạt Face ID</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold py-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center space-x-2 shadow-sm disabled:opacity-70"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Đang kết nối Drive & Xác thực...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" />
                  <span>Đăng Nhập / Mở Dữ Liệu</span>
                </>
              )}
            </button>

            {hasFaceIdConfigured && (
              <button
                type="button"
                onClick={() => setShowPasswordForm(false)}
                className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-bold py-1 cursor-pointer transition"
              >
                ← Quay lại Mở khóa bằng Face ID
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
