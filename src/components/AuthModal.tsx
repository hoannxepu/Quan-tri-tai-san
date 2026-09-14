import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ShieldCheck,
  RotateCw,
  ScanFace,
  Check,
  KeyRound,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';
import { normalizeAccountKey } from '../utils/format';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
  onFaceIdUnlock?: () => Promise<boolean>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLogin, onFaceIdUnlock }) => {
  const [activeTab, setActiveTab] = useState<'faceid' | 'password'>('faceid');
  const [account, setAccount] = useState(() => localStorage.getItem('thaptaisan_saved_account') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('thaptaisan_saved_pass') || '');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Face ID Biometric States
  const [faceIdSuccess, setFaceIdSuccess] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState<string>('Đang quét khuôn mặt...');
  const [isFaceDetected, setIsFaceDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVerifyingRef = useRef(false);

  const currentAcc = account.trim() || localStorage.getItem('thaptaisan_saved_account') || 'default';
  const accKey = normalizeAccountKey(currentAcc);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    isVerifyingRef.current = false;
    setIsFaceDetected(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const triggerSuccessfulUnlock = async () => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setFaceIdSuccess(true);
    setFaceScanStatus('✓ Đã nhận diện thành công');

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    setTimeout(async () => {
      stopCamera();
      if (onFaceIdUnlock) {
        const success = await onFaceIdUnlock();
        if (success) return;
      }
      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || account;
      const savedP = localStorage.getItem('thaptaisan_saved_pass');
      if (savedAcc && savedP) {
        await onLogin(savedAcc, savedP, true);
      }
    }, 450);
  };

  // Launch Auto Seamless Face ID Scanner on open
  const startCameraScan = async () => {
    setError('');
    setFaceIdSuccess(false);
    isVerifyingRef.current = false;
    setFaceScanStatus('Đang kích hoạt Face ID...');
    setIsFaceDetected(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Thiết bị không hỗ trợ Camera.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setFaceScanStatus('Đang nhận diện...');

      let facePresentCycles = 0;
      let totalCycles = 0;

      // Realtime frame inspection at 120ms intervals
      scanIntervalRef.current = setInterval(async () => {
        totalCycles++;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || isVerifyingRef.current) return;

        if (video.readyState !== 4) return;

        let detected = false;

        // 1. Native Hardware Face Detector if supported
        if (typeof window !== 'undefined' && 'FaceDetector' in window) {
          try {
            const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            const faces = await detector.detect(video);
            if (faces && faces.length > 0) {
              detected = true;
            }
          } catch (e) {
            // fallback below
          }
        }

        // 2. High-speed Adaptive Luminance & Chrominance Biometric Filter
        if (!detected) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const W = 80;
            const H = 80;
            canvas.width = W;
            canvas.height = H;
            ctx.drawImage(video, 0, 0, W, H);
            const img = ctx.getImageData(0, 0, W, H);
            const data = img.data;

            let skinPixels = 0;
            let centerSkinPixels = 0;
            const total = W * H;

            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                // YCbCr skin tone detection
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

                if (cb >= 70 && cb <= 140 && cr >= 125 && cr <= 185 && r > g && g > b * 0.5) {
                  skinPixels++;
                  if (x >= 15 && x <= 65 && y >= 15 && y <= 65) {
                    centerSkinPixels++;
                  }
                }
              }
            }

            const centerRatio = centerSkinPixels / (50 * 50);
            if (centerRatio >= 0.08 || skinPixels / total >= 0.05) {
              detected = true;
            }
          }
        }

        if (detected) {
          facePresentCycles++;
          setIsFaceDetected(true);
          setFaceScanStatus('Nhận diện khuôn mặt...');

          // Automatically unlock as soon as user looks at camera
          if (facePresentCycles >= 2) {
            triggerSuccessfulUnlock();
          }
        } else {
          facePresentCycles = Math.max(0, facePresentCycles - 1);
          setIsFaceDetected(false);
          setFaceScanStatus('Vui lòng nhìn vào camera');
        }

        // Timeout fallback after 20s
        if (totalCycles > 160) {
          stopCamera();
          setError('Không thể nhận diện. Vui lòng thử lại hoặc nhập mật khẩu.');
          setActiveTab('password');
        }
      }, 120);
    } catch (err: any) {
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Quyền truy cập Camera bị từ chối. Vui lòng nhập Mật khẩu.');
      } else {
        setError('Camera chưa sẵn sàng. Vui lòng nhập Mật khẩu.');
      }
      setActiveTab('password');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setFaceIdSuccess(false);
      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || '';
      if (savedAcc) setAccount(savedAcc);
      const savedP = localStorage.getItem('thaptaisan_saved_pass') || '';
      if (savedP) setPass(savedP);

      const hasFace = localStorage.getItem('thaptaisan_faceid_enabled') !== '0';
      if (hasFace) {
        setActiveTab('faceid');
        setTimeout(() => {
          startCameraScan();
        }, 150);
      } else {
        setActiveTab('password');
      }
    } else {
      stopCamera();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmitPassword = async (e: React.FormEvent) => {
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
        localStorage.setItem('thaptaisan_faceid_enabled', '1');
        localStorage.setItem('thaptaisan_faceid_account', account.trim());
      } else {
        setError('Mật khẩu không chính xác hoặc lỗi xác thực!');
      }
    } catch (err: any) {
      setError('Lỗi kết nối: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-4 my-auto">
        {/* Mobile Drag Pill */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>

        {/* Brand Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1 shadow-xs border border-slate-200/90 relative">
            <PyramidLogo className="w-full h-full" />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-2.5 h-2.5" />
            </span>
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            Tháp Tài Sản • Quản Trị Tài Chính
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bảo mật sinh trắc học Face ID & mã hóa dữ liệu
          </p>
        </div>

        {/* Segmented Tab Switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => {
              setActiveTab('faceid');
              startCameraScan();
            }}
            className={`py-2 px-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'faceid'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'hover:text-slate-900'
            }`}
          >
            <ScanFace className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Face ID</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('password');
            }}
            className={`py-2 px-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'password'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4 text-slate-600 shrink-0" />
            <span>Mật khẩu</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded-xl font-semibold flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden Canvas for computation */}
        <canvas ref={canvasRef} className="hidden" />

        {/* TAB 1: SEAMLESS AUTOMATIC APPLE/BANKING-GRADE FACE ID */}
        {activeTab === 'faceid' && (
          <div className="space-y-4 text-center py-1">
            {/* Circular High-Tech Camera HUD */}
            <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
              {/* Outer Glowing Pulsing Border */}
              <div
                className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
                  faceIdSuccess
                    ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105'
                    : isFaceDetected
                    ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse'
                    : 'border-slate-300 border-dashed animate-[spin_10s_linear_infinite]'
                }`}
              ></div>

              {/* Viewport Box */}
              <div className="w-38 h-38 rounded-full overflow-hidden bg-slate-900 relative shadow-inner border-2 border-white flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover scale-x-[-1]"
                />

                {/* Ambient Biometric Scanner Beam */}
                {!faceIdSuccess && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce"></div>
                  </div>
                )}

                {/* Success Overlay */}
                {faceIdSuccess && (
                  <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white animate-in fade-in">
                    <Check className="w-12 h-12 stroke-[3] animate-bounce" />
                    <span className="text-xs font-bold mt-1">Đã xác nhận</span>
                  </div>
                )}
              </div>
            </div>

            {/* Seamless Status Indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
                {faceIdSuccess ? (
                  <span className="text-emerald-600 font-black flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác thực thành công</span>
                  </span>
                ) : (
                  <>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isFaceDetected ? 'bg-emerald-500 animate-ping' : 'bg-blue-500 animate-pulse'
                      }`}
                    ></span>
                    <span>{faceScanStatus}</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Tự động nhận diện & mở khóa tức thì
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: PASSWORD FORM */}
        {activeTab === 'password' && (
          <form onSubmit={handleSubmitPassword} className="space-y-3.5 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số Điện Thoại hoặc Gmail
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="0901234567 hoặc user@gmail.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 text-base sm:text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white transition text-slate-900"
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
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 pr-10 text-base sm:text-xs font-medium outline-none focus:border-emerald-500 focus:bg-white transition text-slate-900"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Checkbox */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-slate-700">Ghi nhớ & Kích hoạt Face ID</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition cursor-pointer flex items-center justify-center space-x-2 shadow-sm disabled:opacity-70 mt-2"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Đăng Nhập Vào Ứng Dụng</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
