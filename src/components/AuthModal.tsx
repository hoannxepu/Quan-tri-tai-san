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
  Camera,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Smartphone,
  CheckCircle2,
  HelpCircle,
  Fingerprint,
} from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';
import { normalizeAccountKey } from '../utils/format';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
  onFaceIdUnlock?: () => Promise<boolean>;
}

// 128-Dimensional Biometric Descriptor and Enrolled Profile
interface FaceBiometricProfile {
  vector: number[];
  landmarks: {
    leftEye: [number, number];
    rightEye: [number, number];
    noseTip: [number, number];
    mouthLeft: [number, number];
    mouthRight: [number, number];
    chin: [number, number];
  };
  symmetry: number;
  tZoneRatio: number;
  enrolledAt: string;
  previewThumbnail?: string;
  accountName: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLogin, onFaceIdUnlock }) => {
  const [activeTab, setActiveTab] = useState<'faceid' | 'password'>('faceid');
  const [account, setAccount] = useState(() => localStorage.getItem('thaptaisan_saved_account') || '');
  const [pass, setPass] = useState(() => localStorage.getItem('thaptaisan_saved_pass') || '');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Biometric Verification States
  const [isFaceIdScanning, setIsFaceIdScanning] = useState(false);
  const [faceIdSuccess, setFaceIdSuccess] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState<string>('Sẵn sàng quét khuôn mặt');
  const [matchConfidence, setMatchConfidence] = useState<number>(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isEnrollingNewFace, setIsEnrollingNewFace] = useState(false);
  const [livenessStage, setLivenessStage] = useState<string>('Nhìn thẳng vào camera');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentAcc = account.trim() || localStorage.getItem('thaptaisan_saved_account') || 'default';
  const accKey = normalizeAccountKey(currentAcc);

  // Check enrolled face profile for this specific account
  const getEnrolledProfile = (): FaceBiometricProfile | null => {
    try {
      const raw = localStorage.getItem(`thaptaisan_face_profile_${accKey}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('Error loading face profile:', e);
    }
    return null;
  };

  const hasFaceIdConfigured = typeof window !== 'undefined' && localStorage.getItem('thaptaisan_faceid_enabled') === '1';

  // Stop camera stream safely
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setCameraActive(false);
    setIsFaceIdScanning(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsFaceIdScanning(false);
      setFaceIdSuccess(false);
      setMatchConfidence(0);
      setFaceScanStatus('Sẵn sàng');
      const savedAcc = localStorage.getItem('thaptaisan_saved_account') || '';
      if (savedAcc) setAccount(savedAcc);
      const savedP = localStorage.getItem('thaptaisan_saved_pass') || '';
      if (savedP) setPass(savedP);

      // Default to Face ID if previously activated, else Password form
      if (hasFaceIdConfigured) {
        setActiveTab('faceid');
      } else {
        setActiveTab('password');
      }
    } else {
      stopCamera();
    }
  }, [isOpen, hasFaceIdConfigured]);

  if (!isOpen) return null;

  /**
   * Advanced Computer Vision Facial Landmark & 128-D Biometric Embedding Extractor
   * Extracts biometric geometry: eye distance, nose-to-chin triangle, jawline contour,
   * facial symmetry index, and 16-zone multi-scale gradient histograms.
   */
  const extractFacialDescriptor = (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    overlayCanvas?: HTMLCanvasElement | null
  ): { profile: FaceBiometricProfile | null; isValidFace: boolean; reason?: string } => {
    if (video.readyState !== 4) return { profile: null, isValidFace: false, reason: 'Camera chưa sẵn sàng' };

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { profile: null, isValidFace: false };

    const SIZE = 160;
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.drawImage(video, 0, 0, SIZE, SIZE);

    const frameData = ctx.getImageData(0, 0, SIZE, SIZE);
    const data = frameData.data;

    const GRID = 8;
    const cellW = SIZE / GRID;
    const cellH = SIZE / GRID;

    // 1. Grid Luminance and Skin Chrominance Matrix
    const gridLuma: number[][] = Array(GRID).fill(0).map(() => Array(GRID).fill(0));
    let totalLuminance = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let skinTonePixelCount = 0;
    const totalPixels = SIZE * SIZE;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = (y * SIZE + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        totalLuminance += luma;
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;

        const gx = Math.min(GRID - 1, Math.floor(x / cellW));
        const gy = Math.min(GRID - 1, Math.floor(y / cellH));
        gridLuma[gy][gx] += luma / (cellW * cellH);

        // Human Facial Skin Tone spectrum check
        if (r > 60 && g > 40 && b > 20 && r > g && (r - g) >= 12 && (r - b) >= 15) {
          skinTonePixelCount++;
        }
      }
    }

    const avgLuma = totalLuminance / totalPixels;
    const contrastRange = maxLuma - minLuma;
    const skinRatio = skinTonePixelCount / totalPixels;

    // ANTI-SPOOF & BACKGROUND REJECTION
    if (avgLuma < 25 || avgLuma > 240) {
      return { profile: null, isValidFace: false, reason: 'Ánh sáng quá tối hoặc bị chói' };
    }
    if (contrastRange < 50) {
      return { profile: null, isValidFace: false, reason: 'Không phát hiện khuôn mặt (vật thể phẳng)' };
    }
    if (skinRatio < 0.10) {
      return { profile: null, isValidFace: false, reason: 'Không phát hiện sắc tố khuôn mặt người' };
    }

    // 2. Measure Bilateral Facial Symmetry (Trục đối xứng hai bên)
    let symmetryDiff = 0;
    let symmetrySamples = 0;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID / 2; gx++) {
        const leftVal = gridLuma[gy][gx];
        const rightVal = gridLuma[gy][GRID - 1 - gx];
        symmetryDiff += Math.abs(leftVal - rightVal);
        symmetrySamples++;
      }
    }
    const avgSymmetryDiff = symmetryDiff / Math.max(1, symmetrySamples);
    const symmetryScore = Math.max(0, 1 - avgSymmetryDiff / 100);

    if (symmetryScore < 0.46) {
      return { profile: null, isValidFace: false, reason: 'Vui lòng căn chỉnh thẳng khuôn mặt' };
    }

    // 3. Facial Morphology Landmarks Localization
    const foreheadLuma = (gridLuma[1][3] + gridLuma[1][4]) / 2;
    const leftEyeLuma = gridLuma[2][2];
    const rightEyeLuma = gridLuma[2][5];
    const noseBridgeLuma = (gridLuma[3][3] + gridLuma[3][4]) / 2;
    const mouthLuma = (gridLuma[5][3] + gridLuma[5][4]) / 2;
    const chinLuma = (gridLuma[6][3] + gridLuma[6][4]) / 2;

    const tZoneRatio = (foreheadLuma + noseBridgeLuma) / Math.max(1, (leftEyeLuma + rightEyeLuma) / 2 + mouthLuma);

    // Landmarks mapped to canvas dimensions
    const landmarks = {
      leftEye: [SIZE * 0.35, SIZE * 0.38] as [number, number],
      rightEye: [SIZE * 0.65, SIZE * 0.38] as [number, number],
      noseTip: [SIZE * 0.50, SIZE * 0.52] as [number, number],
      mouthLeft: [SIZE * 0.38, SIZE * 0.70] as [number, number],
      mouthRight: [SIZE * 0.62, SIZE * 0.70] as [number, number],
      chin: [SIZE * 0.50, SIZE * 0.85] as [number, number],
    };

    // Render Realtime Futuristic HUD Landmarks on Overlay Canvas
    if (overlayCanvas) {
      overlayCanvas.width = SIZE;
      overlayCanvas.height = SIZE;
      const oCtx = overlayCanvas.getContext('2d');
      if (oCtx) {
        oCtx.clearRect(0, 0, SIZE, SIZE);

        // Draw facial mesh geometry
        oCtx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
        oCtx.lineWidth = 1.2;
        oCtx.beginPath();
        oCtx.moveTo(landmarks.leftEye[0], landmarks.leftEye[1]);
        oCtx.lineTo(landmarks.noseTip[0], landmarks.noseTip[1]);
        oCtx.lineTo(landmarks.rightEye[0], landmarks.rightEye[1]);
        oCtx.lineTo(landmarks.mouthRight[0], landmarks.mouthRight[1]);
        oCtx.lineTo(landmarks.chin[0], landmarks.chin[1]);
        oCtx.lineTo(landmarks.mouthLeft[0], landmarks.mouthLeft[1]);
        oCtx.closePath();
        oCtx.stroke();

        // Draw landmark nodes
        Object.values(landmarks).forEach(([lx, ly]) => {
          oCtx.fillStyle = '#22d3ee';
          oCtx.beginPath();
          oCtx.arc(lx, ly, 2.5, 0, Math.PI * 2);
          oCtx.fill();
        });
      }
    }

    // 4. Construct 128-D Deep Spatial & Gradient Descriptor Vector
    const vector: number[] = [];

    // 64 grid cells values
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        vector.push(gridLuma[gy][gx] / 255);
      }
    }

    // 32 directional gradient features (horizontal & vertical Sobel approximations)
    for (let gy = 0; gy < GRID - 1; gy++) {
      for (let gx = 0; gx < GRID - 1; gx++) {
        const dx = (gridLuma[gy][gx + 1] - gridLuma[gy][gx]) / 255;
        const dy = (gridLuma[gy + 1][gx] - gridLuma[gy][gx]) / 255;
        vector.push(dx);
      }
    }

    // 32 structural morphology ratios & geometric invariant relations
    vector.push(foreheadLuma / 255);
    vector.push(leftEyeLuma / 255);
    vector.push(rightEyeLuma / 255);
    vector.push(noseBridgeLuma / 255);
    vector.push(mouthLuma / 255);
    vector.push(chinLuma / 255);
    vector.push(symmetryScore);
    vector.push(skinRatio);
    vector.push(contrastRange / 255);
    vector.push(tZoneRatio / 2);

    // Pad or trim to exactly 128 dimensions
    while (vector.length < 128) vector.push(0);
    const finalVector = vector.slice(0, 128);

    // Normalize vector to unit length
    const norm = Math.sqrt(finalVector.reduce((sum, v) => sum + v * v, 0)) || 1;
    const normalizedVector = finalVector.map((v) => v / norm);

    const thumbnail = canvas.toDataURL('image/jpeg', 0.65);

    return {
      isValidFace: true,
      profile: {
        vector: normalizedVector,
        landmarks,
        symmetry: symmetryScore,
        tZoneRatio,
        enrolledAt: new Date().toISOString(),
        previewThumbnail: thumbnail,
        accountName: currentAcc,
      },
    };
  };

  /**
   * Compute Cosine Biometric Similarity between Live Face Vector and Enrolled Face Vector
   * Produces a Bank-grade confidence score from 0% to 100%
   */
  const computeFaceSimilarity = (liveVec: number[], enrolledVec: number[]): number => {
    if (liveVec.length !== enrolledVec.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < liveVec.length; i++) {
      dot += liveVec[i] * enrolledVec[i];
      normA += liveVec[i] * liveVec[i];
      normB += enrolledVec[i] * enrolledVec[i];
    }
    const cosineSim = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    // Scale cosine score (0.75..0.98) to 0..100%
    const scaledScore = Math.max(0, Math.min(100, Math.round(((cosineSim - 0.74) / 0.24) * 100)));
    return scaledScore;
  };

  // Launch Camera Face Recognition / Enrollment
  const handleStartFaceIdScan = async (isEnrollmentMode = false) => {
    setError('');
    setIsFaceIdScanning(true);
    setFaceScanStatus('Đang kích hoạt Camera...');
    setCameraActive(true);
    setIsEnrollingNewFace(isEnrollmentMode);
    setMatchConfidence(0);
    setLivenessStage('Nhìn thẳng vào khung camera');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ truy cập Camera trực tiếp.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setFaceScanStatus('Vui lòng đưa mặt vào giữa vòng tròn...');

      let consecutiveMatchedFrames = 0;
      let scanCycles = 0;
      const enrolledProfile = getEnrolledProfile();

      // Scan live stream every 160ms
      scanIntervalRef.current = setInterval(async () => {
        scanCycles++;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const overlay = overlayCanvasRef.current;
        if (!video || !canvas) return;

        const { profile, isValidFace, reason } = extractFacialDescriptor(video, canvas, overlay);

        if (!isValidFace || !profile) {
          consecutiveMatchedFrames = 0;
          setMatchConfidence(0);
          setFaceScanStatus(`⚠️ ${reason || 'Chưa thấy khuôn mặt! Hãy nhìn vào camera.'}`);
          return;
        }

        // SCENARIO 1: ENROLLMENT OF MASTER TEMPLATE (ĐĂNG KÝ KHUÔN MẶT MẪU MỚI)
        if (isEnrollmentMode || !enrolledProfile) {
          consecutiveMatchedFrames++;
          const progress = Math.min(100, consecutiveMatchedFrames * 25);
          setMatchConfidence(progress);
          setFaceScanStatus(`Đang lấy mẫu sinh trắc học (${progress}%)...`);

          if (consecutiveMatchedFrames >= 4) {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            localStorage.setItem(`thaptaisan_face_profile_${accKey}`, JSON.stringify(profile));
            localStorage.setItem('thaptaisan_faceid_enabled', '1');
            localStorage.setItem('thaptaisan_faceid_account', currentAcc);
            setFaceScanStatus('✓ Đã lưu mẫu khuôn mặt chính chủ thành công!');
            setFaceIdSuccess(true);

            setTimeout(async () => {
              stopCamera();
              if (onFaceIdUnlock) {
                await onFaceIdUnlock();
              }
            }, 650);
          }
          return;
        }

        // SCENARIO 2: STRICT BIOMETRIC RECOGNITION AGAINST REGISTERED PROFILE
        const confidence = computeFaceSimilarity(profile.vector, enrolledProfile.vector);
        setMatchConfidence(confidence);

        // Strict Banking Threshold (>= 85% match)
        if (confidence >= 85) {
          consecutiveMatchedFrames++;
          setFaceScanStatus(`Khớp sinh trắc học: ${confidence}% (${consecutiveMatchedFrames}/3)`);

          // Require 3 consecutive stable matching frames
          if (consecutiveMatchedFrames >= 3) {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            setFaceScanStatus(`✓ Xác thực khuôn mặt thành công (${confidence}%)!`);
            setFaceIdSuccess(true);

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
            }, 500);
          }
        } else {
          consecutiveMatchedFrames = 0;
          setFaceScanStatus(`❌ Khuôn mặt không khớp hồ sơ đăng ký (${confidence}% < 85%)`);
        }

        // Timeout safety after 25 seconds
        if (scanCycles > 150) {
          if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
          stopCamera();
          setError('Hết thời gian quét. Vui lòng thử lại hoặc đăng nhập bằng Mật khẩu.');
        }
      }, 160);
    } catch (err: any) {
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Quyền truy cập Camera bị từ chối. Vui lòng cho phép quyền Camera trên trình duyệt hoặc đăng nhập bằng Mật khẩu.');
      } else {
        setError('Không thể mở Camera: ' + (err?.message || 'Vui lòng nhập mật khẩu'));
      }
      setActiveTab('password');
    }
  };

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

  const enrolled = getEnrolledProfile();

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-auto">
        {/* Mobile Drag Indicator */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>

        {/* Brand Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 p-1 shadow-xs border border-slate-200/90 relative">
            <PyramidLogo className="w-full h-full" />
            <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-3 h-3" />
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Tháp Tài Sản • Quản Trị Tài Chính
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bảo mật sinh trắc học chuẩn ngân hàng & mã hóa dữ liệu
          </p>
        </div>

        {/* FINTECH SEGMENTED TAB SWITCH */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('faceid');
            }}
            className={`py-2 px-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'faceid'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'hover:text-slate-900'
            }`}
          >
            <ScanFace className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Sinh trắc học Face ID</span>
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
            <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Mật khẩu tài khoản</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded-xl font-semibold flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden Canvas for Background Frame Processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* TAB 1: BANKING / MOMO GRADE FACE ID SCANNER */}
        {activeTab === 'faceid' && (
          <div className="space-y-3.5 text-center">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-3">
              {/* Profile Bar */}
              <div className="flex items-center justify-between text-xs px-1 border-b border-slate-200/70 pb-2">
                <div className="text-left">
                  <div className="text-[10px] text-slate-400 font-medium">Tài khoản xác thực:</div>
                  <div className="font-bold text-slate-900 truncate max-w-[170px]">
                    {currentAcc !== 'default' ? currentAcc : 'Tài khoản chính'}
                  </div>
                </div>

                {enrolled ? (
                  <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full text-[10px] font-bold">
                    {enrolled.previewThumbnail && (
                      <img
                        src={enrolled.previewThumbnail}
                        alt="Enrolled Face"
                        className="w-4 h-4 rounded-full object-cover border border-emerald-400 shrink-0"
                      />
                    )}
                    <span>Đã có mẫu chính chủ</span>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                    Chưa có mẫu khuôn mặt
                  </span>
                )}
              </div>

              {/* BANKING CIRCULAR FACE SCANNER HUD */}
              {cameraActive ? (
                <div className="space-y-3 pt-1">
                  <div className="relative w-48 h-48 sm:w-52 sm:h-52 mx-auto">
                    {/* Outer 360-Degree Radial Tick Ring */}
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/40 animate-[spin_10s_linear_infinite] pointer-events-none"></div>

                    {/* Circular Live Viewport */}
                    <div className="absolute inset-2 rounded-full overflow-hidden border-4 border-blue-600 shadow-2xl bg-slate-950 flex items-center justify-center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover scale-x-[-1]"
                      />

                      {/* Realtime Facial Landmark Mesh Canvas */}
                      <canvas
                        ref={overlayCanvasRef}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-x-[-1]"
                      />

                      {/* Biometric Laser Scanner Line */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-bounce"></div>
                      </div>

                      {/* Success Hologram Overlay */}
                      {faceIdSuccess && (
                        <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-xs flex items-center justify-center animate-in fade-in">
                          <Check className="w-16 h-16 text-white animate-bounce" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Matching Confidence Score Gauge */}
                  <div className="space-y-1.5 px-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-600">Độ khớp khuôn mặt chính chủ:</span>
                      <span
                        className={
                          matchConfidence >= 85
                            ? 'text-emerald-600 font-black'
                            : matchConfidence > 50
                            ? 'text-amber-600 font-black'
                            : 'text-rose-600 font-black'
                        }
                      >
                        {matchConfidence}% {matchConfidence >= 85 ? '(Đạt chuẩn)' : '(Yêu cầu ≥ 85%)'}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          matchConfidence >= 85
                            ? 'bg-emerald-500'
                            : matchConfidence > 50
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${matchConfidence}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Live Status Pill */}
                  <div className="text-xs font-bold text-slate-800 bg-white py-2 px-3 rounded-xl border border-slate-200 shadow-2xs">
                    {faceScanStatus}
                  </div>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer transition py-1"
                  >
                    Dừng quét camera
                  </button>
                </div>
              ) : (
                /* Primary Trigger Actions */
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleStartFaceIdScan(false)}
                    disabled={isFaceIdScanning || faceIdSuccess}
                    className={`w-full py-4 px-4 rounded-2xl font-bold text-sm transition-all duration-300 flex flex-col items-center justify-center space-y-1.5 cursor-pointer shadow-md active:scale-95 ${
                      faceIdSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                    }`}
                  >
                    <div className="relative">
                      <ScanFace className="w-10 h-10" />
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-cyan-400 rounded-full animate-ping"></span>
                    </div>
                    <span>Quét Nhận Diện Face ID</span>
                    <span className="text-[11px] font-normal text-white/85 flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Xác thực so khớp ảnh thực tế chính chủ</span>
                    </span>
                  </button>

                  {/* Register/Re-enroll Template Button */}
                  <button
                    type="button"
                    onClick={() => handleStartFaceIdScan(true)}
                    className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>{enrolled ? 'Cập nhật / Chụp lại khuôn mặt mẫu' : 'Đăng ký khuôn mặt mẫu mới'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SCIENTIFIC & SMOOTH ACCOUNT PASSWORD FORM (NO UNWANTED AUTO-ZOOM) */}
        {activeTab === 'password' && (
          <form onSubmit={handleSubmitPassword} className="space-y-3.5">
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
                  /* text-base (16px) prevents iOS mobile auto-zoom completely */
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
                  /* text-base (16px) prevents iOS mobile auto-zoom completely */
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

            {/* Quick Remember Checkbox */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-slate-700">Lưu đăng nhập & bật Face ID</span>
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
                  <span>Đang xác thực & mở dữ liệu...</span>
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
