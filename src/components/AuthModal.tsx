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
  Activity,
  Sliders,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  LogIn,
  ArrowRight,
  Shield,
  Info,
  X,
  ArrowLeft,
} from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';
import { normalizeAccountKey } from '../utils/format';
import {
  FaceIdPipeline,
  saveFaceDescriptor,
  getSavedFaceDescriptor,
  deleteFaceDescriptor,
  hasFaceIdEnrolled,
  verifyFaceDescriptor,
  DEFAULT_FACE_SIMILARITY_THRESHOLD,
  FaceLandmarkPoint,
  getRegisteredAccountsList,
  recordRegisteredAccount,
} from '../utils/faceIdEngine';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<{ success: boolean; reason?: string } | boolean>;
  onRegister?: (account: string, pass: string, remember: boolean) => Promise<{ success: boolean; reason?: string } | boolean>;
  onFaceIdUnlock?: (accountName?: string) => Promise<boolean>;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onLogin,
  onRegister,
  onFaceIdUnlock,
  onClose,
}) => {
  // Default to password login as requested
  const [activeTab, setActiveTab] = useState<'login' | 'faceid' | 'register'>('login');
  
  // Registration Sub-step: 'info' (nhập số đt/pass) -> 'camera' (quét Face ID bắt buộc)
  const [regStep, setRegStep] = useState<'info' | 'camera'>('info');

  // Login inputs
  const [account, setAccount] = useState(() => localStorage.getItem('thaptaisan_saved_account') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('thaptaisan_saved_pass') || '');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);

  // Register inputs
  const [regAccount, setRegAccount] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  // Status & threshold
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [threshold, setThreshold] = useState<number>(DEFAULT_FACE_SIMILARITY_THRESHOLD);
  const [showSettings, setShowSettings] = useState(false);

  // Biometric Real-time State
  const [faceIdSuccess, setFaceIdSuccess] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState<string>('Khởi tạo Face ID...');
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [currentEAR, setCurrentEAR] = useState<number>(0);
  const [livenessPassed, setLivenessPassed] = useState<boolean>(false);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [enrollProgress, setEnrollProgress] = useState<number>(0);

  // Pipeline refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVerifyingRef = useRef(false);
  const pipelineRef = useRef<FaceIdPipeline>(new FaceIdPipeline());

  const currentAcc = account.trim() || localStorage.getItem('thaptaisan_saved_account') || '';
  const accKey = normalizeAccountKey(currentAcc);
  const isEnrolled = currentAcc ? hasFaceIdEnrolled(accKey) : false;
  const registeredList = getRegisteredAccountsList();

  // Stop camera tracks cleanly
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
    setLivenessPassed(false);
    setSimilarityScore(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Draw HUD Landmark Mesh Overlay
  const drawFaceMeshHUD = (
    landmarks: FaceLandmarkPoint[] | undefined,
    width: number,
    height: number,
    isMatched: boolean,
    isLive: boolean
  ) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!landmarks || landmarks.length === 0) return;

    // Draw landmark points
    ctx.fillStyle = isMatched
      ? 'rgba(16, 185, 129, 0.85)'
      : isLive
      ? 'rgba(59, 130, 246, 0.8)'
      : 'rgba(245, 158, 11, 0.75)';

    const keyIndices = [33, 133, 159, 145, 362, 263, 386, 374, 1, 152, 10, 234, 454, 61, 291];
    for (const idx of keyIndices) {
      const p = landmarks[idx] || landmarks[idx % landmarks.length];
      if (p) {
        ctx.beginPath();
        const flippedX = width - p.x;
        ctx.arc(flippedX, p.y, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Connect eye contours
    ctx.strokeStyle = isMatched ? 'rgba(16, 185, 129, 0.6)' : 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 1.2;

    const drawContour = (indices: number[]) => {
      ctx.beginPath();
      for (let i = 0; i < indices.length; i++) {
        const p = landmarks[indices[i]];
        if (p) {
          const x = width - p.x;
          if (i === 0) ctx.moveTo(x, p.y);
          else ctx.lineTo(x, p.y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    };

    drawContour([33, 159, 158, 133, 153, 145]);
    drawContour([362, 386, 385, 263, 380, 374]);
  };

  const triggerSuccessfulUnlock = async (targetAccount?: string) => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setFaceIdSuccess(true);
    setFaceScanStatus('✓ Nhận diện thành công • Đang mở khóa');

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    setTimeout(async () => {
      stopCamera();
      const accountToUnlock = targetAccount || currentAcc || localStorage.getItem('thaptaisan_saved_account') || '';
      if (onFaceIdUnlock) {
        const success = await onFaceIdUnlock(accountToUnlock);
        if (success) return;
      }
      const savedP = localStorage.getItem('thaptaisan_saved_pass');
      if (accountToUnlock && savedP) {
        await onLogin(accountToUnlock, savedP, true);
      }
    }, 260);
  };

  // Start Camera and Face ID Recognition Cycle
  const startCameraScan = async (mode: 'verify' | 'register_enroll' = 'verify', targetAcc?: string) => {
    setError('');
    setSuccessMsg('');
    setFaceIdSuccess(false);
    isVerifyingRef.current = false;
    setEnrollProgress(0);
    setFaceScanStatus('Đang kích hoạt camera & AI...');
    setIsFaceDetected(false);
    setLivenessPassed(false);
    setSimilarityScore(null);
    pipelineRef.current.resetLiveness();

    const scanAccount = targetAcc || (mode === 'register_enroll' ? regAccount.trim() : currentAcc);
    const targetKey = normalizeAccountKey(scanAccount);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ Camera.');
      }

      // Reuse existing active stream if available
      let stream = streamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        streamRef.current = stream;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await pipelineRef.current.initialize();

      setFaceScanStatus(
        mode === 'register_enroll'
          ? 'Nhìn thẳng vào camera và chớp mắt...'
          : 'Vui lòng nhìn thẳng vào camera...'
      );

      let consecutiveMatches = 0;
      let totalCycles = 0;
      const collectedVectors: number[][] = [];

      scanIntervalRef.current = setInterval(async () => {
        totalCycles++;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || isVerifyingRef.current) return;
        if (video.readyState < 2) return;

        const res = await pipelineRef.current.processFrame(video, canvas);
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        if (!res.hasFace || !res.quality?.isValid) {
          setIsFaceDetected(false);
          drawFaceMeshHUD(undefined, vw, vh, false, false);
          setFaceScanStatus(res.quality?.statusMessage || 'Không phát hiện khuôn mặt');
          return;
        }

        setIsFaceDetected(true);
        const ear = res.liveness?.currentEAR || 0;
        setCurrentEAR(ear);
        const isLive = !!res.liveness?.isLive;
        setLivenessPassed(isLive);

        // --- MODE A: REGISTRATION ENROLLMENT (Đăng ký tài khoản mới + Face ID) ---
        if (mode === 'register_enroll') {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, isLive);

          if (!isLive) {
            setFaceScanStatus('Vui lòng chớp mắt hoặc nghiêng nhẹ đầu để xác minh người thật');
            return;
          }

          if (res.descriptor) {
            collectedVectors.push(res.descriptor);
            const progress = Math.min(100, Math.round((collectedVectors.length / 8) * 100));
            setEnrollProgress(progress);
            setFaceScanStatus(`Đang trích xuất mẫu khuôn mặt (${progress}%)...`);

            if (collectedVectors.length >= 8) {
              isVerifyingRef.current = true;
              if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
              }

              // Compute average 512-d normalized vector
              const finalVector = new Array(512).fill(0);
              for (const vec of collectedVectors) {
                for (let i = 0; i < 512; i++) {
                  finalVector[i] += vec[i];
                }
              }
              let sumSq = 0;
              for (let i = 0; i < 512; i++) {
                finalVector[i] /= collectedVectors.length;
                sumSq += finalVector[i] * finalVector[i];
              }
              const norm = Math.sqrt(sumSq) || 1;
              for (let i = 0; i < 512; i++) {
                finalVector[i] /= norm;
              }

              // 1. Save Face ID Vector
              saveFaceDescriptor(targetKey, finalVector);
              recordRegisteredAccount(scanAccount);

              setFaceIdSuccess(true);
              setFaceScanStatus('✓ Đăng ký tài khoản & Face ID thành công!');

              // 2. Perform Account Registration in Backend/App
              setTimeout(async () => {
                stopCamera();
                if (onRegister) {
                  await onRegister(scanAccount, regPass, true);
                } else {
                  await onLogin(scanAccount, regPass, true);
                }
              }, 600);
            }
          }
          return;
        }

        // --- MODE B: VERIFICATION UNLOCK (Xác thực đăng nhập Face ID) ---
        const enrolled = hasFaceIdEnrolled(targetKey);
        if (!enrolled) {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, isLive);
          setFaceScanStatus(`Tài khoản "${scanAccount}" chưa cài đặt Face ID`);
          return;
        }

        if (!isLive) {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, false);
          setFaceScanStatus('Vui lòng chớp mắt hoặc xoay nhẹ đầu để xác minh người thật');
          return;
        }

        if (res.descriptor) {
          const verify = verifyFaceDescriptor(targetKey, res.descriptor, threshold, true, isLive);
          setSimilarityScore(verify.similarity);
          const simPct = (verify.similarity * 100).toFixed(1);
          drawFaceMeshHUD(res.landmarks, vw, vh, verify.matched, true);

          if (verify.matched) {
            consecutiveMatches++;
            setFaceScanStatus(`Độ khớp: ${simPct}% (Hợp lệ ✓)`);
            if (consecutiveMatches >= 2) {
              triggerSuccessfulUnlock(scanAccount);
            }
          } else {
            consecutiveMatches = 0;
            setFaceScanStatus(`Không khớp: ${simPct}% (Cần ≥ ${(threshold * 100).toFixed(0)}%)`);
          }
        }

        // Auto timeout fallback after 25s
        if (totalCycles > 200) {
          stopCamera();
          setError('Không thể nhận diện Face ID. Vui lòng đăng nhập bằng Mật khẩu.');
          setActiveTab('login');
        }
      }, 120);
    } catch (err: any) {
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền hoặc đăng nhập bằng Mật khẩu.');
      } else {
        setError('Không thể mở Camera: ' + (err?.message || 'Vui lòng kiểm tra thiết bị.'));
      }
      setActiveTab('login');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccessMsg('');
      setFaceIdSuccess(false);
      setRegStep('info');

      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || '';
      if (savedAcc) setAccount(savedAcc);
      const savedP = localStorage.getItem('thaptaisan_saved_pass') || '';
      if (savedP) setPass(savedP);

      const enrolled = savedAcc ? hasFaceIdEnrolled(normalizeAccountKey(savedAcc)) : false;
      const registeredList = getRegisteredAccountsList();

      if (registeredList.length === 0 && !savedAcc) {
        // First time user: direct to Register
        setActiveTab('register');
      } else if (enrolled) {
        setActiveTab('faceid');
        setTimeout(() => {
          startCameraScan('verify', savedAcc);
        }, 150);
      } else {
        setActiveTab('login');
      }
    } else {
      stopCamera();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Login Submit with validation
  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanAccount = account.trim();
    if (!cleanAccount || !pass.trim()) {
      setError('Vui lòng nhập đầy đủ Số điện thoại / Gmail và Mật khẩu!');
      return;
    }

    setLoading(true);
    try {
      const res = await onLogin(cleanAccount, pass.trim(), remember);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      const reason = typeof res === 'object' && res.reason ? res.reason : undefined;

      if (!isSuccess) {
        setError(reason || 'Tài khoản chưa tồn tại hoặc Mật khẩu không chính xác!');
      }
    } catch (err: any) {
      setError('Lỗi kết nối: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setLoading(false);
    }
  };

  // Step 1 of Registration: Validate Info and advance to Face ID Scan
  const handleProceedToRegisterFace = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanAccount = regAccount.trim();
    if (!cleanAccount) {
      setError('Vui lòng nhập Số điện thoại hoặc Gmail!');
      return;
    }

    if (regPass.length < 4) {
      setError('Mật khẩu bảo mật phải có ít nhất 4 ký tự!');
      return;
    }

    if (regPass !== regConfirmPass) {
      setError('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!');
      return;
    }

    // Advance to Camera Face ID Enrollment
    setRegStep('camera');
    setTimeout(() => {
      startCameraScan('register_enroll', cleanAccount);
    }, 150);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-4 my-auto relative">
        {/* Top bar with Close X and Settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            {activeTab !== 'login' ? (
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setError('');
                  setSuccessMsg('');
                  setActiveTab('login');
                }}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
                title="Quay lại Đăng nhập"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition"
                title="Tùy chỉnh ngưỡng nhận diện Face ID"
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Close button X */}
          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              title="Đóng / Thoát ứng dụng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Brand Header */}
        <div className="text-center relative pt-0.5">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1 shadow-xs border border-slate-200/90 relative">
            <PyramidLogo className="w-full h-full" />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-2.5 h-2.5" />
            </span>
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            {activeTab === 'login' && 'Đăng Nhập Tài Khoản'}
            {activeTab === 'faceid' && 'Xác Thực Face ID AI'}
            {activeTab === 'register' && 'Đăng Ký Tài Khoản Mới'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            {activeTab === 'login' && 'Quản trị Tháp Tài Sản Cá Nhân'}
            {activeTab === 'faceid' && 'Xác thực sinh trắc học khuôn mặt'}
            {activeTab === 'register' && 'Bảo vệ dữ liệu tài chính & Face ID'}
          </p>
        </div>

        {/* Optional CV Threshold Settings Drawer */}
        {showSettings && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between font-bold text-slate-800">
              <span className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                <span>Ngưỡng khớp Cosine Similarity:</span>
              </span>
              <span className="font-mono text-blue-700 font-black">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.85"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0.30 (Dễ)</span>
              <span className="text-slate-600 font-semibold">0.55 (Chuẩn khuyến nghị)</span>
              <span>0.85 (Khắt khe)</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded-xl font-semibold flex items-start gap-1.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 rounded-xl font-semibold flex items-center gap-1.5 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Hidden computational canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* VIEW 1: ĐĂNG NHẬP MẬT KHẨU (DEFAULT) */}
        {activeTab === 'login' && (
          <form onSubmit={handleSubmitLogin} className="space-y-3 pt-1">
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
                <span className="font-semibold text-slate-700">Ghi nhớ đăng nhập</span>
              </label>
            </div>

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer flex items-center justify-center space-x-2 shadow-xs disabled:opacity-70 mt-1"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Đang kiểm tra tài khoản...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Đăng Nhập Vào Ứng Dụng</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-2 text-slate-400 text-[11px] font-medium">hoặc tùy chọn</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Dedicated Face ID Login Option Button */}
            <button
              type="button"
              onClick={() => {
                setError('');
                setSuccessMsg('');
                setActiveTab('faceid');
                if (currentAcc && isEnrolled) {
                  startCameraScan('verify', currentAcc);
                }
              }}
              className="w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100/80 active:scale-98 border border-emerald-200 text-emerald-800 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-2xs"
            >
              <ScanFace className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Đăng nhập bằng Face ID</span>
            </button>

            {/* Switch to Register */}
            <div className="text-center pt-2 text-xs text-slate-500">
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setError('');
                  setSuccessMsg('');
                  setRegStep('info');
                  if (account) setRegAccount(account);
                  setActiveTab('register');
                }}
                className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer hover:underline"
              >
                Đăng ký tài khoản mới
              </button>
            </div>
          </form>
        )}

        {/* VIEW 2: FACE ID UNLOCK */}
        {activeTab === 'faceid' && (
          <div className="space-y-3.5 text-center py-1">
            {!isEnrolled ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                  <ScanFace className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    {currentAcc ? `Chưa có Face ID cho "${currentAcc}"` : 'Chưa có tài khoản đăng ký Face ID'}
                  </h4>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Bạn cần đăng ký tài khoản và quét khuôn mặt để sử dụng tính năng mở khóa Face ID.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setRegStep('info');
                      if (currentAcc) setRegAccount(currentAcc);
                      setActiveTab('register');
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Đăng Ký Tài Khoản & Face ID</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setActiveTab('login');
                    }}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold py-2 px-3 rounded-xl text-xs transition cursor-pointer"
                  >
                    Quay lại Đăng nhập bằng Mật khẩu
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Account badge & switcher */}
                <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-slate-500 font-medium">Tài khoản:</span>
                  <span className="font-bold text-slate-800 truncate max-w-[180px]">{currentAcc}</span>
                </div>

                {/* Circular Camera & AI HUD */}
                <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
                  <div
                    className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
                      faceIdSuccess
                        ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.6)] scale-105'
                        : isFaceDetected && livenessPassed
                        ? 'border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.4)]'
                        : isFaceDetected
                        ? 'border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                        : 'border-slate-300 border-dashed animate-[spin_12s_linear_infinite]'
                    }`}
                  ></div>

                  <div className="w-38 h-38 rounded-full overflow-hidden bg-slate-900 relative shadow-inner border-2 border-white flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover scale-x-[-1]"
                    />

                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />

                    {!faceIdSuccess && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce"></div>
                      </div>
                    )}

                    {faceIdSuccess && (
                      <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white animate-in fade-in">
                        <Check className="w-12 h-12 stroke-[3] animate-bounce" />
                        <span className="text-xs font-bold mt-1">Đã mở khóa</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Realtime Metrics */}
                <div className="space-y-2">
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
                            livenessPassed
                              ? 'bg-emerald-500 animate-ping'
                              : isFaceDetected
                              ? 'bg-blue-500 animate-pulse'
                              : 'bg-amber-400'
                          }`}
                        ></span>
                        <span className="truncate max-w-[260px]">{faceScanStatus}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <div
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                        livenessPassed
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <Activity className="w-3 h-3" />
                      <span>{livenessPassed ? 'Liveness ✓' : 'Chớp mắt / Cử động'}</span>
                    </div>

                    {similarityScore !== null && (
                      <div
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          similarityScore >= threshold
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        Khớp: {(similarityScore * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setActiveTab('login');
                      }}
                      className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Quay lại Đăng nhập bằng Mật khẩu</span>
                    </button>

                    <div className="text-center text-[11px] text-slate-500">
                      <button
                        type="button"
                        onClick={() => {
                          stopCamera();
                          setRegAccount(currentAcc);
                          setRegStep('info');
                          setActiveTab('register');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline flex items-center justify-center gap-1 mx-auto"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Đăng ký lại Face ID cho tài khoản này</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* VIEW 3: ĐĂNG KÝ TÀI KHOẢN + BẮT BUỘC QUÉT FACE ID */}
        {activeTab === 'register' && (
          <div className="space-y-3.5 pt-1">
            {regStep === 'info' ? (
              <form onSubmit={handleProceedToRegisterFace} className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[11px] p-2.5 rounded-xl flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Đăng ký tài khoản mới đi kèm bước <strong>quét Face ID AI bắt buộc</strong> để kích hoạt bảo mật sinh trắc học.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số Điện Thoại hoặc Gmail
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="email"
                      value={regAccount}
                      onChange={(e) => setRegAccount(e.target.value)}
                      placeholder="0901234567 hoặc user@gmail.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 text-base sm:text-xs font-medium outline-none focus:border-blue-500 focus:bg-white transition text-slate-900"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tạo Mật Khẩu (ít nhất 4 ký tự)
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 pr-10 text-base sm:text-xs font-medium outline-none focus:border-blue-500 focus:bg-white transition text-slate-900"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    >
                      {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhập Lại Mật Khẩu
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      value={regConfirmPass}
                      onChange={(e) => setRegConfirmPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-9 text-base sm:text-xs font-medium outline-none focus:border-blue-500 focus:bg-white transition text-slate-900"
                    />
                    <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition cursor-pointer flex items-center justify-center space-x-2 shadow-sm mt-2"
                >
                  <ScanFace className="w-4 h-4" />
                  <span>Tiếp Tục Quét Face ID Bắt Buộc</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="text-center pt-2 text-xs text-slate-500">
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setError('');
                      setActiveTab('login');
                    }}
                    className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer hover:underline"
                  >
                    Đăng nhập ngay
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-center py-1">
                <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
                  <div
                    className={`absolute inset-0 rounded-full border-2 transition-all ${
                      enrollProgress >= 100
                        ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                        : 'border-blue-400 border-dashed animate-pulse'
                    }`}
                  ></div>

                  <div className="w-38 h-38 rounded-full overflow-hidden bg-slate-900 relative shadow-inner border-2 border-white flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                    {enrollProgress >= 100 && (
                      <div className="absolute inset-0 bg-emerald-600/90 flex flex-col items-center justify-center text-white animate-in fade-in">
                        <CheckCircle2 className="w-12 h-12 animate-bounce" />
                        <span className="text-xs font-bold mt-1">Đã hoàn tất!</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1 px-4">
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${enrollProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs font-bold text-slate-800">{faceScanStatus}</p>
                  <p className="text-[11px] text-slate-500">
                    {livenessPassed
                      ? 'Giữ khuôn mặt ổn định để lưu Face ID...'
                      : 'Hãy chớp mắt hoặc nghiêng nhẹ đầu để xác thực người thật'}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setRegStep('info');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                  >
                    Quay lại chỉnh sửa thông tin
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
