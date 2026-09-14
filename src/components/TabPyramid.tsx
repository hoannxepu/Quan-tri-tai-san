import React, { useState, useEffect, useRef } from 'react';
import { Asset, DatabaseState } from '../types';
import { formatVND, formatNumberString, parseFormattedNumber, formatDateVN, calculateMaturityDate, calculateMaturityDateISO, getStandardTimeline, getActualTimelinePoints } from '../utils/format';
import { createPointValuePlugin } from '../utils/chartPlugin';
import { Chart, registerables } from 'chart.js';
import { Layers, PlusCircle, RotateCw, Check, Sliders, ChevronDown, ChevronUp, Eye, Pen, Trash2, TrendingUp, AlertCircle, Calendar, X, Award, Info, ChevronRight } from 'lucide-react';
import { getVietnamWealthBenchmark } from '../utils/benchmarkUtils';
import { BenchmarkModal } from './BenchmarkModal';

Chart.register(...registerables);

interface TabPyramidProps {
  db: DatabaseState;
  isPrivacyMode: boolean;
  onUpdateAsset: (asset: Asset) => void;
  onRemoveAsset: (id: number) => void;
  onSyncDrive: () => Promise<void>;
  isSyncing: boolean;
}

const assetTypeLabels: Record<string, string> = {
  cash: 'Tiền Mặt / Thanh Toán',
  saving: 'Sổ Tiết Kiệm Kỳ Hạn',
  gold: 'Vàng Tích Trữ (SJC / Nhẫn)',
  realestate_live: 'BĐS Để Ở (An Cư)',
  realestate_rent: 'BĐS Cho Thuê (Dòng Tiền)',
  stock: 'Cổ Phiếu / ETF',
  realestate_land: 'BĐS Đất Nền Dự Án',
  bond: 'Trái Phiếu',
  crypto: 'Crypto / FX Mạo Hiểm',
  private_equity: 'Góp Vốn Đầu Tư',
  peer_lending: 'Cho Vay Tín Dụng',
};

const levelDescriptions: Record<string, string> = {
  '1': 'Tầng 1 (Bảo Vệ & Nền Tảng): Tiền mặt, tiết kiệm, vàng, BĐS để ở. Thanh khoản cao, bảo toàn vốn.',
  '2': 'Tầng 2 (Tăng Trưởng): Cổ phiếu, đất nền, trái phiếu. Gia tăng quy mô tài sản theo chu kỳ.',
  '3': 'Tầng 3 (Mạo Hiểm): Crypto, FX, góp vốn tư nhân. Tỷ suất sinh lời cao đi kèm rủi ro lớn.',
};

