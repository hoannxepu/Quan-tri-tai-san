import React, { useState, useEffect, useRef } from 'react';
import { Debt, DatabaseState, DebtCategory } from '../types';
import { formatVND, formatNumberString, parseFormattedNumber, formatDateVN, calculateMaturityDate, calculateMaturityDateISO, getStandardTimeline, getActualTimelinePoints } from '../utils/format';
import { createPointValuePlugin } from '../utils/chartPlugin';
import { Chart, registerables } from 'chart.js';
import { Scale, PlusCircle, Pen, Check, Trash2, Eye, ChevronDown, ChevronUp, AlertTriangle, Calendar, X, TrendingUp, Award, Info, ChevronRight } from 'lucide-react';
import { getVietnamIncomeBenchmark } from '../utils/benchmarkUtils';
import { BenchmarkModal } from './BenchmarkModal';

Chart.register(...registerables);

interface TabDebtsProps {
  db: DatabaseState;
  isPrivacyMode: boolean;
  onUpdateDebt: (debt: Debt) => void;
  onRemoveDebt: (id: number) => void;
  onUpdateIncome: (salary: number, other: number) => void;
}

const debtCategoryDescriptions: Record<DebtCategory, string> = {
  type1: 'Loại 1 (Nợ vay có lãi): Có gốc, có lãi suất ưu đãi/thả nổi, thời hạn dài (Vay mua nhà, đất, ô tô...).',
  type2: 'Loại 2 (Nợ trả góp có kỳ hạn): Có tổng nợ gốc, 0% lãi, trừ tiền đều đặn hằng tháng.',
  type_free: 'Loại 3 (Mượn nợ người thân / Vay tự do): Có gốc, 0% lãi, trả linh hoạt không áp lực.',
  type3: 'Loại 4 (Chi phí định kỳ không có gốc): Dòng tiền đi ra định kỳ dài hạn không nợ gốc (Bảo hiểm, thuê nhà...).',
  type4: 'Loại 5 (Chi tiêu sinh hoạt thường xuyên): Ngân sách tiêu dùng hằng tháng (Điện, nước, ăn uống...).',
};

