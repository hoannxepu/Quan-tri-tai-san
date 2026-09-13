import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, CloudUpload, ShieldCheck, RotateCw } from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLogin }) => {
  const [account, setAccount] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

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
      if (!success) {
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
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1.5 shadow-xs border border-slate-200/90">
            <PyramidLogo className="w-full h-full" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Tháp Tài Sản 3 Tầng</h2>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Dữ liệu riêng biệt theo tài khoản • Bảo mật SHA-256</span>
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl font-semibold">
            {error}
          </div>
        )}

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

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium text-slate-700">Tự động lưu đăng nhập lần sau</span>
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
                <span>Đăng Nhập / Mở Dữ Liệu Riêng</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