export const TabPyramid: React.FC<TabPyramidProps> = ({
  db,
  isPrivacyMode,
  onUpdateAsset,
  onRemoveAsset,
  onSyncDrive,
  isSyncing,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showWealthBenchmarkModal, setShowWealthBenchmarkModal] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'value-desc' | 'value-asc' | 'name-asc' | 'level'>('default');
  const [netWorthRange, setNetWorthRange] = useState<'quarter' | 'year' | '3years' | '5years'>('quarter');

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [level, setLevel] = useState<'1' | '2' | '3'>('1');
  const [type, setType] = useState<Asset['type']>('cash');
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [costPriceStr, setCostPriceStr] = useState('');
  const [rateStr, setRateStr] = useState('');
  const [startDate, setStartDate] = useState('');
  const [termMonthsStr, setTermMonthsStr] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [quantityStr, setQuantityStr] = useState('');
  const [cashflowStr, setCashflowStr] = useState('');
  const [divCashStr, setDivCashStr] = useState('');

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // Totals calculations
  const totalAssets = db.assets.reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalDebts = db.debts.reduce((sum, d) => {
    if (d.category === 'type1' || d.category === 'type2' || d.category === 'type_free') {
      return sum + Math.max(0, d.amount - (d.paidPrincipal || 0));
    }
    return sum;
  }, 0);
  const netWorth = totalAssets - totalDebts;

  const p1 = db.assets.filter((a) => a.level === '1').reduce((sum, a) => sum + a.amount, 0);
  const p2 = db.assets.filter((a) => a.level === '2').reduce((sum, a) => sum + a.amount, 0);
  const p3 = db.assets.filter((a) => a.level === '3').reduce((sum, a) => sum + a.amount, 0);

  const wealthBenchmark = getVietnamWealthBenchmark(totalAssets);

  const r1 = totalAssets > 0 ? Math.round((p1 / totalAssets) * 100) : 0;
  const r2 = totalAssets > 0 ? Math.round((p2 / totalAssets) * 100) : 0;
  const r3 = totalAssets > 0 ? Math.round((p3 / totalAssets) * 100) : 0;

  // Sorting
  const sortedAssets = [...db.assets].sort((a, b) => {
    if (sortMode === 'value-desc') return b.amount - a.amount;
    if (sortMode === 'value-asc') return a.amount - b.amount;
    if (sortMode === 'name-asc') return a.name.localeCompare(b.name);
    if (sortMode === 'level') return Number(a.level) - Number(b.level);
    return 0;
  });

  // Render chart - chỉ hiển thị các tháng thực tế có dữ liệu từ tháng bắt đầu
  useEffect(() => {
    if (!chartCanvasRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const points = getActualTimelinePoints(
      db,
      {
        netWorth,
        totalAssets,
        totalDebts,
        inflow: 0,
        outflow: 0,
        netCashFlow: 0,
        debtProgressPercent: 0,
        dcaProgressPercent: 0,
        runwayPercent: 0,
        milestoneProgressPercent: 0,
      },
      netWorthRange
    );

    const labels = points.map((p) => p.label);
    const dataValues: number[] = points.map((p) => p.netWorth);

    const ctx = chartCanvasRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tài Sản Ròng',
            data: dataValues,
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#059669',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 26,
            bottom: 10,
            left: 14,
            right: 14,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Tài Sản Ròng: ${formatVND(Number(item.raw), isPrivacyMode)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val) =>
                isPrivacyMode
                  ? '***'
                  : Number(val) >= 1e9
                  ? (Number(val) / 1e9).toFixed(1) + ' Tỷ'
                  : (Number(val) / 1e6).toFixed(0) + ' Tr',
            },
          },
        },
      },
      plugins: [createPointValuePlugin({ isPrivacyMode, valueType: 'currency' })],
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, [db, netWorthRange, isPrivacyMode, netWorth, totalAssets, totalDebts]);

  const handleTypeChange = (newType: Asset['type']) => {
    setType(newType);
    if (newType === 'cash' || newType === 'saving' || newType === 'gold' || newType === 'realestate_live' || newType === 'realestate_rent') {
      setLevel('1');
    } else if (newType === 'stock' || newType === 'realestate_land' || newType === 'bond') {
      setLevel('2');
    } else if (newType === 'crypto' || newType === 'private_equity' || newType === 'peer_lending') {
      setLevel('3');
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setLevel(asset.level);
    setType(asset.type);
    setName(asset.name);
    setAmountStr(formatNumberString(asset.amount));
    setCostPriceStr(asset.costPrice ? formatNumberString(asset.costPrice) : '');
    setRateStr(asset.rate ? String(asset.rate) : '');
    setStartDate(asset.startDate || '');
    setTermMonthsStr(asset.termMonths ? String(asset.termMonths) : '');
    setMaturityDate(asset.maturityDate || calculateMaturityDateISO(asset.startDate, asset.termMonths));
    setQuantityStr(asset.quantity ? formatNumberString(asset.quantity) : '');
    setCashflowStr(asset.cashflow ? formatNumberString(asset.cashflow) : '');
    setDivCashStr(asset.divCash ? formatNumberString(asset.divCash) : '');
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setEditingId(null);
    setName('');
    setAmountStr('');
    setCostPriceStr('');
    setRateStr('');
    setStartDate('');
    setTermMonthsStr('');
    setMaturityDate('');
    setQuantityStr('');
    setCashflowStr('');
    setDivCashStr('');
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFormattedNumber(amountStr);
    if (!name.trim() || amount <= 0) {
      alert('Vui lòng nhập tên tài sản và giá trị lớn hơn 0!');
      return;
    }

    const calculatedMaturity =
      maturityDate ||
      (type === 'saving' && startDate && termMonthsStr
        ? calculateMaturityDateISO(startDate, Number(termMonthsStr))
        : undefined);

    const newAsset: Asset = {
      id: editingId || Date.now(),
      level,
      type,
      name: name.trim(),
      amount,
      costPrice: costPriceStr ? parseFormattedNumber(costPriceStr) : undefined,
      rate: rateStr ? Number(rateStr) : undefined,
      startDate: startDate || undefined,
      termMonths: termMonthsStr ? Number(termMonthsStr) : undefined,
      maturityDate: calculatedMaturity,
      quantity: quantityStr ? parseFormattedNumber(quantityStr) : undefined,
      cashflow: cashflowStr ? parseFormattedNumber(cashflowStr) : undefined,
      divCash: divCashStr ? parseFormattedNumber(divCashStr) : undefined,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
    };

    onUpdateAsset(newAsset);
    handleCancelForm();
  };

  // Preview calculations
  const parsedAmt = parseFormattedNumber(amountStr);
  const parsedRate = Number(rateStr) || 0;
  const parsedTerm = Number(termMonthsStr) || 0;
  const savingMaturityInterest =
    type === 'saving' && parsedAmt > 0 && parsedRate > 0 && parsedTerm > 0
      ? Math.round(parsedAmt * (parsedRate / 100) * (parsedTerm / 12))
      : 0;

  const parsedQty = parseFormattedNumber(quantityStr);
  const parsedDivCash = parseFormattedNumber(divCashStr);
  const stockYearlyDiv =
    type === 'stock' && parsedQty > 0 && parsedDivCash > 0 ? parsedQty * parsedDivCash : 0;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT, SLEEK, BANKING APP STYLE */}
      <div className="md:hidden bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
        {/* Row 1: Tài Sản Ròng (Net Worth) - Trọng tâm tài chính, vừa mắt */}
        <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200/70 rounded-lg px-2.5 py-1.5">
          <div className="min-w-0 flex-1 mr-2">
            <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide block">
              Tài Sản Ròng (Net Worth)
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-700 tracking-tight block">
              {formatVND(netWorth, isPrivacyMode)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowWealthBenchmarkModal(true)}
            className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${wealthBenchmark.currentTier.badgeBg} flex items-center gap-1 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0`}
            title="Xem bảng mốc phân tầng tài sản tại Việt Nam"
          >
            <Award className="w-2.5 h-2.5 shrink-0 text-amber-600" />
            <span className="whitespace-nowrap">{wealthBenchmark.currentTier.topPercent} VN</span>
          </button>
        </div>

        {/* Row 2: Hai cột nhỏ gọn song song - Tổng tài sản & Nợ */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Cột trái: Tổng tài sản */}
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">
                Tổng Tài Sản
              </span>
              <span className="text-xs font-black text-slate-900 block mt-0.5">
                {formatVND(totalAssets, isPrivacyMode)}
              </span>
            </div>
            <div className="mt-1 pt-1 border-t border-slate-200/60 text-[8.5px] text-slate-500 font-medium">
              {isPrivacyMode ? '••••••' : wealthBenchmark.ratioText}
            </div>
          </div>

          {/* Cột phải: Nghĩa vụ nợ */}
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">
                Nghĩa Vụ Nợ
              </span>
              <span className="text-xs font-black text-rose-600 block mt-0.5">
                {formatVND(totalDebts, isPrivacyMode)}
              </span>
            </div>
            <div className="mt-1 pt-1 border-t border-slate-200/60 text-[8.5px] text-slate-500 font-medium">
              Đòn bẩy: {totalAssets > 0 ? ((totalDebts / totalAssets) * 100).toFixed(1) : 0}% TTS
            </div>
          </div>
        </div>

        {/* Row 3: Thống kê số lượng mục */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-600">
          <div className="flex items-center space-x-1.5 text-[9px]">
            <span><strong className="text-emerald-600">{db.assets.length}</strong> TS</span>
            <span className="text-slate-300">•</span>
            <span><strong className="text-rose-600">{db.debts.length}</strong> Nợ</span>
            <span className="text-slate-300">•</span>
            <span><strong className="text-blue-600">{db.goals.length}</strong> MT</span>
          </div>
          <div className="text-[9px] text-slate-500 font-medium">
            Lần lưu: <span className="font-semibold text-slate-700">{db.lastUpdate || 'Mới cập nhật'}</span>
          </div>
        </div>
      </div>

      {/* 2. DEDICATED DESKTOP VIEW (>= md) */}
      <div className="hidden md:block bg-white p-5 lg:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 lg:gap-4">
          {/* Card 1: Tổng Tài Sản */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Tổng Tài Sản
                </span>
                {/* Vị thế tài sản */}
                <button
                  type="button"
                  onClick={() => setShowWealthBenchmarkModal(true)}
                  className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${wealthBenchmark.currentTier.badgeBg} flex items-center gap-1 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0`}
                  title="Xem bảng mốc phân tầng tài sản tại Việt Nam"
                >
                  <Award className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span className="whitespace-nowrap">{wealthBenchmark.currentTier.topPercent} VN</span>
                </button>
              </div>

              <div className="text-xl lg:text-2xl font-black text-slate-900 block mt-2 tracking-tight">
                {formatVND(totalAssets, isPrivacyMode)}
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 font-medium leading-relaxed">
              {isPrivacyMode ? 'So với VN: ••••••' : wealthBenchmark.ratioText}
            </div>
          </div>

          {/* Card 2: Nghĩa Vụ Tài Chính */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between min-w-0">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Nghĩa Vụ Nợ
              </span>
              <div className="text-xl lg:text-2xl font-black text-rose-600 block mt-2 tracking-tight">
                {formatVND(totalDebts, isPrivacyMode)}
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 font-medium">
              Đòn bẩy: {totalAssets > 0 ? ((totalDebts / totalAssets) * 100).toFixed(1) : 0}% TTS
            </div>
          </div>

          {/* Card 3: Giá Trị Tài Sản Ròng */}
          <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200/80 flex flex-col justify-between min-w-0">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                Tài Sản Ròng (Net Worth)
              </span>
              <div className="text-xl lg:text-2xl font-black text-emerald-700 block mt-2 tracking-tight">
                {formatVND(netWorth, isPrivacyMode)}
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-800/90 font-medium">
              Thực có sau khi trừ hết mọi khoản nợ
            </div>
          </div>
        </div>

        {/* Quản lý danh mục & lần lưu */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span>Đang quản lý: <strong className="text-emerald-600">{db.assets.length} Danh mục</strong></span>
            <span className="text-slate-300">•</span>
            <span><strong className="text-rose-600">{db.debts.length} Nợ</strong></span>
            <span className="text-slate-300">•</span>
            <span><strong className="text-blue-600">{db.goals.length} Mục tiêu</strong></span>
          </div>
          <div className="text-slate-500 text-xs">
            Lần lưu gần nhất: <strong className="text-slate-800">{db.lastUpdate || 'Mới cập nhật'}</strong>
          </div>
        </div>
      </div>

      {/* 1. DEDICATED MOBILE DUAL PYRAMID: 2 THÁP SONG SONG SIÊU GỌN (< md) */}
      <div className="md:hidden bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-xs">
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <i className="fa-solid fa-pyramid text-emerald-600"></i>
            <span>Đối Chiếu 2 Tháp Tài Sản</span>
          </span>
          <span className="text-[10px] font-semibold text-slate-500">Thực Tế vs Mục Tiêu</span>
        </div>

        {/* 2 Tháp đặt song song nhau trên màn hình điện thoại */}
        <div className="grid grid-cols-2 gap-2 items-end">
          {/* Cột trái: Tháp Thực Tế Của Bạn */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-1.5 flex flex-col justify-between">
            <div className="text-center font-extrabold text-[10px] text-slate-800 border-b border-slate-200/60 pb-1 mb-1.5 truncate">
              1. Tháp Thực Tế
            </div>
            <div className="flex flex-col items-center space-y-1">
              {/* T3: Mạo hiểm */}
              <div className="w-[62%] bg-rose-50 border border-rose-200/90 rounded px-1 py-0.5 text-center shadow-2xs">
                <div className="text-[8.5px] font-extrabold text-rose-900 leading-tight">
                  T3: {isPrivacyMode ? '••' : `${r3}%`}
                </div>
                <div className="text-[7.5px] text-rose-700 font-semibold leading-tight truncate">
                  {isPrivacyMode ? '••••' : formatVND(p3, false)}
                </div>
                <div className="w-full bg-rose-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-rose-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, r3)}%` }} />
                </div>
              </div>

              {/* T2: Tăng trưởng */}
              <div className="w-[82%] bg-blue-50 border border-blue-200/90 rounded px-1 py-0.5 text-center shadow-2xs">
                <div className="text-[8.5px] font-extrabold text-blue-900 leading-tight">
                  T2: {isPrivacyMode ? '••' : `${r2}%`}
                </div>
                <div className="text-[7.5px] text-blue-700 font-semibold leading-tight truncate">
                  {isPrivacyMode ? '••••' : formatVND(p2, false)}
                </div>
                <div className="w-full bg-blue-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, r2)}%` }} />
                </div>
              </div>

              {/* T1: Nền tảng */}
              <div className="w-full bg-emerald-50 border border-emerald-200/90 rounded px-1 py-1 text-center shadow-2xs">
                <div className="text-[9px] font-extrabold text-emerald-900 leading-tight">
                  T1: {isPrivacyMode ? '••' : `${r1}%`}
                </div>
                <div className="text-[8px] text-emerald-700 font-semibold leading-tight truncate">
                  {isPrivacyMode ? '••••' : formatVND(p1, false)}
                </div>
                <div className="w-full bg-emerald-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-emerald-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, r1)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: Tháp Tiêu Chuẩn Mục Tiêu */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-1.5 flex flex-col justify-between">
            <div className="text-center font-extrabold text-[10px] text-blue-700 border-b border-slate-200/60 pb-1 mb-1.5 truncate">
              2. Tháp Mục Tiêu
            </div>
            <div className="flex flex-col items-center space-y-1">
              {/* T3 Mục Tiêu */}
              <div className="w-[62%] bg-white border border-slate-200 rounded px-1 py-0.5 text-center">
                <div className="text-[8.5px] font-bold text-slate-700 leading-tight">T3: 10%</div>
                <div className="text-[7.5px] text-rose-600 font-semibold leading-tight truncate">Mạo hiểm</div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-rose-500 h-full w-[10%]" />
                </div>
              </div>

              {/* T2 Mục Tiêu */}
              <div className="w-[82%] bg-white border border-slate-200 rounded px-1 py-0.5 text-center">
                <div className="text-[8.5px] font-bold text-slate-700 leading-tight">T2: 30%</div>
                <div className="text-[7.5px] text-blue-600 font-semibold leading-tight truncate">Tăng trưởng</div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-blue-500 h-full w-[30%]" />
                </div>
              </div>

              {/* T1 Mục Tiêu */}
              <div className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-center">
                <div className="text-[9px] font-bold text-slate-700 leading-tight">T1: 60%</div>
                <div className="text-[8px] text-emerald-600 font-semibold leading-tight truncate">Nền tảng</div>
                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-0.5">
                  <div className="bg-emerald-500 h-full w-[60%]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. DEDICATED DESKTOP COMPARISON (>= md) - PRESERVED 100% AS ORIGINAL */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 sm:gap-6">
        {/* Tháp Thực Tế */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-pyramid text-emerald-600"></i>
              <span>1. Tháp Thực Tế Của Bạn</span>
            </span>
            <span className="text-xs font-bold text-slate-500">Phân Bổ Hiện Tại</span>
          </h3>

          <div className="flex flex-col items-center space-y-2 pt-2">
            {/* Tầng 3 */}
            <div className="w-[60%] sm:w-[38%] bg-rose-50 border border-rose-200 px-2.5 py-2 rounded-lg shadow-2xs">
              <div className="text-center text-[10px] font-bold text-rose-900 leading-normal mb-1">
                <span className="block truncate pb-0.5">T3: Mạo Hiểm (Crypto, FX...)</span>
                <span className="text-[9px] font-semibold text-rose-700 block">
                  {isPrivacyMode ? '••••••' : `${r3}% (${formatVND(p3)})`}
                </span>
              </div>
              <div className="w-full bg-rose-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-rose-600 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, r3)}%` }}
                ></div>
              </div>
            </div>

            {/* Tầng 2 */}
            <div className="w-[85%] sm:w-[68%] bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl shadow-2xs">
              <div className="flex justify-between text-[11px] font-bold text-blue-900 mb-1">
                <span className="truncate">T2: Tăng Trưởng (Cổ phiếu, Đất...)</span>
                <span>{isPrivacyMode ? '••••••' : `${r2}% (${formatVND(p2)})`}</span>
              </div>
              <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, r2)}%` }}
                ></div>
              </div>
            </div>

            {/* Tầng 1 */}
            <div className="w-full sm:w-[98%] bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl shadow-2xs">
              <div className="flex justify-between text-[11px] font-bold text-emerald-900 mb-1">
                <span className="truncate">T1: Nền Tảng (Tiền, Vàng, BĐS ở...)</span>
                <span>{isPrivacyMode ? '••••••' : `${r1}% (${formatVND(p1)})`}</span>
              </div>
              <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, r1)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tháp Tiêu Chuẩn */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-square-check text-blue-600"></i>
              <span>2. Tháp Tiêu Chuẩn (Mục Tiêu)</span>
            </span>
            <span className="text-xs font-bold text-blue-600">Tỷ Lệ Chuẩn</span>
          </h3>

          <div className="flex flex-col items-center space-y-2 pt-2">
            <div className="w-[60%] sm:w-[38%] bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-lg opacity-85">
              <div className="text-center text-[10px] font-bold text-slate-700 leading-normal mb-1">
                <span className="block truncate pb-0.5">T3: Mạo Hiểm (Crypto, FX...)</span>
                <span className="text-[9px] font-semibold text-rose-600 block">10% (Mục tiêu)</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full">
                <div className="bg-rose-500 h-full w-[10%]"></div>
              </div>
            </div>

            <div className="w-[85%] sm:w-[68%] bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl opacity-85">
              <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                <span className="truncate">T2: Tăng Trưởng (Cổ phiếu, Đất...)</span>
                <span className="text-blue-600">30% (Mục tiêu)</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full">
                <div className="bg-blue-500 h-full w-[30%]"></div>
              </div>
            </div>

            <div className="w-full sm:w-[98%] bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl opacity-85">
              <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                <span className="truncate">T1: Nền Tảng (Tiền, Vàng, BĐS ở...)</span>
                <span className="text-emerald-600">60% (Mục tiêu)</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full">
                <div className="bg-emerald-500 h-full w-[60%]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations Box & Scientific Annotations */}
      {/* 1. MOBILE COMPACT RECOMMENDATIONS (< md) */}
      <div className="md:hidden bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
            <span>Đánh Giá Tỷ Lệ Tháp</span>
          </h3>
          <button
            type="button"
            onClick={() => setShowAnnotations(!showAnnotations)}
            className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-0.5"
          >
            <span>{showAnnotations ? 'Ẩn' : 'Chuẩn mực'}</span>
            {showAnnotations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* 3 micro badges for T1, T2, T3 */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {/* T1 */}
          <div
            className={`p-1.5 rounded-lg border text-[9.5px] flex flex-col justify-between ${
              r1 > 65
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : r1 < 55
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="font-extrabold truncate">T1 (60%)</div>
            <div className="font-bold text-xs mt-0.5">{r1}%</div>
            <div className="text-[8px] font-semibold truncate mt-0.5">
              {r1 > 65 ? `Thừa +${r1 - 60}%` : r1 < 55 ? `Thiếu ${60 - r1}%` : '✓ Chuẩn'}
            </div>
          </div>

          {/* T2 */}
          <div
            className={`p-1.5 rounded-lg border text-[9.5px] flex flex-col justify-between ${
              r2 > 35
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : r2 < 25
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="font-extrabold truncate">T2 (30%)</div>
            <div className="font-bold text-xs mt-0.5">{r2}%</div>
            <div className="text-[8px] font-semibold truncate mt-0.5">
              {r2 > 35 ? `Thừa +${r2 - 30}%` : r2 < 25 ? `Thiếu ${30 - r2}%` : '✓ Chuẩn'}
            </div>
          </div>

          {/* T3 */}
          <div
            className={`p-1.5 rounded-lg border text-[9.5px] flex flex-col justify-between ${
              r3 > 15
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : r3 > 10
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="font-extrabold truncate">T3 (≤10%)</div>
            <div className="font-bold text-xs mt-0.5">{r3}%</div>
            <div className="text-[8px] font-semibold truncate mt-0.5">
              {r3 > 10 ? `⚠️ Thừa +${r3 - 10}%` : '✓ An toàn'}
            </div>
          </div>
        </div>

        {/* 1-sentence quick advice on mobile */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-lg px-2 py-1 text-[9.5px] text-slate-700 font-medium leading-tight">
          💡 {r3 > 12 ? 'Hạ bớt tỷ trọng Tầng 3 (Mạo hiểm) để bảo toàn vốn.' : r1 < 55 ? 'Nên tăng Tiết kiệm/Vàng củng cố Tầng 1 nền móng.' : 'Tháp tài sản đang có tỷ trọng cân đối an toàn.'}
        </div>

        {showAnnotations && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-[10px] space-y-1.5 text-slate-600">
            <p><strong>T1 (60%):</strong> Tiền mặt, tiết kiệm, vàng, BĐS ở - mỏ neo an toàn gia đình.</p>
            <p><strong>T2 (30%):</strong> Cổ phiếu, đất nền tiềm năng - động cơ nhân tài sản.</p>
            <p><strong>T3 (≤10%):</strong> Crypto, FX, cho vay - rủi ro cao, khống chế chặt chẽ.</p>
          </div>
        )}
      </div>

      {/* 2. DESKTOP DETAILED RECOMMENDATIONS (>= md) - PRESERVED 100% */}
      <div className="hidden md:block bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <Sliders className="w-4 h-4 text-amber-500 mr-2" />
            <span>Hướng Dẫn Điều Chỉnh Tỷ Lệ (Đối Chiếu)</span>
          </h3>
          <button
            type="button"
            onClick={() => setShowAnnotations(!showAnnotations)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
          >
            <span>{showAnnotations ? 'Ẩn Chú Thích' : 'Mở Chú Thích & Chuẩn Mực'}</span>
            {showAnnotations ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Scientific Annotations Guide */}
        {showAnnotations && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <i className="fa-solid fa-graduation-cap text-blue-600"></i>
              <span>Quy Chuẩn Khoa Học Phân Bổ Tháp Tài Sản (Asset Allocation Framework)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed">
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-emerald-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Tầng 1: Nền Tảng Phòng Vệ (60%)</span>
                </div>
                <p className="text-slate-600">
                  Gồm Tiền mặt, Tiết kiệm ngân hàng, Vàng vật chất và BĐS ở thực. Vai trò là "mỏ neo" bảo đảm cuộc sống không bị đứt gãy tài chính trước mọi khủng hoảng kinh tế hoặc biến cố gia đình.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-blue-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>Tầng 2: Tăng Trưởng Quy Mô (30%)</span>
                </div>
                <p className="text-slate-600">
                  Gồm Cổ phiếu doanh nghiệp đầu ngành, Đất nền đón đầu quy hoạch, Trái phiếu doanh nghiệp uy tín. Đóng vai trò là động cơ sinh lời vượt lạm phát để nhân tài sản dài hạn.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-rose-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>Tầng 3: Tăng Tốc & Khám Phá (≤10%)</span>
                </div>
                <p className="text-slate-600">
                  Gồm Crypto, Ngoại hối, Cho vay cá nhân, Góp vốn mạo hiểm. Có tiềm năng sinh lời đột biến nhưng rủi ro mất trắng, tuyệt đối khống chế tỷ trọng không vượt quá 10%.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {totalAssets === 0 ? (
            <div className="col-span-3 text-center py-2 text-slate-400">
              Hãy bắt đầu thêm tài sản để xem hướng dẫn điều chỉnh tỷ lệ.
            </div>
          ) : (
            <>
              <div
                className={`p-3 rounded-xl border ${
                  r1 > 65
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : r1 < 55
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex justify-between font-bold mb-1">
                  <span>Tầng 1 (Nền Tảng)</span>
                  <span>{r1 > 65 ? `Thừa +${r1 - 60}%` : r1 < 55 ? `Thiếu ${60 - r1}%` : 'Chuẩn (60%)'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {r1 > 65
                    ? 'Chân đế an toàn vững chắc. Nên tích lũy thêm kênh Tầng 2 để tăng sinh lời quy mô.'
                    : r1 < 55
                    ? 'Nên tăng Tiền tiết kiệm, Vàng hoặc BĐS để củng cố nền móng Tầng 1 an toàn.'
                    : 'Tỷ lệ nền tảng đạt chuẩn cân bằng bảo vệ.'}
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  r2 > 35
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : r2 < 25
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex justify-between font-bold mb-1">
                  <span>Tầng 2 (Tăng Trưởng)</span>
                  <span>{r2 > 35 ? `Thừa +${r2 - 30}%` : r2 < 25 ? `Thiếu ${30 - r2}%` : 'Chuẩn (30%)'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {r2 < 25
                    ? 'Có thể gia tăng Cổ phiếu hoặc Đất nền tiềm năng để tăng tốc gia tăng quy mô tài sản.'
                    : r2 > 35
                    ? 'Có thể chốt lời bớt để củng cố chân đế Tầng 1 hoặc cơ cấu lại danh mục.'
                    : 'Tỷ trọng tăng trưởng tối ưu.'}
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  r3 > 15
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex justify-between font-bold mb-1">
                  <span>Tầng 3 (Mạo Hiểm)</span>
                  <span>{r3 > 10 ? `Cảnh báo: Thừa +${r3 - 10}%` : 'Chuẩn (≤10%)'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {r3 > 10
                    ? 'Rủi ro cao! Hãy hạ bớt tỷ trọng Crypto, FX, Góp vốn rủi ro hoặc Cho vay tín dụng.'
                    : 'Nằm trong vùng quản trị an toàn tối ưu.'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Button Open Asset Form */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (showForm) handleCancelForm();
            else setShowForm(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>{showForm ? 'Đóng Khung Nhập' : '+ Thêm Tài Sản Vào Tháp'}</span>
        </button>
      </div>

      {/* Asset Form Modal (Responsive Bottom-Sheet on Mobile) */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Mobile Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center">
                  <PlusCircle className="w-5 h-5 text-emerald-600 mr-2 shrink-0" />
                  <span className="truncate">{editingId ? `Chỉnh Sửa Tài Sản: ${name}` : 'Thêm Tài Sản Mới Vào Tháp'}</span>
                </h3>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Phân Nhóm Tầng Tháp Tài Sản
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-emerald-500"
              >
                <option value="1">Tầng 1: Bảo Vệ (Tiền mặt, Tiết kiệm, Vàng, BĐS ở...)</option>
                <option value="2">Tầng 2: Tăng Trưởng (Cổ phiếu, BĐS đất nền, Trái phiếu...)</option>
                <option value="3">Tầng 3: Mạo Hiểm (Crypto, FX, Góp vốn, Cho vay...)</option>
              </select>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-800 flex items-center">
              {levelDescriptions[level]}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Loại Tài Sản</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none"
              >
                <optgroup label="Tầng 1: Bảo Vệ & Nền Tảng">
                  <option value="cash">Tiền Mặt / Tiền Gửi Thanh Toán</option>
                  <option value="saving">Sổ Tiết Kiệm Kỳ Hạn</option>
                  <option value="gold">Vàng Tích Trữ (SJC, Nhẫn Trơn)</option>
                  <option value="realestate_live">BĐS Để Ở (An Cư)</option>
                  <option value="realestate_rent">BĐS Cho Thuê (Dòng Tiền)</option>
                </optgroup>
                <optgroup label="Tầng 2: Tăng Trưởng & Sinh Lời">
                  <option value="stock">Cổ Phiếu / Chứng Chỉ Quỹ (ETF)</option>
                  <option value="realestate_land">BĐS Đất Nền / Đầu Tư Tăng Trưởng</option>
                  <option value="bond">Trái Phiếu (Doanh Nghiệp / Chính Phủ)</option>
                </optgroup>
                <optgroup label="Tầng 3: Mạo Hiểm & Dòng Tiền Cao">
                  <option value="crypto">Crypto / Forex / Mạo Hiểm</option>
                  <option value="private_equity">Góp Vốn Đầu Tư Tư Nhân</option>
                  <option value="peer_lending">Cho Vay Cá Nhân / Tín Dụng</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Tên Tài Sản / Mã</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: HPG, Tiết kiệm BIDV..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Giá Trị Hiện Tại (VNĐ)</label>
              <input
                type="text"
                value={amountStr}
                onChange={(e) => setAmountStr(formatNumberString(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-emerald-700 outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Conditional Extra Fields */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 border-t border-slate-100 pt-3">
            {(type === 'stock' || type === 'crypto' || type === 'realestate_land' || type === 'gold' || type === 'private_equity') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tổng Giá Vốn Ban Đầu (VNĐ)
                </label>
                <input
                  type="text"
                  value={costPriceStr}
                  onChange={(e) => setCostPriceStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                />
              </div>
            )}

            {(type === 'stock' || type === 'gold') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {type === 'stock' ? 'Số Lượng Cổ Phiếu (CP)' : 'Số Lượng Vàng (Chỉ)'}
                </label>
                <input
                  type="text"
                  value={quantityStr}
                  onChange={(e) => setQuantityStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                />
              </div>
            )}

            {(type === 'saving' || type === 'bond' || type === 'peer_lending') && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Lãi Suất (%/năm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={rateStr}
                    onChange={(e) => setRateStr(e.target.value)}
                    placeholder="VD: 5.8"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Ngày Gửi / Bắt Đầu
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Kỳ Hạn (Tháng)
                  </label>
                  <input
                    type="number"
                    value={termMonthsStr}
                    onChange={(e) => setTermMonthsStr(e.target.value)}
                    placeholder="VD: 6, 12, 24"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                  />
                </div>

                {type === 'saving' && (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-800 mb-1 flex items-center justify-between">
                      <span>Ngày Đáo Hạn Sổ</span>
                      <span className="text-[10px] text-amber-600 font-normal">
                        {startDate && termMonthsStr ? '(Tự tính theo kỳ hạn)' : ''}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={
                        maturityDate ||
                        (startDate && termMonthsStr ? calculateMaturityDateISO(startDate, Number(termMonthsStr)) : '')
                      }
                      onChange={(e) => setMaturityDate(e.target.value)}
                      className="w-full bg-amber-50/70 border border-amber-300 rounded-xl p-2 text-xs font-semibold outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </>
            )}

            {(type === 'realestate_rent' || type === 'private_equity' || type === 'peer_lending') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Dòng Tiền Thu Về / Tháng (VNĐ)
                </label>
                <input
                  type="text"
                  value={cashflowStr}
                  onChange={(e) => setCashflowStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                />
              </div>
            )}

            {type === 'stock' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Cổ Tức Tiền Mặt (VNĐ/CP/Năm)
                </label>
                <input
                  type="text"
                  value={divCashStr}
                  onChange={(e) => setDivCashStr(formatNumberString(e.target.value))}
                  placeholder="VD: 1.500"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none"
                />
              </div>
            )}
          </div>

          {savingMaturityInterest > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-800 font-semibold">
              💡 Lãi dự kiến nhận khi đáo hạn: <span className="font-bold">{formatVND(savingMaturityInterest)}</span>
            </div>
          )}

          {stockYearlyDiv > 0 && (
            <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-xs text-blue-900 font-semibold">
              💰 Cổ tức tiền mặt dự kiến: <span className="font-bold">{formatVND(stockYearlyDiv)} / năm</span> (≈{' '}
              {formatVND(Math.round(stockYearlyDiv / 12))} / tháng)
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer"
            >
              {editingId ? '✓ Cập Nhật Thay Đổi Tài Sản' : '+ Thêm Vào Danh Mục Tài Sản'}
            </button>
            <button
              type="button"
              onClick={handleCancelForm}
              className="px-5 py-3 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </form>
          </div>
        </div>
      )}

      {/* Asset Table Container */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3 bg-white">
          <div
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none min-w-0 flex-1"
            onClick={() => setShowTable(!showTable)}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
              {showTable ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                  Danh Mục Tài Sản Quản Lý
                </h3>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0 whitespace-nowrap">
                  {db.assets.length} mục
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">
                Kiểm soát lãi suất, kỳ hạn và dòng tiền định kỳ
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowTable(!showTable)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="whitespace-nowrap">{showTable ? 'Thu Gọn' : 'Xem Chi Tiết'}</span>
          </button>
        </div>

        {showTable && (
          <div className="border-t border-slate-100 p-2.5 sm:p-5 pt-2 sm:pt-3 space-y-2 sm:space-y-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[10.5px] text-slate-500 font-medium truncate">
                Bảng chi tiết các lớp tài sản đã khởi tạo:
              </span>
              <div className="flex items-center space-x-1 sm:space-x-2 text-xs shrink-0">
                <span className="text-[10.5px] font-semibold text-slate-600 hidden sm:inline">Sắp xếp:</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold outline-none focus:border-emerald-500"
                >
                  <option value="default">Mặc định</option>
                  <option value="value-desc">Giá trị giảm dần</option>
                  <option value="value-asc">Giá trị tăng dần</option>
                  <option value="name-asc">Tên tài sản (A → Z)</option>
                  <option value="level">Tầng tháp (Tầng 1 → 3)</option>
                </select>
              </div>
            </div>

            {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT CARD LIST */}
            <div className="md:hidden space-y-1.5">
              {sortedAssets.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Chưa có tài sản nào. Vui lòng thêm ở khung trên.
                </div>
              ) : (
                sortedAssets.map((a, index) => {
                  const levelBadge =
                    a.level === '1'
                      ? 'bg-emerald-100 text-emerald-800'
                      : a.level === '2'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-rose-100 text-rose-800';
                  const categoryName = assetTypeLabels[a.type] || 'Tài Sản Khác';

                  const detailsList: string[] = [];
                  if (a.type === 'saving' || a.type === 'bond' || a.type === 'peer_lending') {
                    if (a.rate) detailsList.push(`Lãi: ${a.rate}%/n`);
                    if (a.termMonths) detailsList.push(`${a.termMonths}T`);
                  } else if (a.type === 'stock') {
                    if (a.quantity) detailsList.push(`${formatNumberString(a.quantity)} CP`);
                    if (a.costPrice && a.quantity)
                      detailsList.push(`Vốn: ${formatVND(Math.round(a.costPrice / a.quantity))}`);
                  } else if (a.type === 'gold') {
                    if (a.quantity) detailsList.push(`${formatNumberString(a.quantity)} chỉ`);
                  }

                  let pnlMobile = null;
                  if (a.costPrice && a.costPrice > 0) {
                    const diff = a.amount - a.costPrice;
                    const pct = ((diff / a.costPrice) * 100).toFixed(1);
                    const isGain = diff >= 0;
                    pnlMobile = (
                      <span className={`text-[9.5px] font-bold ${isGain ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isGain ? '+' : ''}{pct}% ({formatVND(diff)})
                      </span>
                    );
                  }

                  let cashflowLine = null;
                  if (a.type === 'realestate_rent' || a.type === 'private_equity' || a.type === 'peer_lending') {
                    if (a.cashflow) {
                      cashflowLine = (
                        <div className="text-right">
                          <span className="text-[8.5px] text-slate-400 block leading-tight">Dòng tiền thu</span>
                          <span className="text-[11px] font-bold text-emerald-600 leading-tight">+{formatVND(a.cashflow, isPrivacyMode)}/th</span>
                        </div>
                      );
                    }
                  } else if (a.type === 'stock' && a.quantity && a.divCash) {
                    const mDiv = Math.round((a.quantity * a.divCash) / 12);
                    cashflowLine = (
                      <div className="text-right">
                        <span className="text-[8.5px] text-slate-400 block leading-tight">Cổ tức tiền</span>
                        <span className="text-[11px] font-bold text-emerald-600 leading-tight">+{formatVND(mDiv, isPrivacyMode)}/th</span>
                      </div>
                    );
                  } else if (a.type === 'saving' && a.rate && a.termMonths) {
                    const totalInterest = Math.round(a.amount * (a.rate / 100) * (a.termMonths / 12));
                    const avgMonthly = Math.round(totalInterest / a.termMonths);
                    cashflowLine = (
                      <div className="text-right">
                        <span className="text-[8.5px] text-slate-400 block leading-tight">Lãi đáo hạn</span>
                        <span className="text-[11px] font-bold text-blue-600 leading-tight">+{formatVND(totalInterest, isPrivacyMode)}</span>
                        <span className="text-[8.5px] text-slate-400 block leading-tight">≈ +{formatVND(avgMonthly, isPrivacyMode)}/th</span>
                      </div>
                    );
                  }

                  return (
                    <div key={a.id} className="bg-slate-50/90 hover:bg-slate-50 rounded-xl border border-slate-200/90 p-2.5 space-y-1.5 transition shadow-2xs">
                      {/* Row 1: STT, Tầng, Tên tài sản, Badge phân loại & Nút Sửa/Xoá */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${levelBadge}`}>
                            T{a.level}
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate">{a.name}</span>
                          <span className="text-[10px] text-slate-500 font-normal truncate">({categoryName})</span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={() => handleEdit(a)}
                            className="p-1 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Sửa tài sản"
                          >
                            <Pen className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa tài sản "${a.name}"?`)) {
                                onRemoveAsset(a.id);
                              }
                            }}
                            className="p-1 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Xóa tài sản"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Giá trị, PnL & Dòng tiền sinh lợi */}
                      <div className="flex items-baseline justify-between pt-1 border-t border-slate-200/70 text-xs">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-slate-900">{formatVND(a.amount, isPrivacyMode)}</span>
                          {pnlMobile}
                        </div>
                        {cashflowLine}
                      </div>

                      {/* Row 3: Các chỉ số chi tiết (Kỳ hạn, Lãi suất, Số lượng...) nằm gọn một hàng */}
                      {(a.type === 'saving' || detailsList.length > 0 || a.updatedAt) && (
                        <div className="pt-1 border-t border-slate-200/70 flex flex-wrap items-center gap-1 text-[9px]">
                          {a.type === 'saving' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold whitespace-nowrap">
                              <Calendar className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                              <span>Đáo hạn: {formatDateVN(a.maturityDate) || calculateMaturityDate(a.startDate, a.termMonths) || 'Chưa đặt'}</span>
                            </span>
                          )}
                          {detailsList.map((item, i) => (
                            <span key={i} className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-700 font-medium whitespace-nowrap">
                              {item}
                            </span>
                          ))}
                          {a.updatedAt && (
                            <span className="text-slate-400 text-[8.5px] ml-auto whitespace-nowrap">
                              CN: {a.updatedAt}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 2. DEDICATED DESKTOP VIEW (>= md) - FULL TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                    <th className="p-3 text-center w-12">STT</th>
                    <th className="p-3">Tài Sản & Phân Loại</th>
                    <th className="p-3 text-center">Tầng</th>
                    <th className="p-3 text-right">Giá Trị & Hiệu Suất</th>
                    <th className="p-3 text-right">Dòng Tiền Chi Tiết</th>
                    <th className="p-3 text-center">Ngày Cập Nhật</th>
                    <th className="p-3 text-center w-24">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sortedAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        Chưa có tài sản nào. Vui lòng thêm ở khung trên.
                      </td>
                    </tr>
                  ) : (
                    sortedAssets.map((a, index) => {
                      const levelBadge =
                        a.level === '1'
                          ? 'bg-emerald-100 text-emerald-800'
                          : a.level === '2'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800';
                      const categoryName = assetTypeLabels[a.type] || 'Tài Sản Khác';

                      const detailsList: string[] = [];
                      if (a.type === 'saving' || a.type === 'bond' || a.type === 'peer_lending') {
                        if (a.rate) detailsList.push(`Lãi: ${a.rate}%/năm`);
                        if (a.termMonths) detailsList.push(`Kỳ hạn: ${a.termMonths}T`);
                        if (a.startDate) detailsList.push(`Bắt đầu: ${formatDateVN(a.startDate)}`);
                      } else if (a.type === 'stock') {
                        if (a.quantity) detailsList.push(`SL: ${formatNumberString(a.quantity)} CP`);
                        if (a.costPrice && a.quantity)
                          detailsList.push(`Giá vốn: ${formatVND(Math.round(a.costPrice / a.quantity))}`);
                      } else if (a.type === 'gold') {
                        if (a.quantity) detailsList.push(`SL: ${formatNumberString(a.quantity)} chỉ`);
                      } else if (a.type === 'realestate_rent') {
                        if (a.cashflow) detailsList.push(`Dòng tiền: +${formatVND(a.cashflow)}/tháng`);
                      }

                      let pnlHTML = null;
                      if (a.costPrice && a.costPrice > 0) {
                        const diff = a.amount - a.costPrice;
                        const pct = ((diff / a.costPrice) * 100).toFixed(1);
                        const isGain = diff >= 0;
                        pnlHTML = (
                          <div className={`text-[10px] font-bold ${isGain ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isGain ? '+' : ''}
                            {pct}% ({formatVND(diff)})
                          </div>
                        );
                      }

                      let cashflowDetail = <span className="text-slate-400">—</span>;
                      if (a.type === 'realestate_rent' || a.type === 'private_equity' || a.type === 'peer_lending') {
                        if (a.cashflow) {
                          cashflowDetail = (
                            <div>
                              <div className="font-bold text-emerald-600">+{formatVND(a.cashflow)} / tháng</div>
                              <div className="text-[10px] text-slate-500">
                                ≈ +{formatVND(Math.round(a.cashflow / 30))} / ngày
                              </div>
                            </div>
                          );
                        }
                      } else if (a.type === 'stock' && a.quantity && a.divCash) {
                        const mDiv = Math.round((a.quantity * a.divCash) / 12);
                        cashflowDetail = (
                          <div>
                            <div className="font-bold text-emerald-600">+{formatVND(mDiv)} / tháng</div>
                            <div className="text-[10px] text-slate-500">
                              Năm: +{formatVND(a.quantity * a.divCash)}
                            </div>
                          </div>
                        );
                      } else if (a.type === 'saving' && a.rate && a.termMonths) {
                        const totalInterest = Math.round(a.amount * (a.rate / 100) * (a.termMonths / 12));
                        const avgMonthly = Math.round(totalInterest / a.termMonths);
                        cashflowDetail = (
                          <div>
                            <div className="font-semibold text-blue-600">Đáo hạn: +{formatVND(totalInterest)}</div>
                            <div className="text-[10px] text-slate-500">Quy đổi: +{formatVND(avgMonthly)}/tháng</div>
                          </div>
                        );
                      }

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 text-center font-bold text-slate-400">{index + 1}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 text-xs">{a.name}</div>
                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">{categoryName}</div>
                            {a.type === 'saving' && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                <Calendar className="w-3 h-3 text-amber-700" />
                                <span>Ngày đáo hạn:</span>
                                <span className="text-amber-950 font-black">
                                  {formatDateVN(a.maturityDate) || calculateMaturityDate(a.startDate, a.termMonths) || 'Chưa đặt'}
                                </span>
                              </div>
                            )}
                            {detailsList.length > 0 && (
                              <div className="text-[10px] text-slate-600 mt-1 flex flex-wrap items-center gap-1.5">
                                {detailsList.map((item, i) => (
                                  <React.Fragment key={i}>
                                    <span>{item}</span>
                                    {i < detailsList.length - 1 && <span className="text-slate-300">•</span>}
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${levelBadge}`}>
                              Tầng {a.level}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-black text-slate-900">{formatVND(a.amount, isPrivacyMode)}</div>
                            {pnlHTML}
                          </td>
                          <td className="p-3 text-right">{cashflowDetail}</td>
                          <td className="p-3 text-center text-[11px] text-slate-500">{a.updatedAt || 'Mới'}</td>
                          <td className="p-3 text-center space-x-1">
                            <button
                              onClick={() => handleEdit(a)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="Sửa"
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Bạn có chắc chắn muốn xóa tài sản "${a.name}"?`)) {
                                  onRemoveAsset(a.id);
                                }
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Net Worth Chart */}
      <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm space-y-2 sm:space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-2 gap-1.5 sm:gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mr-1.5 sm:mr-2" />
            <span>Biến Động Tài Sản Ròng Thực Tế</span>
          </h3>
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 sm:p-1 rounded-lg text-[10px] sm:text-[11px] font-bold">
            {(['quarter', 'year', '3years', '5years'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setNetWorthRange(range)}
                className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded transition cursor-pointer ${
                  netWorthRange === range ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {range === 'quarter' ? 'Quý' : range === 'year' ? 'Năm' : range === '3years' ? '3 Năm' : '5 Năm'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-44 sm:h-72">
          <canvas ref={chartCanvasRef}></canvas>
        </div>
      </div>

      {/* Vietnam Wealth Benchmark Modal */}
      <BenchmarkModal
        isOpen={showWealthBenchmarkModal}
        onClose={() => setShowWealthBenchmarkModal(false)}
        type="wealth"
        currentValue={totalAssets}
        isPrivacyMode={isPrivacyMode}
      />
    </div>
  );
};
