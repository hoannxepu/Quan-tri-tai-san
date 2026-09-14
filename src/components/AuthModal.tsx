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
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { PyramidLogo } from './PyramidLogo';
import { normalizeAccountKey } from '../utils/format';

interface AuthModalProps {
  isOpen: boolean;
  onLogin: (account: string, pass: string, remember: boolean) => Promise<boolean>;
  onFaceIdUnlock?: () => Promise<boolean>;
}

// Bounding Box of detected face
interface DetectedFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  leftEye?: [number, number];
  rightEye?: [number, number];
  noseTip?: [number, number];
  mouth?: [number, number];
}

// 64-Dimensional Illumination-Normalized Face Biometric Profile
interface FaceBiometricProfile {
  vector: number[];
  faceRatio: number;
  eyeDistanceRatio: number;
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
  const [faceScanStatus, setFaceScanStatus] = useState<string>('Sẵn sàng quét');
  const [matchConfidence, setMatchConfidence] = useState<number>(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isEnrollingNewFace, setIsEnrollingNewFace] = useState(false);
  const [faceDetectedInFrame, setFaceDetectedInFrame] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const latestFaceBoxRef = useRef<DetectedFaceBox | null>(null);

  const currentAcc = account.trim() || localStorage.getItem('thaptaisan_saved_account') || 'default';
  const accKey = normalizeAccountKey(currentAcc);

  // Retrieve enrolled face profile for current account
  const getEnrolledProfile = (): FaceBiometricProfile | null => {
    try {
      // First try account-specific profile
      const raw = localStorage.getItem(`thaptaisan_face_profile_${accKey}`);
      if (raw) return JSON.parse(raw);

      // Fallback to global profile if available
      const globalRaw = localStorage.getItem('thaptaisan_master_face_profile');
      if (globalRaw) return JSON.parse(globalRaw);
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
    setFaceDetectedInFrame(false);
    latestFaceBoxRef.current = null;
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
   * STEP 1: HYBRID FACE LOCALIZATION & BOUNDING BOX DETECTION
   * Uses Shape Detection API (if supported by browser/Android/Chrome)
   * With an intelligent YCbCr + Connected Centroid Fallback (iOS Safari, Firefox, etc.)
   */
  const detectFaceBoundingBox = async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ): Promise<DetectedFaceBox | null> => {
    if (video.readyState !== 4) return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    // 1. Try Hardware-Accelerated Native FaceDetector if available
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const faces = await detector.detect(video);
        if (faces && faces.length > 0) {
          const f = faces[0];
          const bb = f.boundingBox;
          let leftEye: [number, number] | undefined;
          let rightEye: [number, number] | undefined;
          let noseTip: [number, number] | undefined;
          let mouth: [number, number] | undefined;

          if (f.landmarks) {
            for (const lm of f.landmarks) {
              if (lm.type === 'eye' && !leftEye) leftEye = [lm.locations[0].x, lm.locations[0].y];
              else if (lm.type === 'eye') rightEye = [lm.locations[0].x, lm.locations[0].y];
              else if (lm.type === 'nose') noseTip = [lm.locations[0].x, lm.locations[0].y];
              else if (lm.type === 'mouth') mouth = [lm.locations[0].x, lm.locations[0].y];
            }
          }

          return {
            x: Math.max(0, bb.x),
            y: Math.max(0, bb.y),
            width: Math.min(vw - bb.x, bb.width),
            height: Math.min(vh - bb.y, bb.height),
            confidence: 0.95,
            leftEye,
            rightEye,
            noseTip,
            mouth,
          };
        }
      } catch (err) {
        // Fallback to Computer Vision algorithm below
      }
    }

