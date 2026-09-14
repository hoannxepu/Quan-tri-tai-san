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
  Camera,
  Activity,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
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
} from '../utils/faceIdEngine';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
  onFaceIdUnlock?: () => Promise<boolean>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLogin, onFaceIdUnlock }) => {
  const [activeTab, setActiveTab] = useState<'faceid' | 'password' | 'enroll'>('faceid');
  const [account, setAccount] = useState(() => localStorage.getItem('thaptaisan_saved_account') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('thaptaisan_saved_pass') || '');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
  const [enrollSamples, setEnrollSamples] = useState<number[][]>([]);

  // Pipeline refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVerifyingRef = useRef(false);
  const pipelineRef = useRef<FaceIdPipeline>(new FaceIdPipeline());

  const currentAcc = account.trim() || localStorage.getItem('thaptaisan_saved_account') || 'default';
  const accKey = normalizeAccountKey(currentAcc);
  const isEnrolled = hasFaceIdEnrolled(accKey);

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
        // Flip X horizontally to match mirrored video
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

  const triggerSuccessfulUnlock = async () => {
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

  // Start Camera and Face ID Recognition Cycle
  const startCameraScan = async (mode: 'verify' | 'enroll' = 'verify') => {
    setError('');
    setFaceIdSuccess(false);
    isVerifyingRef.current = false;
    setEnrollProgress(0);
    setEnrollSamples([]);
    setFaceScanStatus('Đang kích hoạt camera & AI...');
    setIsFaceDetected(false);
    setLivenessPassed(false);
    setSimilarityScore(null);
    pipelineRef.current.resetLiveness();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ Camera.');
      }

      // Reuse existing stream if still active, otherwise request camera once
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

      // Initialize AI pipeline
      await pipelineRef.current.initialize();

      setFaceScanStatus(
        mode === 'enroll'
          ? 'Nhìn thẳng vào camera để đăng ký...'
          : 'Vui lòng nhìn thẳng vào camera...'
      );

      let consecutiveMatches = 0;
      let totalCycles = 0;
      const collectedEnrollVectors: number[][] = [];

      // Run verification loop at 120ms intervals
      scanIntervalRef.current = setInterval(async () => {
        totalCycles++;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || isVerifyingRef.current) return;

        if (video.readyState < 2) return;

        const res = await pipelineRef.current.processFrame(video, canvas);

        // Update HUD
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

        // --- MODE 1: ENROLLMENT (Đăng ký Face ID) ---
        if (mode === 'enroll') {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, isLive);

          if (!isLive) {
            setFaceScanStatus('Hãy chớp mắt hoặc nghiêng nhẹ đầu để kiểm tra cử động sống...');
            return;
          }

          if (res.descriptor) {
            collectedEnrollVectors.push(res.descriptor);
            const progress = Math.min(100, Math.round((collectedEnrollVectors.length / 8) * 100));
            setEnrollProgress(progress);
            setFaceScanStatus(`Đang trích xuất Vector 512-d (${progress}%)...`);

            if (collectedEnrollVectors.length >= 8) {
              // Average collected vectors and L2 normalize
              const finalVector = new Array(512).fill(0);
              for (const vec of collectedEnrollVectors) {
                for (let i = 0; i < 512; i++) {
                  finalVector[i] += vec[i];
                }
              }
              let sumSq = 0;
              for (let i = 0; i < 512; i++) {
                finalVector[i] /= collectedEnrollVectors.length;
                sumSq += finalVector[i] * finalVector[i];
              }
              const norm = Math.sqrt(sumSq) || 1;
              for (let i = 0; i < 512; i++) {
                finalVector[i] /= norm;
              }

              // Save to account
              saveFaceDescriptor(accKey, finalVector);
              localStorage.setItem('thaptaisan_faceid_account', currentAcc);
              setFaceIdSuccess(true);
              setFaceScanStatus('✓ Đã lưu Face ID thành công!');
              isVerifyingRef.current = true;

              setTimeout(() => {
                stopCamera();
                setActiveTab('faceid');
                startCameraScan('verify');
              }, 1200);
            }
          }
          return;
        }

        // --- MODE 2: VERIFICATION (Xác thực mở khóa) ---
        if (!isEnrolled) {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, isLive);
          setFaceScanStatus('Tài khoản này chưa đăng ký Face ID.');
          return;
        }

        if (!isLive) {
          drawFaceMeshHUD(res.landmarks, vw, vh, false, false);
          setFaceScanStatus('Vui lòng chớp mắt hoặc xoay nhẹ đầu để xác minh người thật');
          return;
        }

        // Compare with registered 512-d descriptor using Cosine Similarity
        if (res.descriptor) {
          const verify = verifyFaceDescriptor(accKey, res.descriptor, threshold, true, isLive);
          setSimilarityScore(verify.similarity);

          const simPct = (verify.similarity * 100).toFixed(1);
          drawFaceMeshHUD(res.landmarks, vw, vh, verify.matched, true);

          if (verify.matched) {
            consecutiveMatches++;
            setFaceScanStatus(`Độ tương đồng: ${simPct}% (Khớp ✓)`);

            if (consecutiveMatches >= 2) {
              triggerSuccessfulUnlock();
            }
          } else {
            consecutiveMatches = 0;
            setFaceScanStatus(`Không khớp: ${simPct}% (Cần ≥ ${(threshold * 100).toFixed(0)}%)`);
          }
        }

        // Auto timeout fallback after 25 seconds
        if (totalCycles > 200) {
          stopCamera();
          setError('Không thể nhận diện Face ID. Vui lòng thử lại hoặc đăng nhập bằng Mật khẩu.');
          setActiveTab('password');
        }
      }, 120);
    } catch (err: any) {
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền hoặc nhập Mật khẩu.');
      } else {
        setError('Không thể mở Camera: ' + (err?.message || 'Vui lòng kiểm tra thiết bị.'));
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

      const enrolled = hasFaceIdEnrolled(normalizeAccountKey(savedAcc || 'default'));
      const faceEnabled = localStorage.getItem('thaptaisan_faceid_enabled') !== '0';

      if (faceEnabled && enrolled) {
        setActiveTab('faceid');
        setTimeout(() => {
          startCameraScan('verify');
        }, 150);
      } else if (!enrolled) {
        setActiveTab('password');
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

  const handleResetFaceId = () => {
    if (confirm(`Bạn có chắc muốn xóa dữ liệu Face ID đã đăng ký của tài khoản "${currentAcc}"?`)) {
      deleteFaceDescriptor(accKey);
      setFaceScanStatus('Đã xóa Face ID.');
      setActiveTab('enroll');
      startCameraScan('enroll');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-4 my-auto relative">
        {/* Mobile Drag Pill */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>

        {/* Brand Header */}
        <div className="text-center relative">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1 shadow-xs border border-slate-200/90 relative">
            <PyramidLogo className="w-full h-full" />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-2.5 h-2.5" />
            </span>
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            Tháp Tài Sản • Bảo Mật Sinh Trắc Học
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Xác thực Face ID AI (512-d Vector & Liveness Anti-spoofing)
          </p>

          {/* Quick Settings Icon */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="absolute top-0 right-0 p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition"
            title="Tùy chỉnh ngưỡng Face ID"
          >
            <Sliders className="w-4 h-4" />
          </button>
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

        {/* Segmented Tab Switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => {
              setActiveTab('faceid');
              if (isEnrolled) {
                startCameraScan('verify');
              } else {
                setActiveTab('enroll');
                startCameraScan('enroll');
              }
            }}
            className={`py-2 px-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'faceid' || activeTab === 'enroll'
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
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded-xl font-semibold flex items-start gap-1.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden computational canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* TAB 1: FACE ID VERIFICATION HUD */}
        {activeTab === 'faceid' && (
          <div className="space-y-3.5 text-center py-1">
            {!isEnrolled ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                  <ScanFace className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">Chưa đăng ký Face ID</h4>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Tài khoản "{currentAcc}" chưa có dữ liệu vector khuôn mặt.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('enroll');
                      startCameraScan('enroll');
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Đăng ký Face ID ngay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setActiveTab('password');
                    }}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold py-2 px-3 rounded-xl text-xs transition cursor-pointer"
                  >
                    Đăng nhập bằng Mật khẩu
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Circular Camera & AI HUD */}
                <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
                  {/* Outer Pulsing Aura */}
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

                  {/* Viewport Box */}
                  <div className="w-38 h-38 rounded-full overflow-hidden bg-slate-900 relative shadow-inner border-2 border-white flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover scale-x-[-1]"
                    />

                    {/* Canvas Mesh Overlay */}
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />

                    {/* Ambient Biometric Beam */}
                    {!faceIdSuccess && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce"></div>
                      </div>
                    )}

                    {/* Success Overlay */}
                    {faceIdSuccess && (
                      <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white animate-in fade-in">
                        <Check className="w-12 h-12 stroke-[3] animate-bounce" />
                        <span className="text-xs font-bold mt-1">Đã mở khóa</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Realtime Metrics */}
                <div className="space-y-1.5">
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

                  {/* Anti-spoofing Liveness & Match Badges */}
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
                        Match: {(similarityScore * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2 text-[11px] text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('enroll');
                        startCameraScan('enroll');
                      }}
                      className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Đăng ký lại Face ID</span>
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={handleResetFaceId}
                      className="text-rose-500 hover:text-rose-700 font-medium cursor-pointer"
                    >
                      Xóa Face ID
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: GUIDED ENROLLMENT (Đăng ký Face ID mới) */}
        {activeTab === 'enroll' && (
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
                    <span className="text-xs font-bold mt-1">Đã đăng ký!</span>
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
                  ? 'Giữ yên để hoàn tất trích xuất Vector 512-d'
                  : 'Hãy chớp mắt hoặc nghiêng nhẹ đầu để vượt qua kiểm tra người thật'}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setActiveTab('faceid');
                }}
                className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                Hủy đăng ký & quay lại
              </button>
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