export const TabDebts: React.FC<TabDebtsProps> = ({
  db,
  isPrivacyMode,
  onUpdateDebt,
  onRemoveDebt,
  onUpdateIncome,
}) => {
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [showDebtTable, setShowDebtTable] = useState(false);
  const [showBreakdownTable, setShowBreakdownTable] = useState(false);
  const [showIncomeBenchmarkModal, setShowIncomeBenchmarkModal] = useState(false);
  const [showCashflowStandards, setShowCashflowStandards] = useState(false);
  const [cashflowRange, setCashflowRange] = useState<'quarter' | 'year' | '3years' | '5years'>('quarter');

  // Income editing
  const [isEditingSalary, setIsEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState(formatNumberString(db.salaryIncome));
  const [isEditingOther, setIsEditingOther] = useState(false);
  const [otherInput, setOtherInput] = useState(formatNumberString(db.otherIncome));

  // Debt form states
  const [editingDebtId, setEditingDebtId] = useState<number | null>(null);
  const [debtCat, setDebtCat] = useState<DebtCategory>('type1');
  const [debtName, setDebtName] = useState('');
  const [debtFreq, setDebtFreq] = useState<Debt['frequency']>('monthly');
  const [debtDay, setDebtDay] = useState(20);
  const [debtStartDate, setDebtStartDate] = useState('');
  const [debtNote, setDebtNote] = useState('');

  const [debtAmountStr, setDebtAmountStr] = useState('');
  const [debtTermMonthsStr, setDebtTermMonthsStr] = useState('');
  const [installmentAmountStr, setInstallmentAmountStr] = useState('');
  const [periodicAmountStr, setPeriodicAmountStr] = useState('');
  const [promoMonthsStr, setPromoMonthsStr] = useState('');
  const [promoRateStr, setPromoRateStr] = useState('');
  const [normalRateStr, setNormalRateStr] = useState('');
  const [debtPromoEndDate, setDebtPromoEndDate] = useState('');

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const debtFormRef = useRef<HTMLFormElement | null>(null);
  const debtNameInputRef = useRef<HTMLInputElement | null>(null);

  // Sync income inputs when db updates
  useEffect(() => {
    if (!isEditingSalary) setSalaryInput(formatNumberString(db.salaryIncome));
  }, [db.salaryIncome, isEditingSalary]);

  useEffect(() => {
    if (!isEditingOther) setOtherInput(formatNumberString(db.otherIncome));
  }, [db.otherIncome, isEditingOther]);

  // Passive Income Calculation from Tab 1 Assets
  const totalPassiveInflow = db.assets.reduce((sum, a) => {
    if (a.type === 'realestate_rent' || a.type === 'private_equity' || a.type === 'peer_lending') {
      return sum + (a.cashflow || 0);
    }
    if (a.type === 'stock' && a.quantity && a.divCash) {
      return sum + Math.round((a.quantity * a.divCash) / 12);
    }
    if (a.type === 'saving' && a.rate && a.termMonths) {
      return sum + Math.round((a.amount * (a.rate / 100) * (a.termMonths / 12)) / a.termMonths);
    }
    return sum;
  }, 0);

  const totalMonthlyInflow = (db.salaryIncome || 0) + (db.otherIncome || 0) + totalPassiveInflow;
  const incomeBenchmark = getVietnamIncomeBenchmark(totalMonthlyInflow);

  // Categorize debts & calculate monthly outflows
  const catStats = {
    type1: { label: 'Loại 1', name: 'Nợ vay có lãi (Ngân hàng, mua nhà...)', count: 0, monthly: 0, tag: 'bg-rose-50 text-rose-700 border-rose-200' },
    type2: { label: 'Loại 2', name: 'Nợ trả góp định kỳ (0% lãi)', count: 0, monthly: 0, tag: 'bg-amber-50 text-amber-700 border-amber-200' },
    type_free: { label: 'Loại 3', name: 'Mượn nợ người thân / Vay tự do (Linh hoạt)', count: 0, monthly: 0, tag: 'bg-purple-50 text-purple-700 border-purple-200' },
    type3: { label: 'Loại 4', name: 'Chi phí định kỳ không có gốc (Bảo hiểm, thuê nhà...)', count: 0, monthly: 0, tag: 'bg-blue-50 text-blue-700 border-blue-200' },
    type4: { label: 'Loại 5', name: 'Chi phí sinh hoạt thường xuyên', count: 0, monthly: 0, tag: 'bg-slate-100 text-slate-600 border-slate-200' },
  };

  let totalMonthlyOutflow = 0;
  let totalPrincipalMonthly = 0;
  let totalInterestMonthly = 0;
  let totalPeriodicMonthly = 0;
  let totalLivingMonthly = 0;

  db.debts.forEach((d) => {
    if (d.status !== 'Đã tất toán') {
      if (d.category === 'type_free') {
        catStats.type_free.count += 1;
      } else {
        let m = d.monthlyBefore || d.installmentAmount || d.periodicAmount || 0;
        if (d.frequency === 'annual') m = Math.round(m / 12);
        else if (d.frequency === 'biannual') m = Math.round(m / 6);
        else if (d.frequency === 'quarterly') m = Math.round(m / 3);

        if (catStats[d.category]) {
          catStats[d.category].count += 1;
          catStats[d.category].monthly += m;
        }
        totalMonthlyOutflow += m;

        if (d.category === 'type1') {
          const principal = d.termMonths ? Math.round(d.amount / d.termMonths) : 0;
          totalPrincipalMonthly += principal;
          totalInterestMonthly += Math.max(0, m - principal);
        } else if (d.category === 'type2') {
          totalPrincipalMonthly += m;
        } else if (d.category === 'type3') {
          totalPeriodicMonthly += m;
        } else if (d.category === 'type4') {
          totalLivingMonthly += m;
        }
      }
    }
  });

  const totalQuarterlyOutflow = totalMonthlyOutflow * 3;
  const totalAnnualOutflow = totalMonthlyOutflow * 12;
  const netMonthlyCashflow = totalMonthlyInflow - totalMonthlyOutflow;
  const burdenRatio = totalMonthlyInflow > 0 ? Math.round((totalMonthlyOutflow / totalMonthlyInflow) * 100) : 0;

  // Render Cashflow Chart - chỉ hiển thị các tháng thực tế có dữ liệu từ tháng bắt đầu
  useEffect(() => {
    if (!chartCanvasRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const points = getActualTimelinePoints(
      db,
      {
        netWorth: 0,
        totalAssets: 0,
        totalDebts: 0,
        inflow: totalMonthlyInflow,
        outflow: totalMonthlyOutflow,
        netCashFlow: netMonthlyCashflow,
        debtProgressPercent: 0,
        dcaProgressPercent: 0,
        runwayPercent: 0,
        milestoneProgressPercent: 0,
      },
      cashflowRange
    );

    const labels = points.map((p) => p.label);
    const inflowData = points.map((p) => p.inflow);
    const outflowData = points.map((p) => p.outflow);
    const netData = points.map((p) => p.netCashFlow);

    const ctx = chartCanvasRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tổng Thu Nhập',
            data: inflowData,
            borderColor: '#059669',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#059669',
            pointBorderWidth: 2,
          },
          {
            label: 'Tổng Nghĩa Vụ Chi Trả',
            data: outflowData,
            borderColor: '#e11d48',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#e11d48',
            pointBorderWidth: 2,
          },
          {
            label: 'Dòng Tiền Ròng',
            data: netData,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#2563eb',
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
            bottom: 20,
            left: 14,
            right: 14,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${formatVND(Number(item.raw), isPrivacyMode)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (val) =>
                isPrivacyMode
                  ? '***'
                  : (Number(val) / 1e6).toFixed(1) + ' Tr',
            },
          },
        },
      },
      plugins: [createPointValuePlugin({ isPrivacyMode, valueType: 'currency' })],
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, [db, cashflowRange, isPrivacyMode, totalMonthlyInflow, totalMonthlyOutflow, netMonthlyCashflow]);

  const handleSaveIncome = (type: 'salary' | 'other') => {
    if (type === 'salary') {
      const val = parseFormattedNumber(salaryInput);
      onUpdateIncome(val, db.otherIncome);
      setIsEditingSalary(false);
    } else {
      const val = parseFormattedNumber(otherInput);
      onUpdateIncome(db.salaryIncome, val);
      setIsEditingOther(false);
    }
  };

  const handleEditDebt = (d: Debt) => {
    setEditingDebtId(d.id);
    setDebtCat(d.category);
    setDebtName(d.name);
    setDebtFreq(d.frequency);
    setDebtDay(d.day || 20);
    setDebtStartDate(d.startDate || '');
    setDebtNote(d.note || '');

    setDebtAmountStr(formatNumberString(d.amount));
    setDebtTermMonthsStr(d.termMonths ? String(d.termMonths) : '');
    setInstallmentAmountStr(d.installmentAmount ? formatNumberString(d.installmentAmount) : '');
    setPeriodicAmountStr(d.periodicAmount ? formatNumberString(d.periodicAmount) : '');
    setPromoMonthsStr(d.promoMonths ? String(d.promoMonths) : '');
    setPromoRateStr(d.promoRate ? String(d.promoRate) : '');
    setNormalRateStr(d.normalRate ? String(d.normalRate) : '');
    setDebtPromoEndDate(d.promoEndDate || (d.startDate && d.promoMonths ? calculateMaturityDateISO(d.startDate, d.promoMonths) : ''));

    setShowDebtForm(true);
    setTimeout(() => {
      debtNameInputRef.current?.focus();
    }, 80);
  };

  const handleCancelDebtForm = () => {
    setEditingDebtId(null);
    setDebtCat('type1');
    setDebtName('');
    setDebtFreq('monthly');
    setDebtDay(20);
    setDebtStartDate('');
    setDebtNote('');
    setDebtAmountStr('');
    setDebtTermMonthsStr('');
    setInstallmentAmountStr('');
    setPeriodicAmountStr('');
    setPromoMonthsStr('');
    setPromoRateStr('');
    setNormalRateStr('');
    setDebtPromoEndDate('');
    setShowDebtForm(false);
  };

  const handleSaveDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtName.trim()) {
      alert('Vui lòng nhập tên nghĩa vụ tài chính!');
      return;
    }

    let amount = 0;
    let termMonths = 0;
    let installmentAmount = 0;
    let periodicAmount = 0;
    let promoMonths = 0;
    let promoRate = 0;
    let normalRate = 0;
    let computedMonthlyBefore = 0;
    let computedMonthlyAfter = 0;

    if (debtCat === 'type1') {
      amount = parseFormattedNumber(debtAmountStr);
      termMonths = Number(debtTermMonthsStr) || 0;
      promoMonths = Number(promoMonthsStr) || 0;
      promoRate = Number(promoRateStr) || 0;
      normalRate = Number(normalRateStr) || 0;

      if (amount > 0 && termMonths > 0) {
        const principalPart = Math.round(amount / termMonths);
        const interestBefore = Math.round((amount * (promoRate / 100)) / 12);
        const principalAtPromoEnd = Math.max(0, amount - principalPart * promoMonths);
        const interestAfter = Math.round((principalAtPromoEnd * (normalRate / 100)) / 12);
        computedMonthlyBefore = principalPart + interestBefore;
        computedMonthlyAfter = principalPart + interestAfter;
      }
    } else if (debtCat === 'type2') {
      amount = parseFormattedNumber(debtAmountStr);
      termMonths = Number(debtTermMonthsStr) || 0;
      installmentAmount = parseFormattedNumber(installmentAmountStr);
      computedMonthlyBefore =
        installmentAmount > 0
          ? installmentAmount
          : termMonths > 0
          ? Math.round(amount / termMonths)
          : 0;
      computedMonthlyAfter = computedMonthlyBefore;
    } else if (debtCat === 'type_free') {
      amount = parseFormattedNumber(debtAmountStr);
      computedMonthlyBefore = 0;
      computedMonthlyAfter = 0;
    } else if (debtCat === 'type3' || debtCat === 'type4') {
      periodicAmount = parseFormattedNumber(periodicAmountStr);
      computedMonthlyBefore = periodicAmount;
      computedMonthlyAfter = periodicAmount;
      amount = periodicAmount;
    }

    if (amount <= 0 && computedMonthlyBefore <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ!');
      return;
    }

    const existingDebt = editingDebtId ? db.debts.find((d) => d.id === editingDebtId) : null;

    const newDebt: Debt = {
      id: editingDebtId || Date.now(),
      category: debtCat,
      name: debtName.trim(),
      frequency: debtCat === 'type_free' ? 'flexible' : debtFreq,
      startDate: debtCat !== 'type4' ? debtStartDate : undefined,
      day: debtCat !== 'type_free' ? debtDay : undefined,
      amount,
      termMonths: termMonths || undefined,
      installmentAmount: installmentAmount || undefined,
      periodicAmount: periodicAmount || undefined,
      promoMonths: promoMonths || undefined,
      promoEndDate: debtPromoEndDate || (debtCat === 'type1' && debtStartDate && promoMonths ? calculateMaturityDateISO(debtStartDate, promoMonths) : undefined),
      promoRate: promoRate || undefined,
      normalRate: normalRate || undefined,
      monthlyBefore: computedMonthlyBefore,
      monthlyAfter: computedMonthlyAfter,
      paidPrincipal: existingDebt?.paidPrincipal || 0,
      note: debtNote.trim() || undefined,
      status: existingDebt?.status || 'Chưa tất toán',
      settledDate: existingDebt?.settledDate || undefined,
    };

    onUpdateDebt(newDebt);
    handleCancelDebtForm();
  };

  const handlePayPeriod = (d: Debt) => {
    let principalPart = 0;
    if (d.category === 'type1' && d.termMonths) {
      principalPart = Math.round(d.amount / d.termMonths);
    } else if (d.category === 'type2') {
      principalPart = d.installmentAmount || (d.termMonths ? Math.round(d.amount / d.termMonths) : 0);
    }

    if (principalPart > 0) {
      const newPaid = Math.min(d.amount, (d.paidPrincipal || 0) + principalPart);
      const isSettled = newPaid >= d.amount;
      onUpdateDebt({
        ...d,
        paidPrincipal: newPaid,
        status: isSettled ? 'Đã tất toán' : 'Chưa tất toán',
        settledDate: isSettled ? new Date().toLocaleDateString('vi-VN') : undefined,
      });
    }
  };

  const handlePayCustom = (d: Debt) => {
    const currentRemain = Math.max(0, d.amount - (d.paidPrincipal || 0));
    const input = prompt(
      `Nhập số tiền muốn trả cho khoản "${d.name}"\n(Dư nợ hiện tại: ${formatVND(currentRemain)}):`,
      ''
    );
    if (!input) return;
    const paidVal = parseFormattedNumber(input);
    if (isNaN(paidVal) || paidVal <= 0) {
      alert('Số tiền nhập không hợp lệ!');
      return;
    }

    const newPaid = Math.min(d.amount, (d.paidPrincipal || 0) + paidVal);
    const isSettled = newPaid >= d.amount;
    onUpdateDebt({
      ...d,
      paidPrincipal: newPaid,
      status: isSettled ? 'Đã tất toán' : 'Chưa tất toán',
      settledDate: isSettled ? new Date().toLocaleDateString('vi-VN') : undefined,
    });
  };

  const handleToggleSettled = (d: Debt) => {
    if (d.status === 'Đã tất toán') {
      onUpdateDebt({
        ...d,
        status: 'Chưa tất toán',
        paidPrincipal: 0,
        settledDate: undefined,
      });
    } else {
      onUpdateDebt({
        ...d,
        status: 'Đã tất toán',
        paidPrincipal: d.amount,
        settledDate: new Date().toLocaleDateString('vi-VN'),
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT CASHFLOW DASHBOARD */}
      <div className="md:hidden bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
        {/* Row 1: Dòng Tiền Ròng (Net Cash Flow) Banner */}
        <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200/80 rounded-lg px-2.5 py-1.5">
          <div className="min-w-0 flex-1 mr-2">
            <span className="text-[9.5px] font-bold text-blue-800 uppercase tracking-wide block truncate">
              Dòng Tiền Ròng (Net Cashflow)
            </span>
            <span className="text-base font-black text-blue-700 tracking-tight block truncate">
              {isPrivacyMode ? '•••••• ₫' : netMonthlyCashflow >= 0 ? `+${formatVND(netMonthlyCashflow)}` : formatVND(netMonthlyCashflow)}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
              netMonthlyCashflow >= 0
                ? 'bg-blue-100 text-blue-800 border-blue-300'
                : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}
          >
            {netMonthlyCashflow >= 0 ? '✓ Thặng dư' : '⚠️ Thâm hụt'}
          </span>
        </div>

        {/* Row 2: 2 Mini Columns side-by-side (Tổng Thu vs Nghĩa Vụ Chi) */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Cột 1: Thu Nhập */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-2 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide truncate">
                  Tổng Thu
                </span>
                <button
                  type="button"
                  onClick={() => setShowIncomeBenchmarkModal(true)}
                  className={`text-[8.5px] font-extrabold px-1.5 py-0.2 rounded border ${incomeBenchmark.currentTier.badgeBg} flex items-center gap-0.5 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0`}
                  title="Xem mốc thu nhập"
                >
                  <TrendingUp className="w-2.5 h-2.5 shrink-0 text-emerald-700" />
                  <span className="whitespace-nowrap">{incomeBenchmark.currentTier.topPercent}</span>
                </button>
              </div>
              <div className="text-xs font-black text-emerald-700 mt-0.5 truncate">
                {isPrivacyMode ? '•••••• ₫' : `+${formatVND(totalMonthlyInflow)}`}
              </div>
            </div>

            <div className="mt-1.5 pt-1 border-t border-emerald-200/60 text-[9px] space-y-0.5 text-emerald-950">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Lương:</span>
                <div className="flex items-center space-x-0.5">
                  <span className="font-bold text-emerald-800 truncate">
                    {isPrivacyMode ? '••••••' : formatVND(db.salaryIncome)}
                  </span>
                  <button
                    onClick={() => setIsEditingSalary(true)}
                    className="p-0.5 text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    title="Sửa lương"
                  >
                    <Pen className="w-2 h-2" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Thụ động:</span>
                <span className="font-bold text-emerald-800 truncate">{formatVND(totalPassiveInflow, isPrivacyMode)}</span>
              </div>
            </div>
          </div>

          {/* Cột 2: Nghĩa Vụ Chi Trả */}
          <div className="bg-rose-50/70 border border-rose-200/80 p-2 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold text-rose-800 uppercase tracking-wide truncate">
                  Tổng Chi
                </span>
                <span
                  className={`px-1 py-0.2 rounded text-[8.5px] font-bold border shrink-0 ${
                    burdenRatio <= 35
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : burdenRatio <= 65
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  DTI: {isPrivacyMode ? '••%' : `${burdenRatio}%`}
                </span>
              </div>
              <div className="text-xs font-black text-rose-700 mt-0.5 truncate">
                {isPrivacyMode ? '•••••• ₫' : `-${formatVND(totalMonthlyOutflow)}`}
              </div>
            </div>

            <div className="mt-1.5 pt-1 border-t border-rose-200/60 text-[9px] space-y-0.5 text-rose-950">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 truncate">Gốc + lãi:</span>
                <span className="font-bold text-rose-700 truncate">{formatVND(totalPrincipalMonthly + totalInterestMonthly, isPrivacyMode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 truncate">Sinh hoạt:</span>
                <span className="font-bold text-rose-700 truncate">{formatVND(totalLivingMonthly + totalPeriodicMonthly, isPrivacyMode)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chú thích khoa học nút nhỏ */}
        <div className="pt-1 flex items-center justify-between border-t border-slate-100 text-[10px]">
          <span className="text-slate-500 text-[9.5px]">Quản trị đòn bẩy DTI ≤ 35%</span>
          <button
            type="button"
            onClick={() => setShowCashflowStandards(!showCashflowStandards)}
            className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer bg-blue-50 px-2 py-0.5 rounded transition shrink-0"
          >
            <span>{showCashflowStandards ? 'Ẩn Chú Thích' : 'Xem Chuẩn Mực'}</span>
            {showCashflowStandards ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        </div>

        {showCashflowStandards && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[10px] space-y-2">
            <div className="font-bold text-slate-800 text-[10px]">
              Chuẩn Mực Dòng Tiền:
            </div>
            <p className="text-slate-600 leading-relaxed">
              • <strong>DTI (≤35%):</strong> Dưới 35% là an toàn cao, 35-50% áp lực, trên 50% nguy hiểm.<br/>
              • <strong>Thặng dư ròng:</strong> Số tiền dư ra sau khi trả hết nợ và sinh hoạt để đầu tư tích sản.
            </p>
          </div>
        )}
      </div>

      {/* 2. DEDICATED DESKTOP VIEW (>= md) - PRESERVED 100% AS ORIGINAL */}
      <div className="hidden md:block bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Scale className="w-4 h-4 text-slate-800 mr-2 shrink-0" />
              <span>Báo Cáo Lưu Chuyển Dòng Tiền Dự Báo</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Đối chiếu trực tiếp nguồn thu nhập tổng hợp với tổng nghĩa vụ chi trả định kỳ
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCashflowStandards(!showCashflowStandards)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition shrink-0"
          >
            <span>{showCashflowStandards ? 'Ẩn Chú Thích' : 'Mở Chú Thích & Chuẩn Mực'}</span>
            {showCashflowStandards ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Scientific Cashflow Standards Guide */}
        {showCashflowStandards && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <i className="fa-solid fa-graduation-cap text-blue-600"></i>
              <span>Thước Đo Khoa Học Dòng Tiền & Quản Trị Đòn Bẩy (Cashflow & Leverage Metrics)</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px] leading-relaxed">
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-emerald-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Tỷ Lệ Tải Trọng DTI (≤35%)</span>
                </div>
                <p className="text-slate-600">
                  DTI = (Tổng nghĩa vụ chi trả / Tổng thu nhập). Dưới 35% là vùng an toàn cao chuẩn ngân hàng quốc tế; 35%–50% cần kiểm soát chi tiêu; trên 50% là vùng áp lực nguy hiểm, dễ vỡ nợ nếu mất việc hoặc biến cố.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-blue-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>Dòng Tiền Ròng Thặng Dư (Net Cashflow)</span>
                </div>
                <p className="text-slate-600">
                  Phần tiền dư ra hàng tháng sau khi đã trừ hết toàn bộ tiền gốc + lãi vay, chi phí định kỳ và sinh hoạt phí. Đây là nguồn lực cốt lõi để đầu tư DCA tích sản hoặc dự phòng khẩn cấp.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-rose-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>5 Phân Nhóm Nghĩa Vụ Tài Chính</span>
                </div>
                <p className="text-slate-600">
                  Bao gồm: Loại 1 (Vay có lãi định kỳ), Loại 2 (Trả góp tiêu dùng), Loại 3 (Vay tự do người thân), Loại 4 (Chi phí dài hạn định kỳ như học phí, bảo hiểm), Loại 5 (Sinh hoạt phí duy trì cuộc sống).
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 lg:gap-4">
          {/* Ô 1: Tổng Thu Nhập */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-xl flex flex-col justify-between relative min-w-0">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                  Tổng Thu Nhập
                </span>
                {/* Vị thế thu nhập */}
                <button
                  type="button"
                  onClick={() => setShowIncomeBenchmarkModal(true)}
                  className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${incomeBenchmark.currentTier.badgeBg} flex items-center gap-1 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0`}
                  title="Xem bảng mốc phân tầng thu nhập tại Việt Nam"
                >
                  <TrendingUp className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                  <span className="whitespace-nowrap">{incomeBenchmark.currentTier.topPercent} VN</span>
                </button>
              </div>

              <div className="text-xl lg:text-2xl font-black text-emerald-700 mt-1.5 leading-tight">
                {isPrivacyMode ? '•••••• ₫' : `+${formatVND(totalMonthlyInflow)}`}
              </div>
            </div>

            <div className="mt-2 pt-1.5 text-[11px] text-emerald-900 border-t border-emerald-200/60 font-medium">
              {isPrivacyMode ? 'So với VN: ••••••' : incomeBenchmark.ratioText}
            </div>

            <div className="mt-2 pt-2 border-t border-emerald-200/60 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-emerald-900">
                <span className="text-slate-600 font-medium text-[11px]">Lương thưởng:</span>
                <div className="flex items-center space-x-1">
                  {isEditingSalary ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={salaryInput}
                        onChange={(e) => setSalaryInput(formatNumberString(e.target.value))}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveIncome('salary')}
                        className="w-24 bg-white border border-emerald-400 rounded px-1 py-0.5 text-[11px] font-bold text-emerald-800 text-right outline-none shadow-2xs"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveIncome('salary')}
                        className="w-5 h-5 rounded flex items-center justify-center bg-emerald-600 text-white cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <span className="font-bold text-emerald-800 text-[11px]">
                        {isPrivacyMode ? '••••••' : formatVND(db.salaryIncome)}
                      </span>
                      <button
                        onClick={() => setIsEditingSalary(true)}
                        className="w-5 h-5 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition cursor-pointer"
                      >
                        <Pen className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-emerald-900">
                <span className="text-slate-600 font-medium text-[11px]">Thu nhập khác:</span>
                <div className="flex items-center space-x-1">
                  {isEditingOther ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={otherInput}
                        onChange={(e) => setOtherInput(formatNumberString(e.target.value))}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveIncome('other')}
                        className="w-24 bg-white border border-emerald-400 rounded px-1 py-0.5 text-[11px] font-bold text-emerald-800 text-right outline-none shadow-2xs"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveIncome('other')}
                        className="w-5 h-5 rounded flex items-center justify-center bg-emerald-600 text-white cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <span className="font-bold text-emerald-800 text-[11px]">
                        {isPrivacyMode ? '••••••' : formatVND(db.otherIncome)}
                      </span>
                      <button
                        onClick={() => setIsEditingOther(true)}
                        className="w-5 h-5 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition cursor-pointer"
                      >
                        <Pen className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-emerald-800/90 text-[10px] pt-0.5 border-t border-emerald-100">
                <span className="font-medium text-slate-500">Thụ động T1:</span>
                <span className="font-bold text-emerald-700">{formatVND(totalPassiveInflow, isPrivacyMode)}</span>
              </div>
            </div>
          </div>

          {/* Ô 2: Tổng Nghĩa Vụ Chi Trả */}
          <div className="bg-rose-50/70 border border-rose-200/80 p-4 rounded-xl flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">
                  Nghĩa Vụ Chi Trả
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold border shrink-0 ${
                    burdenRatio <= 35
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : burdenRatio <= 65
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  DTI: {isPrivacyMode ? '••%' : `${burdenRatio}%`}
                </span>
              </div>
              <div className="text-xl lg:text-2xl font-black text-rose-700 mt-1.5 leading-tight">
                {isPrivacyMode ? '•••••• ₫' : `-${formatVND(totalMonthlyOutflow)}`}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-rose-200/60 text-[11px] space-y-1 text-rose-900">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Gốc & góp:</span>
                <span className="font-bold text-rose-700">{formatVND(totalPrincipalMonthly, isPrivacyMode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Lãi dự tính:</span>
                <span className="font-bold text-rose-700">{formatVND(totalInterestMonthly, isPrivacyMode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Định kỳ & sinh hoạt:</span>
                <span className="font-bold text-rose-700">{formatVND(totalPeriodicMonthly + totalLivingMonthly, isPrivacyMode)}</span>
              </div>
              <div className="pt-0.5 border-t border-rose-200/50 text-[10px] text-rose-800 font-semibold flex justify-between">
                <span>Năm:</span>
                <span>{formatVND(totalAnnualOutflow, isPrivacyMode)}</span>
              </div>
            </div>
          </div>

          {/* Ô 3: Dòng Tiền Ròng */}
          <div className="bg-blue-50/70 border border-blue-200/80 p-4 rounded-xl flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
                  Dòng Tiền Ròng (Net Cash Flow)
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                    netMonthlyCashflow >= 0
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {netMonthlyCashflow >= 0 ? '✓ Thặng dư ròng' : '⚠️ Thâm hụt'}
                </span>
              </div>
              <div className="text-xl lg:text-2xl font-black text-blue-700 mt-1.5 leading-tight">
                {isPrivacyMode ? '•••••• ₫' : netMonthlyCashflow >= 0 ? `+${formatVND(netMonthlyCashflow)}` : formatVND(netMonthlyCashflow)}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-blue-200/60 text-[11px] text-blue-800/80 font-medium">
              {netMonthlyCashflow >= 0
                ? 'Khả năng tích lũy thanh khoản tốt cho mục tiêu'
                : 'Cảnh báo dòng tiền âm, cần cắt giảm chi tiêu'}
            </div>
          </div>
        </div>
      </div>
        {/* Bảng Cơ Cấu Chi Trả */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden mt-3 bg-white">
          <div
            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none bg-slate-50 hover:bg-slate-100/80 transition"
            onClick={() => setShowBreakdownTable(!showBreakdownTable)}
          >
            <div className="flex items-start sm:items-center space-x-2.5 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 mt-0.5 sm:mt-0">
                {showBreakdownTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 leading-snug">
                  Bảng Chi Tiết Cơ Cấu Chi Trả Nghĩa Vụ & Chi Phí
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 shrink-0 whitespace-nowrap">
                  5 phân nhóm
                </span>
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center space-x-1 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{showBreakdownTable ? 'Thu Gọn' : 'Xem Chi Tiết'}</span>
            </button>
          </div>

          {showBreakdownTable && (
            <div className="border-t border-slate-100">
              {/* 1. DEDICATED MOBILE VIEW (< sm) - COMPACT BREAKDOWN CARDS */}
              <div className="sm:hidden p-2.5 space-y-2 bg-slate-50/50">
                {(['type1', 'type2', 'type_free', 'type3', 'type4'] as const).map((key) => {
                  const item = catStats[key];
                  const m = item.monthly;
                  const q = m * 3;
                  const y = m * 12;
                  const share = totalMonthlyOutflow > 0 ? Math.round((m / totalMonthlyOutflow) * 100) : 0;

                  if (key === 'type_free') {
                    if (item.count > 0) {
                      return (
                        <div key={key} className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${item.tag}`}>
                                {item.label}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                              <span className="text-[10px] text-slate-400 font-normal shrink-0">({item.count})</span>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-purple-50 text-purple-700 border-purple-200 shrink-0">
                              Trả tự do
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400">Chi trả định kỳ:</span>
                            <span className="font-bold text-purple-700 text-xs">0 ₫ (Linh hoạt)</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={key} className="bg-white/60 px-2.5 py-1.5 rounded-lg border border-slate-200/60 flex items-center justify-between text-xs opacity-60">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded text-[8.5px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            {item.label}
                          </span>
                          <span className="text-slate-500 text-[11px]">{item.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 italic">Chưa phát sinh</span>
                      </div>
                    );
                  }

                  if (m > 0) {
                    const statusLabel = share >= 60 ? 'Tải trọng chính' : share >= 30 ? 'Trung bình' : 'Thấp';
                    const statusClass = share >= 60 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200';

                    return (
                      <div key={key} className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${item.tag}`}>
                              {item.label}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal shrink-0">({item.count} khoản)</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-bold text-slate-700 text-[10.5px]">
                              {isPrivacyMode ? '••%' : `${share}%`}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 block leading-tight">Chi trả / tháng</span>
                            <span className="font-extrabold text-rose-600 text-xs block leading-tight mt-0.5">
                              {formatVND(m, isPrivacyMode)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-400 block leading-tight">Dự phóng năm</span>
                            <span className="font-semibold text-slate-700 text-[11px] block leading-tight mt-0.5">
                              {formatVND(y, isPrivacyMode)}
                            </span>
                            <span className="text-[9px] text-slate-400 block leading-tight">
                              Quý: {formatVND(q, isPrivacyMode)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="bg-white/60 px-2.5 py-1.5 rounded-lg border border-slate-200/60 flex items-center justify-between text-xs opacity-60">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 rounded text-[8.5px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                          {item.label}
                        </span>
                        <span className="text-slate-500 text-[11px]">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 italic">Chưa phát sinh</span>
                    </div>
                  );
                })}
              </div>

              {/* 2. DEDICATED DESKTOP VIEW (>= sm) - FULL TABLE */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-white text-slate-400 font-semibold border-b border-slate-100 text-[11px]">
                    <th className="py-2.5 px-3.5">Phân Nhóm Nghĩa Vụ</th>
                    <th className="py-2.5 px-3.5 text-right">Chi Trả / Tháng</th>
                    <th className="py-2.5 px-3.5 text-right">Dự Phóng Quý & Năm</th>
                    <th className="py-2.5 px-3.5 text-center w-36">Tỷ Trọng & Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(['type1', 'type2', 'type_free', 'type3', 'type4'] as const).map((key) => {
                    const item = catStats[key];
                    const m = item.monthly;
                    const q = m * 3;
                    const y = m * 12;
                    const share = totalMonthlyOutflow > 0 ? Math.round((m / totalMonthlyOutflow) * 100) : 0;

                    if (key === 'type_free') {
                      if (item.count > 0) {
                        return (
                          <tr key={key} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3.5 font-bold text-slate-800 flex items-center gap-2">
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold border ${item.tag}`}>
                                {item.label}
                              </span>
                              <span>{item.name}</span>
                              <span className="text-[11px] text-slate-400 font-normal">({item.count} khoản)</span>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-bold text-purple-700 whitespace-nowrap">
                              0 ₫ (Linh hoạt)
                            </td>
                            <td className="py-2.5 px-3.5 text-right text-slate-500 font-medium whitespace-nowrap text-[11px]">
                              Không áp lực định kỳ
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-purple-50 text-purple-700 border-purple-200">
                                Trả tự do
                              </span>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={key} className="opacity-40 hover:opacity-70 transition">
                          <td className="py-2 px-3.5 text-slate-400 flex items-center gap-2">
                            <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-400 border border-slate-200">
                              {item.label}
                            </span>
                            <span>{item.name}</span>
                          </td>
                          <td className="py-2 px-3.5 text-right text-slate-300 font-normal">—</td>
                          <td className="py-2 px-3.5 text-right text-slate-300 text-[11px] font-normal">—</td>
                          <td className="py-2 px-3.5 text-center text-slate-300 text-[11px]">Chưa phát sinh</td>
                        </tr>
                      );
                    }

                    if (m > 0) {
                      const statusLabel = share >= 60 ? 'Tải trọng chính' : share >= 30 ? 'Trung bình' : 'Thấp';
                      const statusClass = share >= 60 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200';

                      return (
                        <tr key={key} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3.5 font-bold text-slate-800 flex items-center gap-2">
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold border ${item.tag}`}>
                              {item.label}
                            </span>
                            <span>{item.name}</span>
                            <span className="text-[11px] text-slate-400 font-normal">({item.count} khoản)</span>
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-extrabold text-rose-600 whitespace-nowrap">
                            {formatVND(m, isPrivacyMode)}
                          </td>
                          <td className="py-2.5 px-3.5 text-right text-slate-500 font-medium whitespace-nowrap text-[11px]">
                            Quý: <span className="font-semibold text-slate-700">{formatVND(q, isPrivacyMode)}</span> • Năm:{' '}
                            <span className="font-semibold text-slate-700">{formatVND(y, isPrivacyMode)}</span>
                          </td>
                          <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                            <span className="inline-block font-bold text-slate-800 text-[11px] mr-1.5">
                              {isPrivacyMode ? '••%' : `${share}%`}
                            </span>
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={key} className="opacity-40 hover:opacity-70 transition">
                        <td className="py-2 px-3.5 text-slate-400 flex items-center gap-2">
                          <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-400 border border-slate-200">
                            {item.label}
                          </span>
                          <span>{item.name}</span>
                        </td>
                        <td className="py-2 px-3.5 text-right text-slate-300 font-normal">—</td>
                        <td className="py-2 px-3.5 text-right text-slate-300 text-[11px] font-normal">—</td>
                        <td className="py-2 px-3.5 text-center text-slate-300 text-[11px]">Chưa phát sinh</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>

        {/* Biểu đồ dòng tiền */}
        <div className="bg-slate-50/70 p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2 sm:space-y-3 mt-3 sm:mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-2 gap-1.5 sm:gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center">
              <i className="fa-solid fa-chart-line text-blue-600 mr-1.5 sm:mr-2"></i>
              <span>Biến Động 3 Dòng Tiền</span>
            </h3>
            <div className="flex items-center space-x-1 bg-white p-0.5 sm:p-1 rounded-lg text-[10px] sm:text-[11px] font-bold shadow-2xs">
              {(['quarter', 'year', '3years', '5years'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setCashflowRange(r)}
                  className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded transition cursor-pointer ${
                    cashflowRange === r ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {r === 'quarter' ? 'Quý' : r === 'year' ? 'Năm' : r === '3years' ? '3 Năm' : '5 Năm'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44 sm:h-72 bg-white p-2 sm:p-3 rounded-xl border border-slate-200">
            <canvas ref={chartCanvasRef}></canvas>
          </div>
        </div>

      {/* Button Open Debt Form */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (showDebtForm) handleCancelDebtForm();
            else setShowDebtForm(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-rose-400" />
          <span>{showDebtForm ? 'Đóng Khung Thiết Lập' : '+ Thêm Nghĩa Vụ Tài Chính Mới'}</span>
        </button>
      </div>

      {/* Debt Form Modal (Responsive Bottom-Sheet on Mobile) */}
      {showDebtForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Mobile Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>
            <form
              ref={debtFormRef}
              onSubmit={handleSaveDebt}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center">
                  <i className="fa-solid fa-file-invoice-dollar text-rose-600 mr-2 shrink-0"></i>
                  <span className="truncate">{editingDebtId ? `Chỉnh Sửa Khoản: ${debtName}` : 'Khởi Tạo Nghĩa Vụ Nợ'}</span>
                </h2>
                <button
                  type="button"
                  onClick={handleCancelDebtForm}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Phân Loại Nhóm Nghĩa Vụ Tài Chính
              </label>
              <select
                value={debtCat}
                onChange={(e) => setDebtCat(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-rose-500"
              >
                <option value="type1">Loại 1: Nghĩa vụ nợ vay có lãi (Ngân hàng, mua nhà, xe...)</option>
                <option value="type2">Loại 2: Nợ trả góp định kỳ (0% lãi, trừ đều hàng tháng...)</option>
                <option value="type_free">Loại 3: Mượn nợ người thân / Vay tự do (0% lãi, trả linh hoạt)</option>
                <option value="type3">Loại 4: Chi phí định kỳ không có gốc (Bảo hiểm, thuê nhà...)</option>
                <option value="type4">Loại 5: Chi phí sinh hoạt thường xuyên (Điện, nước, tiêu dùng...)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Tên Khoản Nợ / Chi Phí
              </label>
              <input
                ref={debtNameInputRef}
                type="text"
                value={debtName}
                onChange={(e) => setDebtName(e.target.value)}
                placeholder="VD: Vay mua nhà VCB / Trả góp thẻ tín dụng..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
              />
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-900 flex items-center">
            {debtCategoryDescriptions[debtCat]}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
            {(debtCat === 'type1' || debtCat === 'type2' || debtCat === 'type_free') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {debtCat === 'type_free' ? 'Tổng Tiền Mượn Gốc (VNĐ)' : 'Tổng Tiền Gốc / Hạn Mức (VNĐ)'}
                </label>
                <input
                  type="text"
                  value={debtAmountStr}
                  onChange={(e) => setDebtAmountStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-rose-600 outline-none focus:bg-white"
                />
              </div>
            )}

            {(debtCat === 'type1' || debtCat === 'type2') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Thời Hạn Tổng (Tháng)
                </label>
                <input
                  type="number"
                  value={debtTermMonthsStr}
                  onChange={(e) => setDebtTermMonthsStr(e.target.value)}
                  placeholder="VD: 240 (Tháng)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                />
              </div>
            )}

            {debtCat === 'type2' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Trả Mỗi Kỳ (VNĐ - trống tự chia)
                </label>
                <input
                  type="text"
                  value={installmentAmountStr}
                  onChange={(e) => setInstallmentAmountStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-rose-600 outline-none focus:bg-white"
                />
              </div>
            )}

            {(debtCat === 'type3' || debtCat === 'type4') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Số Tiền Chi Trả Mỗi Kỳ (VNĐ)
                </label>
                <input
                  type="text"
                  value={periodicAmountStr}
                  onChange={(e) => setPeriodicAmountStr(formatNumberString(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-rose-600 outline-none focus:bg-white"
                />
              </div>
            )}

            {debtCat !== 'type_free' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Chu Kỳ Thanh Toán</label>
                  <select
                    value={debtFreq}
                    onChange={(e) => setDebtFreq(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-rose-500"
                  >
                    <option value="monthly">Hàng tháng (Monthly)</option>
                    <option value="quarterly">Hàng quý (Quarterly)</option>
                    <option value="biannual">6 tháng / Nửa năm</option>
                    <option value="annual">Hàng năm (Annual)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Ngày Đến Hạn</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={debtDay}
                    onChange={(e) => setDebtDay(Number(e.target.value) || 1)}
                    placeholder="VD: 20"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                  />
                </div>
              </>
            )}
          </div>

          {debtCat === 'type1' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Thời Gian Ưu Đãi (Tháng)
                </label>
                <input
                  type="number"
                  value={promoMonthsStr}
                  onChange={(e) => setPromoMonthsStr(e.target.value)}
                  placeholder="VD: 24"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-orange-800 mb-1 flex items-center justify-between">
                  <span>Mốc Hết Ưu Đãi</span>
                  <span className="text-[10px] text-orange-600 font-normal">
                    {debtStartDate && promoMonthsStr ? '(Tự tính)' : ''}
                  </span>
                </label>
                <input
                  type="date"
                  value={
                    debtPromoEndDate ||
                    (debtStartDate && promoMonthsStr
                      ? calculateMaturityDateISO(debtStartDate, Number(promoMonthsStr))
                      : '')
                  }
                  onChange={(e) => setDebtPromoEndDate(e.target.value)}
                  className="w-full bg-orange-50/70 border border-orange-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Lãi Suất Ưu Đãi (%/năm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={promoRateStr}
                  onChange={(e) => setPromoRateStr(e.target.value)}
                  placeholder="VD: 6.5"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Lãi Suất Sau Ưu Đãi (%/năm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={normalRateStr}
                  onChange={(e) => setNormalRateStr(e.target.value)}
                  placeholder="VD: 10.5"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {debtCat !== 'type4' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Ngày Bắt Đầu / Giải Ngân
                </label>
                <input
                  type="date"
                  value={debtStartDate}
                  onChange={(e) => setDebtStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                />
              </div>
            )}
            <div className={debtCat !== 'type4' ? 'col-span-2' : 'col-span-3'}>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Ghi Chú Thỏa Thuận</label>
              <input
                type="text"
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
                placeholder="VD: Điều kiện tất toán sớm, số hợp đồng vay..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer"
            >
              {editingDebtId ? '✓ Cập Nhật Nghĩa Vụ Nợ' : '+ Cập Nhật Nghĩa Vụ Tài Chính'}
            </button>
            <button
              type="button"
              onClick={handleCancelDebtForm}
              className="px-5 py-3 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </form>
          </div>
        </div>
      )}

      {/* Bảng Master Schedule Nợ */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3 bg-white">
          <div
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none min-w-0 flex-1"
            onClick={() => setShowDebtTable(!showDebtTable)}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
              {showDebtTable ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                  Kế Hoạch Thanh Toán & Tiến Độ Nợ Vay
                </h3>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-bold bg-rose-100 text-rose-800 shrink-0 whitespace-nowrap">
                  {db.debts.length} khoản
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDebtTable(!showDebtTable)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="whitespace-nowrap">{showDebtTable ? 'Thu Gọn' : 'Xem Chi Tiết'}</span>
          </button>
        </div>

        {showDebtTable && (
          <div className="border-t border-slate-100 p-2.5 sm:p-5 pt-2 sm:pt-3 space-y-2 sm:space-y-4">
            {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT CARD LIST */}
            <div className="md:hidden space-y-1.5">
              {db.debts.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Chưa có nghĩa vụ tài chính nào.
                </div>
              ) : (
                db.debts.map((d, index) => {
                  const today = new Date();
                  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), d.day || 20);
                  const nextDue =
                    thisMonthDue >= todayDateOnly
                      ? thisMonthDue
                      : new Date(today.getFullYear(), today.getMonth() + 1, d.day || 20);
                  const diffDays = Math.round((nextDue.getTime() - todayDateOnly.getTime()) / (1000 * 60 * 60 * 24));

                  const shortCatTag: Record<DebtCategory, string> = {
                    type1: 'L1 • Vay lãi',
                    type2: 'L2 • Trả góp',
                    type_free: 'L3 • Vay tự do',
                    type3: 'L4 • Định kỳ',
                    type4: 'L5 • Sinh hoạt',
                  };

                  const totalPrincipal = d.amount || 0;
                  const paidPrincipal = d.status === 'Đã tất toán' ? totalPrincipal : d.paidPrincipal || 0;
                  const remainingPrincipal = Math.max(0, totalPrincipal - paidPrincipal);
                  const percentPaid =
                    totalPrincipal > 0 ? Math.min(100, Math.round((paidPrincipal / totalPrincipal) * 100)) : 0;

                  const nextDueDateFormatted =
                    d.category === 'type_free' ? 'Linh hoạt' : nextDue.toLocaleDateString('vi-VN');

                  const freqLabel =
                    d.frequency === 'annual'
                      ? '/năm'
                      : d.frequency === 'biannual'
                      ? '/6T'
                      : d.frequency === 'quarterly'
                      ? '/quý'
                      : '/th';

                  const payAmount =
                    d.category === 'type1'
                      ? d.monthlyBefore
                      : d.category === 'type2'
                      ? d.monthlyBefore || d.installmentAmount || 0
                      : d.periodicAmount || d.monthlyBefore || 0;

                  return (
                    <div
                      key={d.id}
                      className={`bg-slate-50/70 hover:bg-slate-50 rounded-lg border border-slate-200 p-2 space-y-1.5 transition shadow-2xs ${
                        d.status === 'Đã tất toán' ? 'opacity-65' : ''
                      }`}
                    >
                      {/* Row 1: STT, Category Tag, Name, Actions */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            {shortCatTag[d.category] || 'Khác'}
                          </span>
                          <div className="min-w-0 flex-1 truncate">
                            <span className="text-xs font-bold text-slate-900 truncate block leading-tight">{d.name}</span>
                          </div>
                        </div>

                        {/* Status & Action buttons */}
                        <div className="flex items-center space-x-0.5 shrink-0">
                          <button
                            onClick={() => handleToggleSettled(d)}
                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition cursor-pointer ${
                              d.status === 'Đã tất toán'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                            }`}
                          >
                            {d.status === 'Đã tất toán' ? '✓ Đã xong' : 'Chưa xong'}
                          </button>
                          <button
                            onClick={() => handleEditDebt(d)}
                            className="p-1 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Sửa"
                          >
                            <Pen className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa nghĩa vụ "${d.name}"?`)) {
                                onRemoveDebt(d.id);
                              }
                            }}
                            className="p-1 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Chi trả / kỳ & Hạn tiếp theo */}
                      <div className="flex items-baseline justify-between pt-1 border-t border-slate-200/70 text-xs">
                        <div>
                          <span className="text-[8.5px] text-slate-400 block font-medium leading-tight">Chi trả định kỳ</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-black text-rose-600">
                              {d.category === 'type_free' ? 'Linh hoạt' : `-${formatVND(payAmount, isPrivacyMode)}`}
                            </span>
                            {d.category !== 'type_free' && (
                              <span className="text-[8.5px] text-slate-400">{freqLabel}</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[8.5px] text-slate-400 block font-medium leading-tight">Kỳ hạn kế tiếp</span>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-[11px] font-bold text-slate-800">{nextDueDateFormatted}</span>
                            {d.category !== 'type_free' && d.status !== 'Đã tất toán' && (
                              <span
                                className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                                  diffDays === 0
                                    ? 'bg-rose-600 text-white animate-pulse'
                                    : diffDays <= 3
                                    ? 'bg-amber-100 text-amber-800 font-bold'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {diffDays === 0 ? 'Hôm nay' : diffDays > 0 ? `Còn ${diffDays}N` : 'Quá hạn'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Dư nợ & Tiến độ trả nợ (nếu có gốc) */}
                      {(d.category === 'type1' || d.category === 'type2' || d.category === 'type_free') && (
                        <div className="pt-1 border-t border-slate-200/70 space-y-0.5">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="text-slate-500 font-medium">
                              Dư nợ gốc: <b className="text-rose-600">{formatVND(remainingPrincipal, isPrivacyMode)}</b>
                            </span>
                            <span className="text-emerald-700 font-bold">
                              Đã trả {percentPaid}% ({formatVND(paidPrincipal, isPrivacyMode)})
                            </span>
                          </div>
                          <div className="w-full bg-slate-200/80 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1 rounded-full transition-all duration-500"
                              style={{ width: `${percentPaid}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Row 4: Action đóng nhanh (nếu chưa tất toán) */}
                      {d.status !== 'Đã tất toán' && (
                        <div className="pt-1 border-t border-slate-200/70 flex items-center justify-end gap-1.5">
                          {d.category === 'type_free' ? (
                            <button
                              onClick={() => handlePayCustom(d)}
                              className="px-2 py-0.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[9.5px] font-bold transition cursor-pointer"
                            >
                              + Trả bớt tiền
                            </button>
                          ) : (
                            (d.category === 'type1' || d.category === 'type2') && (
                              <button
                                onClick={() => handlePayPeriod(d)}
                                className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[9.5px] font-bold transition cursor-pointer"
                              >
                                ✓ Đóng kỳ này
                              </button>
                            )
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
                    <th className="p-3">Hạng Mục</th>
                    <th className="p-3 min-w-[230px]">Kỳ Thanh Toán</th>
                    <th className="p-3 text-right min-w-[210px]">Chi Trả / Kỳ</th>
                    <th className="p-3 text-right min-w-[170px]">Tiến Độ & Dư Nợ</th>
                    <th className="p-3 text-center min-w-[130px]">Trạng Thái</th>
                    <th className="p-3 text-center w-20">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {db.debts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        Chưa có nghĩa vụ tài chính nào.
                      </td>
                    </tr>
                  ) : (
                    db.debts.map((d, index) => {
                      const today = new Date();
                      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), d.day || 20);
                      const nextDue =
                        thisMonthDue >= todayDateOnly
                          ? thisMonthDue
                          : new Date(today.getFullYear(), today.getMonth() + 1, d.day || 20);
                      const diffDays = Math.round((nextDue.getTime() - todayDateOnly.getTime()) / (1000 * 60 * 60 * 24));

                      const shortCatTag: Record<DebtCategory, string> = {
                        type1: 'Loại 1 • Vay có lãi',
                        type2: 'Loại 2 • Trả góp',
                        type_free: 'Loại 3 • Vay tự do',
                        type3: 'Loại 4 • Chi phí dài hạn',
                        type4: 'Loại 5 • Sinh hoạt phí',
                      };

                      const totalPrincipal = d.amount || 0;
                      const paidPrincipal = d.status === 'Đã tất toán' ? totalPrincipal : d.paidPrincipal || 0;
                      const remainingPrincipal = Math.max(0, totalPrincipal - paidPrincipal);
                      const percentPaid =
                        totalPrincipal > 0 ? Math.min(100, Math.round((paidPrincipal / totalPrincipal) * 100)) : 0;

                      const nextDueDateFormatted =
                        d.category === 'type_free' ? 'Linh hoạt' : nextDue.toLocaleDateString('vi-VN');
                      const finalMaturity =
                        d.startDate && d.termMonths ? calculateMaturityDate(d.startDate, d.termMonths) : '';

                      const freqLabel =
                        d.frequency === 'annual'
                          ? '/năm'
                          : d.frequency === 'biannual'
                          ? '/6 tháng'
                          : d.frequency === 'quarterly'
                          ? '/quý'
                          : '/tháng';

                      return (
                        <tr
                          key={d.id}
                          className={`hover:bg-slate-50/80 transition ${
                            d.status === 'Đã tất toán' ? 'opacity-60 bg-slate-50/50' : ''
                          }`}
                        >
                          <td className="p-3 text-center font-bold text-slate-400">{index + 1}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 text-xs">{d.name}</div>
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-slate-100 text-slate-700">
                                {shortCatTag[d.category] || 'Khác'}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="font-semibold text-slate-700">
                                {formatVND(totalPrincipal, isPrivacyMode)}
                              </span>
                            </div>
                            {d.note && (
                              <div className="text-[10px] text-slate-400 italic mt-0.5">"{d.note}"</div>
                            )}
                          </td>
                          <td className="p-3 min-w-[230px]">
                            <div className="text-[11px] text-slate-800 flex items-center gap-1 whitespace-nowrap mb-1">
                              <span className="text-slate-400 font-medium">Hạn tiếp:</span>
                              <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                                {nextDueDateFormatted}
                              </span>
                              {d.category !== 'type_free' && d.status !== 'Đã tất toán' && (
                                <>
                                  {diffDays >= 0 && diffDays <= 3 && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300 ml-1 animate-pulse">
                                      ⚠️ Còn {diffDays} ngày
                                    </span>
                                  )}
                                  {diffDays > 3 && diffDays <= 7 && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 ml-1">
                                      ⏳ Còn {diffDays} ngày
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center flex-wrap gap-1 leading-relaxed">
                              {d.startDate && (
                                <span>Bắt đầu: {formatDateVN(d.startDate)}</span>
                              )}
                              {finalMaturity && d.category !== 'type_free' && (
                                <>
                                  <span className="text-slate-300">→</span>
                                  <span className="text-slate-800 font-semibold">Đáo hạn: {finalMaturity}</span>
                                </>
                              )}
                            </div>
                            {d.category === 'type1' && (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-900 border border-orange-200">
                                <Calendar className="w-3 h-3 text-orange-600" />
                                <span>Hết ưu đãi lãi:</span>
                                <span className="font-extrabold text-orange-950">
                                  {formatDateVN(d.promoEndDate) || calculateMaturityDate(d.startDate, d.promoMonths) || 'Chưa đặt'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right min-w-[210px]">
                            {d.category === 'type1' ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-end space-x-1.5 leading-tight">
                                  <span className="font-black text-emerald-700 text-xs">
                                    {formatVND(d.monthlyBefore, isPrivacyMode)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">{freqLabel}</span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                    ƯĐ {d.promoRate || 0}%
                                  </span>
                                </div>
                                {d.monthlyAfter > 0 && d.monthlyAfter !== d.monthlyBefore && (
                                  <div className="flex items-center justify-end space-x-1.5 leading-tight text-rose-700">
                                    <span className="font-bold text-xs">
                                      {formatVND(d.monthlyAfter, isPrivacyMode)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{freqLabel}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800">
                                      Sau ƯĐ {d.normalRate || 0}%
                                    </span>
                                  </div>
                                )}
                                <div className="text-[9px] text-slate-500 text-right leading-tight">
                                  Gốc: {formatVND(d.termMonths ? Math.round(d.amount / d.termMonths) : 0, isPrivacyMode)} + Lãi: {formatVND(Math.max(0, d.monthlyBefore - (d.termMonths ? Math.round(d.amount / d.termMonths) : 0)), isPrivacyMode)}
                                </div>
                              </div>
                            ) : d.category === 'type2' ? (
                              <div>
                                <span className="font-black text-slate-900 text-xs">
                                  {formatVND(d.monthlyBefore || d.installmentAmount || 0, isPrivacyMode)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold ml-1">{freqLabel}</span>
                                <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                  0% Lãi
                                </span>
                              </div>
                            ) : d.category === 'type_free' ? (
                              <div>
                                <span className="font-black text-purple-700 text-xs">Trả linh hoạt</span>
                                <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800">
                                  0% Lãi
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="font-black text-slate-900 text-xs">
                                  {formatVND(d.periodicAmount || d.monthlyBefore || 0, isPrivacyMode)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold ml-1">{freqLabel}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right min-w-[170px]">
                            {d.category === 'type1' || d.category === 'type2' || d.category === 'type_free' ? (
                              <div>
                                <div className="text-[11px] text-slate-500">
                                  Đã trả:{' '}
                                  <span className="font-bold text-emerald-600">
                                    {formatVND(paidPrincipal, isPrivacyMode)}
                                  </span>
                                  <span className="font-bold text-emerald-700 ml-1">({percentPaid}%)</span>
                                </div>
                                <div className="text-xs mt-0.5">
                                  <span className="text-slate-500">Dư nợ:</span>
                                  <span className="font-black text-rose-600 ml-1">
                                    {formatVND(remainingPrincipal, isPrivacyMode)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Không tính dư nợ</span>
                            )}
                          </td>
                          <td className="p-3 text-center space-y-1 whitespace-nowrap">
                            <div>
                              <button
                                onClick={() => handleToggleSettled(d)}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                  d.status === 'Đã tất toán'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                }`}
                              >
                                {d.status === 'Đã tất toán' ? '✓ Đã tất toán' : 'Chưa tất toán'}
                              </button>
                            </div>
                            {d.status !== 'Đã tất toán' && (
                              <div>
                                {d.category === 'type_free' ? (
                                  <button
                                    onClick={() => handlePayCustom(d)}
                                    className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Trả bớt
                                  </button>
                                ) : (
                                  (d.category === 'type1' || d.category === 'type2') && (
                                    <button
                                      onClick={() => handlePayPeriod(d)}
                                      className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[10px] font-bold transition cursor-pointer"
                                    >
                                      Đóng kỳ
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => handleEditDebt(d)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="Sửa"
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Bạn có chắc muốn xóa nghĩa vụ "${d.name}"?`)) {
                                  onRemoveDebt(d.id);
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

      {/* Vietnam Income Benchmark Modal */}
      <BenchmarkModal
        isOpen={showIncomeBenchmarkModal}
        onClose={() => setShowIncomeBenchmarkModal(false)}
        type="income"
        currentValue={totalMonthlyInflow}
        isPrivacyMode={isPrivacyMode}
      />
    </div>
  );
};