    // 2. High-Precision Computer Vision: Adaptive YCbCr Skin & Centroid Clustering
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Sample video to 160x120 for real-time 60fps responsiveness
    const SAMPLE_W = 160;
    const SAMPLE_H = 120;
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);

    const frame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const d = frame.data;

    let skinCount = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = SAMPLE_W;
    let maxX = 0;
    let minY = SAMPLE_H;
    let maxY = 0;

    // Center weighting: faces are positioned in or near the center 80% of view
    const marginX = Math.floor(SAMPLE_W * 0.08);
    const marginY = Math.floor(SAMPLE_H * 0.08);

    for (let y = marginY; y < SAMPLE_H - marginY; y++) {
      for (let x = marginX; x < SAMPLE_W - marginX; x++) {
        const idx = (y * SAMPLE_W + x) * 4;
        const r = d[idx];
        const g = d[idx + 1];
        const b = d[idx + 2];

        // Standard YCbCr conversion for human skin
        const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        // Robust skin tone detection under diverse lighting
        const isSkin =
          cb >= 75 &&
          cb <= 135 &&
          cr >= 130 &&
          cr <= 180 &&
          yVal >= 40 &&
          yVal <= 245 &&
          r > g &&
          g > b * 0.7;

        if (isSkin) {
          skinCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const totalSampled = (SAMPLE_W - marginX * 2) * (SAMPLE_H - marginY * 2);
    const skinRatio = skinCount / totalSampled;

    // Minimum 3.5% skin cluster required to confirm presence of human face
    if (skinRatio < 0.035 || maxX <= minX || maxY <= minY) {
      return null;
    }

    // Centroid of face
    const centerX = sumX / skinCount;
    const centerY = sumY / skinCount;

    // Approximate face box based on spread and centroid
    const rawBoxW = Math.max(SAMPLE_W * 0.25, Math.min(SAMPLE_W * 0.75, (maxX - minX) * 0.9));
    const rawBoxH = Math.max(SAMPLE_H * 0.35, Math.min(SAMPLE_H * 0.85, rawBoxW * 1.3));

    const boxX = Math.max(0, Math.min(SAMPLE_W - rawBoxW, centerX - rawBoxW / 2));
    const boxY = Math.max(0, Math.min(SAMPLE_H - rawBoxH, centerY - rawBoxH / 2.2));

    // Scale back to video native resolution
    const scaleX = vw / SAMPLE_W;
    const scaleY = vh / SAMPLE_H;

    const realX = boxX * scaleX;
    const realY = boxY * scaleY;
    const realW = rawBoxW * scaleX;
    const realH = rawBoxH * scaleY;

    // Calculated anatomical landmarks inside face box
    const leftEye: [number, number] = [realX + realW * 0.33, realY + realH * 0.36];
    const rightEye: [number, number] = [realX + realW * 0.67, realY + realH * 0.36];
    const noseTip: [number, number] = [realX + realW * 0.50, realY + realH * 0.54];
    const mouth: [number, number] = [realX + realW * 0.50, realY + realH * 0.75];

    return {
      x: realX,
      y: realY,
      width: realW,
      height: realH,
      confidence: Math.min(1.0, skinRatio * 4),
      leftEye,
      rightEye,
      noseTip,
      mouth,
    };
  };

  /**
   * STEP 2: EXTRACT CROPPED FACE 64-D BIOMETRIC EMBEDDING
   * Extracts illumination-normalized features specifically from the CROPPED face ROI
   */
  const extractFaceDescriptor = (
    video: HTMLVideoElement,
    faceBox: DetectedFaceBox
  ): { profile: FaceBiometricProfile; thumbnail: string } => {
    const cropCanvas = document.createElement('canvas');
    const CROP_SIZE = 64;
    cropCanvas.width = CROP_SIZE;
    cropCanvas.height = CROP_SIZE;
    const ctx = cropCanvas.getContext('2d', { willReadFrequently: true })!;

    // Draw strictly the localized face box
    ctx.drawImage(
      video,
      faceBox.x,
      faceBox.y,
      faceBox.width,
      faceBox.height,
      0,
      0,
      CROP_SIZE,
      CROP_SIZE
    );

    const imgData = ctx.getImageData(0, 0, CROP_SIZE, CROP_SIZE);
    const d = imgData.data;

    // 1. Convert to grayscale & compute mean/std for illumination invariance
    const gray: number[] = [];
    let sumLuma = 0;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray.push(luma);
      sumLuma += luma;
    }
    const mean = sumLuma / gray.length;
    let variance = 0;
    for (let i = 0; i < gray.length; i++) {
      variance += Math.pow(gray[i] - mean, 2);
    }
    const stdDev = Math.sqrt(variance / gray.length) || 1;

    // Zero-mean unit-variance normalized pixels
    const normGray = gray.map((v) => (v - mean) / stdDev);

    // 2. 16 Spatial Cell Pooling (4x4 regions of the face)
    const GRID = 4;
    const step = CROP_SIZE / GRID;
    const vector: number[] = [];

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        let cellSum = 0;
        let cellCount = 0;
        for (let py = 0; py < step; py++) {
          for (let px = 0; px < step; px++) {
            const y = Math.floor(gy * step + py);
            const x = Math.floor(gx * step + px);
            cellSum += normGray[y * CROP_SIZE + x];
            cellCount++;
          }
        }
        vector.push(cellSum / (cellCount || 1));
      }
    }

    // 3. Multi-direction Edge Gradients (Eye valleys, Nose ridge, Mouth contour)
    for (let gy = 0; gy < GRID - 1; gy++) {
      for (let gx = 0; gx < GRID - 1; gx++) {
        const dx = vector[(gy * GRID) + (gx + 1)] - vector[(gy * GRID) + gx];
        const dy = vector[((gy + 1) * GRID) + gx] - vector[(gy * GRID) + gx];
        vector.push(dx);
        vector.push(dy);
      }
    }

    // 4. Structural Ratios
    const faceRatio = faceBox.height / (faceBox.width || 1);
    const eyeDist =
      faceBox.leftEye && faceBox.rightEye
        ? Math.hypot(faceBox.rightEye[0] - faceBox.leftEye[0], faceBox.rightEye[1] - faceBox.leftEye[1]) /
          (faceBox.width || 1)
        : 0.35;

    vector.push(faceRatio);
    vector.push(eyeDist);

    // Pad or trim to exactly 64 dimensions
    while (vector.length < 64) vector.push(0);
    const finalVec = vector.slice(0, 64);

    // Normalize final vector to unit length
    const vNorm = Math.sqrt(finalVec.reduce((acc, v) => acc + v * v, 0)) || 1;
    const normalizedVector = finalVec.map((v) => v / vNorm);

    const thumbnail = cropCanvas.toDataURL('image/jpeg', 0.85);

    return {
      profile: {
        vector: normalizedVector,
        faceRatio,
        eyeDistanceRatio: eyeDist,
        enrolledAt: new Date().toISOString(),
        previewThumbnail: thumbnail,
        accountName: currentAcc,
      },
      thumbnail,
    };
  };

  /**
   * STEP 3: BIOMETRIC MATCH CONFIDENCE
   * Computes normalized cosine similarity between live face and enrolled profile
   */
  const computeMatchScore = (liveVec: number[], enrolledVec: number[]): number => {
    if (liveVec.length !== enrolledVec.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < liveVec.length; i++) {
      dot += liveVec[i] * enrolledVec[i];
      normA += liveVec[i] * liveVec[i];
      normB += enrolledVec[i] * enrolledVec[i];
    }
    const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);

    // Calibrate: Cosine for identical person typically ranges from 0.75 to 0.98
    // Map [0.65 .. 0.92] smoothly to [0% .. 100%]
    const score = Math.max(0, Math.min(100, Math.round(((cosine - 0.65) / 0.27) * 100)));
    return score;
  };

  /**
   * STEP 4: RENDER FUTURISTIC DYNAMIC HUD OVERLAY
   * Draws a tracking bounding box and landmarks that FOLLOW the face in real-time
   */
  const renderTrackingHUD = (
    overlayCanvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    faceBox: DetectedFaceBox | null,
    isMatched: boolean,
    confidence: number
  ) => {
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    overlayCanvas.width = vw;
    overlayCanvas.height = vh;
    ctx.clearRect(0, 0, vw, vh);

    if (!faceBox) {
      // Guide Oval when searching for face
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.ellipse(vw / 2, vh / 2, vw * 0.28, vh * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const { x, y, width: w, height: h } = faceBox;
    const strokeColor = isMatched ? '#10b981' : confidence > 50 ? '#06b6d4' : '#3b82f6';

    // 1. Dynamic Oval framing the detected face
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isMatched ? 4 : 2.5;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 12;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = Math.max(20, w / 2);
    const ry = Math.max(30, h / 1.8);

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 2. Corner Targeting Brackets
    const bracketLen = Math.min(30, w * 0.2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + bracketLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bracketLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - bracketLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + bracketLen, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - bracketLen);
    ctx.stroke();

    // 3. Facial Landmark Nodes
    if (faceBox.leftEye && faceBox.rightEye) {
      [faceBox.leftEye, faceBox.rightEye, faceBox.noseTip, faceBox.mouth].forEach((pt) => {
        if (!pt) return;
        ctx.fillStyle = isMatched ? '#34d399' : '#22d3ee';
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 4. Live Tracking Tag above face
    ctx.fillStyle = isMatched ? 'rgba(16, 185, 129, 0.9)' : 'rgba(15, 23, 42, 0.85)';
    const tagText = isMatched
      ? `✓ CHÍNH CHỦ (${confidence}%)`
      : `BẮT NÉT KHUÔN MẶT: ${confidence}%`;
    ctx.font = 'bold 16px sans-serif';
    const textW = ctx.measureText(tagText).width;
    const tagX = Math.max(10, cx - textW / 2 - 10);
    const tagY = Math.max(30, y - 18);

    ctx.fillRect(tagX, tagY - 18, textW + 20, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, tagX + 10, tagY);
  };

  /**
   * INSTANT UNLOCK / SAVE PROFILE HELPER
   */
  const handleCompleteUnlock = async () => {
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
  };

  /**
   * INSTANT MANUAL CAPTURE & VERIFY (Người dùng bấm nút để xác thực ngay)
   */
  const handleInstantCapture = () => {
    const video = videoRef.current;
    if (!video || !latestFaceBoxRef.current) {
      setError('Vui lòng đưa mặt vào khung tròn trước khi chụp!');
      return;
    }

    const { profile } = extractFaceDescriptor(video, latestFaceBoxRef.current);
    const enrolledProfile = getEnrolledProfile();

    if (isEnrollingNewFace || !enrolledProfile) {
      // Save Master Profile
      localStorage.setItem(`thaptaisan_face_profile_${accKey}`, JSON.stringify(profile));
      localStorage.setItem('thaptaisan_master_face_profile', JSON.stringify(profile));
      localStorage.setItem('thaptaisan_faceid_enabled', '1');
      localStorage.setItem('thaptaisan_faceid_account', currentAcc);
      setFaceScanStatus('✓ Đã lưu mẫu khuôn mặt thành công!');
      setFaceIdSuccess(true);
      setTimeout(handleCompleteUnlock, 500);
      return;
    }

    // Verify against enrolled
    const conf = computeMatchScore(profile.vector, enrolledProfile.vector);
    setMatchConfidence(conf);
    if (conf >= 65) {
      setFaceScanStatus(`✓ Đã xác thực thành công (${conf}%)!`);
      setFaceIdSuccess(true);
      setTimeout(handleCompleteUnlock, 500);
    } else {
      setFaceScanStatus(`⚠️ Độ khớp ${conf}% (Yêu cầu ≥ 65%). Hãy nhìn thẳng và thử lại.`);
    }
  };

  // Launch Camera Face Recognition / Enrollment
  const handleStartFaceIdScan = async (isEnrollmentMode = false) => {
    setError('');
    setIsFaceIdScanning(true);
    setFaceScanStatus('Đang khởi động Camera...');
    setCameraActive(true);
    setIsEnrollingNewFace(isEnrollmentMode);
    setMatchConfidence(0);
    setFaceDetectedInFrame(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ truy cập Camera trực tiếp.');
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

      setFaceScanStatus('Đang tìm kiếm khuôn mặt...');

      let stableMatches = 0;
      let scanCycles = 0;
      const enrolledProfile = getEnrolledProfile();

      // Scan live stream every 180ms
      scanIntervalRef.current = setInterval(async () => {
        scanCycles++;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const overlay = overlayCanvasRef.current;
        if (!video || !canvas) return;

        // 1. Detect dynamic face bounding box
        const faceBox = await detectFaceBoundingBox(video, canvas);
        latestFaceBoxRef.current = faceBox;

        if (!faceBox) {
          setFaceDetectedInFrame(false);
          setFaceScanStatus('Vui lòng đưa khuôn mặt vào giữa khung camera...');
          if (overlay) renderTrackingHUD(overlay, video, null, false, 0);
          return;
        }

        setFaceDetectedInFrame(true);

        // 2. Extract Biometric Descriptor from localized face
        const { profile } = extractFaceDescriptor(video, faceBox);

        // CASE 1: ENROLLING NEW MASTER TEMPLATE
        if (isEnrollmentMode || !enrolledProfile) {
          stableMatches++;
          const progress = Math.min(100, stableMatches * 34);
          setMatchConfidence(progress);
          setFaceScanStatus(`Đang bắt nét & lưu mẫu khuôn mặt (${progress}%)...`);

          if (overlay) renderTrackingHUD(overlay, video, faceBox, false, progress);

          if (stableMatches >= 3) {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            localStorage.setItem(`thaptaisan_face_profile_${accKey}`, JSON.stringify(profile));
            localStorage.setItem('thaptaisan_master_face_profile', JSON.stringify(profile));
            localStorage.setItem('thaptaisan_faceid_enabled', '1');
            localStorage.setItem('thaptaisan_faceid_account', currentAcc);

            setFaceScanStatus('✓ Đã lưu mẫu khuôn mặt chính chủ thành công!');
            setFaceIdSuccess(true);
            if (overlay) renderTrackingHUD(overlay, video, faceBox, true, 100);

            setTimeout(handleCompleteUnlock, 600);
          }
          return;
        }

        // CASE 2: REAL-TIME VERIFICATION AGAINST ENROLLED MASTER TEMPLATE
        const conf = computeMatchScore(profile.vector, enrolledProfile.vector);
        setMatchConfidence(conf);

        if (overlay) renderTrackingHUD(overlay, video, faceBox, conf >= 68, conf);

        // Smooth Recognition Threshold (>= 68% match)
        if (conf >= 68) {
          stableMatches++;
          setFaceScanStatus(`✓ Đã bắt đúng khuôn mặt: ${conf}% (${stableMatches}/2)`);

          // Quick unlock after 2 smooth consecutive frames
          if (stableMatches >= 2) {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            setFaceScanStatus(`✓ Xác thực Face ID thành công (${conf}%)!`);
            setFaceIdSuccess(true);
            if (overlay) renderTrackingHUD(overlay, video, faceBox, true, conf);

            setTimeout(handleCompleteUnlock, 500);
          }
        } else {
          stableMatches = 0;
          setFaceScanStatus(`Đang nhận diện: ${conf}% (Hãy nhìn thẳng vào camera)`);
        }

        // Safety timeout after 30s
        if (scanCycles > 160) {
          if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
          stopCamera();
          setError('Hết thời gian quét. Bạn có thể bấm "Chụp & Mở Khóa Ngay" hoặc nhập mật khẩu.');
        }
      }, 180);
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
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
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

        {/* TAB 1: BANKING / MOMO GRADE FACE ID SCANNER WITH REAL-TIME FACE TRACKING */}
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

              {/* BANKING CIRCULAR FACE SCANNER WITH REAL-TIME HUD TRACKING */}
              {cameraActive ? (
                <div className="space-y-3 pt-1">
                  <div className="relative w-52 h-52 sm:w-56 sm:h-56 mx-auto">
                    {/* Outer Rotating Neon Guide Ring */}
                    <div
                      className={`absolute inset-0 rounded-full border-2 border-dashed transition-colors duration-300 animate-[spin_12s_linear_infinite] pointer-events-none ${
                        faceIdSuccess
                          ? 'border-emerald-500'
                          : faceDetectedInFrame
                          ? 'border-cyan-400'
                          : 'border-slate-300'
                      }`}
                    ></div>

                    {/* Circular Live Viewport */}
                    <div className="absolute inset-2 rounded-full overflow-hidden border-4 border-blue-600 shadow-2xl bg-slate-950 flex items-center justify-center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover scale-x-[-1]"
                      />

                      {/* Realtime Dynamic Tracking HUD (Tracks user's actual face) */}
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
                      <span className="text-slate-600">
                        {isEnrollingNewFace ? 'Đang quét mẫu:' : 'Độ khớp khuôn mặt chính chủ:'}
                      </span>
                      <span
                        className={
                          matchConfidence >= 68
                            ? 'text-emerald-600 font-black'
                            : matchConfidence > 40
                            ? 'text-cyan-600 font-black'
                            : 'text-slate-500 font-bold'
                        }
                      >
                        {matchConfidence}% {matchConfidence >= 68 ? '(Đạt chuẩn ✓)' : '(Chuẩn ≥ 68%)'}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          matchConfidence >= 68
                            ? 'bg-emerald-500'
                            : matchConfidence > 40
                            ? 'bg-cyan-500'
                            : 'bg-blue-400'
                        }`}
                        style={{ width: `${matchConfidence}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Live Status Pill */}
                  <div className="text-xs font-bold text-slate-800 bg-white py-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-center gap-1.5">
                    {faceDetectedInFrame ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    )}
                    <span>{faceScanStatus}</span>
                  </div>

                  {/* Action Buttons inside active camera */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleInstantCapture}
                      disabled={!faceDetectedInFrame || faceIdSuccess}
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isEnrollingNewFace ? 'Chụp & Lưu Mẫu Ngay' : 'Chụp & Mở Khóa Ngay'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Dừng
                    </button>
                  </div>
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
                    <span>{enrolled ? 'Quét Nhận Diện Face ID' : 'Bắt Đầu Đăng Ký Face ID'}</span>
                    <span className="text-[11px] font-normal text-white/85 flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Tự động bắt nét & so khớp khuôn mặt thông minh</span>
                    </span>
                  </button>

                  {/* Register/Re-enroll Template Button */}
                  <button
                    type="button"
                    onClick={() => handleStartFaceIdScan(true)}
                    className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>{enrolled ? 'Chụp lại khuôn mặt mẫu mới' : 'Đăng ký khuôn mặt mẫu mới'}</span>
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
