import React, { useState, useEffect, useRef } from 'react';
import { Goal, DatabaseState, GoalGroup, GoalAssetType, Asset, Debt } from '../types';
import {
  formatVND,
  formatNumberString,
  parseFormattedNumber,
  calculateDCADaysRemaining,
  calculateMilestoneDueDate,
  getStandardTimeline,
  getActualTimelinePoints,
} from '../utils/format';
import { createPointValuePlugin } from '../utils/chartPlugin';
import { Chart, registerables } from 'chart.js';
import {
  Target,
  PlusCircle,
  TrendingUp,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Clock,
  Pen,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  Sparkles,
  Link as LinkIcon,
  HelpCircle,
  Filter,
  DollarSign,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react';

Chart.register(...registerables);

interface TabGoalsProps {
  db: DatabaseState;
  isPrivacyMode: boolean;
  onUpdateGoal: (goal: Goal) => void;
  onRemoveGoal: (id: number) => void;
  onUpdateAssetDirectly: (asset: Asset) => void;
  onUpdateDebtDirectly?: (debt: Debt) => void;
}

const goalGroupLabels: Record<GoalGroup, { name: string; tagClass: string; icon: string; desc: string }> = {
  debt: {
    name: 'Nhóm 1: Trả Nợ & Giảm Đòn Bẩy',
    tagClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: 'fa-file-invoice-dollar',
    desc: 'Tập trung hạ nhanh dư nợ gốc, tối ưu chi phí lãi vay và giảm tải trọng nghĩa vụ.',
  },
  dca: {
    name: 'Nhóm 2: Tích Sản Định Kỳ (DCA)',
    tagClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: 'fa-coins',
    desc: 'Tích lũy tài sản chất lượng cao theo chu kỳ đều đặn (Cổ phiếu, Vàng, Tiền gửi tiết kiệm).',
  },
  runway: {
    name: 'Nhóm 3: Quỹ Dự Phòng (Runway)',
    tagClass: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: 'fa-shield-halved',
    desc: 'Dự phòng thanh khoản 3-6-12 tháng sinh hoạt phí và nghĩa vụ nợ, bảo vệ gia đình trước biến cố.',
  },
  milestone: {
    name: 'Nhóm 4: Cột Mốc Lớn / Quỹ BĐS / FIRE',
    tagClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: 'fa-landmark',
    desc: 'Các cột mốc quy mô vốn lớn (Mua nhà đất, mua xe, quỹ khởi nghiệp, tự do tài chính).',
  },
};

export const TabGoals: React.FC<TabGoalsProps> = ({
  db,
  isPrivacyMode,
  onUpdateGoal,
  onRemoveGoal,
  onUpdateAssetDirectly,
  onUpdateDebtDirectly,
}) => {
  // Filters
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<GoalGroup | 'all'>('all');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'all' | 'month' | 'quarter' | '6months' | 'year' | 'longterm'>('all');
  const [goalChartRange, setGoalChartRange] = useState<'quarter' | 'year' | '3years' | '5years'>('year');

  // Form toggles
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showGoalStandards, setShowGoalStandards] = useState(false);
  const [formMode, setFormMode] = useState<'dca' | 'milestone'>('dca');
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);

  // Form refs for smooth auto-jump and focus
  const goalFormRef = useRef<HTMLFormElement | null>(null);
  const goalNameInputRef = useRef<HTMLInputElement | null>(null);

  // Form states
  const [goalGroup, setGoalGroup] = useState<GoalGroup>('dca');
  const [assetType, setAssetType] = useState<GoalAssetType>('stock');
  const [linkedAssetId, setLinkedAssetId] = useState<number | undefined>(undefined);
  const [linkedDebtId, setLinkedDebtId] = useState<number | undefined>(undefined);
  const [goalName, setGoalName] = useState('');
  const [freqMonths, setFreqMonths] = useState(1);
  const [targetQtyStr, setTargetQtyStr] = useState('');
  const [unit, setUnit] = useState('CP');
  const [goalDay, setGoalDay] = useState(10);
  const [goalTargetStr, setGoalTargetStr] = useState('');
  const [goalYears, setGoalYears] = useState(2);
  const [goalNote, setGoalNote] = useState('');

  // Table & Stress test states
  const [showGoalTable, setShowGoalTable] = useState(false);
  const [showStressTest, setShowStressTest] = useState(false);
  const [simTargetValStr, setSimTargetValStr] = useState('3.000.000.000');
  const [simMonthsLeft, setSimMonthsLeft] = useState(24);
  const [simCashValStr, setSimCashValStr] = useState('');
  const [simGoldValStr, setSimGoldValStr] = useState('');
  const [simStockValStr, setSimStockValStr] = useState('');
  const [simEmergencyFundStr, setSimEmergencyFundStr] = useState('150.000.000');
  const [simLoanYears, setSimLoanYears] = useState(20);
  const [simGraceYears, setSimGraceYears] = useState(0);
  const [simPromoMonths, setSimPromoMonths] = useState(24);
  const [simPromoRate, setSimPromoRate] = useState(6.5);
  const [simNormalRate, setSimNormalRate] = useState(10.5);
  const [simStressRate, setSimStressRate] = useState(12.5);

  const chartProgressRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // Calculations from Tab 1 & Tab 2 for Cash Flow Alignment
  const totalAssets = db.assets.reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalDebts = db.debts.reduce((sum, d) => {
    if (d.category === 'type1' || d.category === 'type2' || d.category === 'type_free') {
      return sum + Math.max(0, d.amount - (d.paidPrincipal || 0));
    }
    return sum;
  }, 0);
  const netWorth = totalAssets - totalDebts;

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

  let totalMonthlyDebtOutflow = 0;
  let totalPrincipalMonthlyDebt = 0;
  let totalInterestMonthlyDebt = 0;
  let totalPeriodicMonthlyDebt = 0;
  let totalLivingMonthlyDebt = 0;

  db.debts.forEach((d) => {
    if (d.status !== 'Đã tất toán' && d.category !== 'type_free') {
      let m = d.monthlyBefore || d.installmentAmount || d.periodicAmount || 0;
      if (d.frequency === 'annual') m = Math.round(m / 12);
      else if (d.frequency === 'biannual') m = Math.round(m / 6);
      else if (d.frequency === 'quarterly') m = Math.round(m / 3);
      totalMonthlyDebtOutflow += m;

      if (d.category === 'type1') {
        const principal = d.termMonths ? Math.round(d.amount / d.termMonths) : 0;
        totalPrincipalMonthlyDebt += principal;
        totalInterestMonthlyDebt += Math.max(0, m - principal);
      } else if (d.category === 'type2') {
        totalPrincipalMonthlyDebt += m;
      } else if (d.category === 'type3') {
        totalPeriodicMonthlyDebt += m;
      } else if (d.category === 'type4') {
        totalLivingMonthlyDebt += m;
      }
    }
  });

  // Net surplus available for goals
  const monthlySurplusAvailable = Math.max(0, totalMonthlyInflow - totalMonthlyDebtOutflow);

  // Calculate Monthly Allocation Required by All Active Goals
  const monthlyGoalAllocation = db.goals.reduce((sum, g) => {
    if (g.status === 'completed') return sum;
    if (g.goalType === 'dca') {
      const f = g.freqMonths || 1;
      if (g.assetType === 'saving' || g.unit === 'VNĐ') {
        const amt = g.targetAmountPerPeriod || g.targetQty || 0;
        return sum + Math.round(amt / f);
      } else if (g.assetType === 'stock') {
        // Estimate value from Tab 1 stock price if linked
        const linked = db.assets.find((a) => a.id === g.linkedAssetId || a.name.toLowerCase() === g.name.toLowerCase());
        const unitPrice = linked && linked.quantity && linked.quantity > 0 ? Math.round(linked.amount / linked.quantity) : 30000;
        const perPeriod = (g.targetQty || 1) * unitPrice;
        return sum + Math.round(perPeriod / f);
      } else if (g.assetType === 'gold') {
        const perPeriod = (g.targetQty || 1) * 8500000; // ~8.5M/chỉ
        return sum + Math.round(perPeriod / f);
      }
      return sum + Math.round((g.targetQty || 0) / f);
    } else {
      // Milestone
      const yrs = g.years || 1;
      const target = g.target || 0;
      return sum + Math.round(target / (yrs * 12));
    }
  }, 0);

  // Free cash buffer after goal allocation
  const remainingFreeBuffer = monthlySurplusAvailable - monthlyGoalAllocation;
  const allocationBurdenRatio =
    monthlySurplusAvailable > 0 ? Math.round((monthlyGoalAllocation / monthlySurplusAvailable) * 100) : 0;

  // 4 Pillar Progress Metrics
  const totalDebtOriginal = db.debts
    .filter((d) => d.category === 'type1' || d.category === 'type2' || d.category === 'type_free')
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalDebtPaid = db.debts
    .filter((d) => d.category === 'type1' || d.category === 'type2' || d.category === 'type_free')
    .reduce((sum, d) => sum + (d.status === 'Đã tất toán' ? d.amount : d.paidPrincipal || 0), 0);
  const debtProgressPercent =
    totalDebtOriginal > 0 ? Math.min(100, Math.round((totalDebtPaid / totalDebtOriginal) * 100)) : 100;

  const dcaGoals = db.goals.filter((g) => g.group === 'dca' || g.goalType === 'dca');
  const dcaCount = dcaGoals.length;
  const currentDcaPct = Math.min(
    100,
    Math.round(
      dcaCount > 0
        ? (db.goals.filter((g) => (g.group === 'dca' || g.goalType === 'dca') && (g.totalBought || 0) >= (g.targetQty || 1)).length / dcaCount) * 100
        : 85
    )
  );

  const liquidAssets = db.assets
    .filter((a) => a.level === '1' && (a.type === 'cash' || a.type === 'saving' || a.type === 'gold'))
    .reduce((sum, a) => sum + a.amount, 0);
  const runwayMonths = totalMonthlyDebtOutflow > 0 ? (liquidAssets / totalMonthlyDebtOutflow).toFixed(1) : '0';
  const runwayPercent = Math.min(100, Math.round((Number(runwayMonths) / 6) * 100));

  const milestoneGoals = db.goals.filter((g) => g.group === 'milestone' || g.goalType === 'milestone');
  const totalMilestoneTarget = milestoneGoals.reduce((sum, g) => sum + (g.target || 0), 0);
  const milestoneProgressPercent =
    totalMilestoneTarget > 0 ? Math.min(100, Math.round((netWorth / totalMilestoneTarget) * 100)) : 0;

  // Filtered Goals
  const now = new Date();
  const currentPeriodStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const filteredGoals = db.goals.filter((g) => {
    // Filter by group
    if (selectedGroupFilter !== 'all' && g.group !== selectedGroupFilter) {
      return false;
    }

    // Filter by time horizon
    if (selectedTimeFilter === 'month') {
      // Due this month
      if (g.goalType === 'dca' && g.freqMonths !== 1) return false;
      if (g.goalType === 'milestone' && (g.years || 1) > 1) return false;
    } else if (selectedTimeFilter === 'quarter') {
      if (g.goalType === 'dca' && (g.freqMonths || 1) > 3) return false;
      if (g.goalType === 'milestone' && (g.years || 1) > 1) return false;
    } else if (selectedTimeFilter === '6months') {
      if (g.goalType === 'dca' && (g.freqMonths || 1) > 6) return false;
      if (g.goalType === 'milestone' && (g.years || 1) > 2) return false;
    } else if (selectedTimeFilter === 'year') {
      if (g.goalType === 'milestone' && (g.years || 1) > 1) return false;
    } else if (selectedTimeFilter === 'longterm') {
      if (g.goalType === 'milestone' && (g.years || 1) < 2) return false;
    }

    return true;
  });

  // Render chart - chỉ hiển thị các tháng thực tế có dữ liệu từ tháng bắt đầu
  useEffect(() => {
    if (!chartProgressRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const currentDcaPct = Math.min(
      100,
      Math.round(
        dcaCount > 0
          ? (db.goals.filter((g) => (g.group === 'dca' || g.goalType === 'dca') && (g.totalBought || 0) >= (g.targetQty || 1)).length / dcaCount) * 100
          : 85
      )
    );

    const points = getActualTimelinePoints(
      db,
      {
        netWorth: 0,
        totalAssets: 0,
        totalDebts: 0,
        inflow: 0,
        outflow: 0,
        netCashFlow: 0,
        debtProgressPercent,
        dcaProgressPercent: currentDcaPct,
        runwayPercent,
        milestoneProgressPercent,
      },
      goalChartRange
    );

    const labels = points.map((p) => p.label);
    const debtLine = points.map((p) => p.debtProgressPercent);
    const assetLine = points.map((p) => p.dcaProgressPercent);
    const runwayLine = points.map((p) => p.runwayPercent);
    const milestoneLine = points.map((p) => p.milestoneProgressPercent);

    const ctx = chartProgressRef.current.getContext('2d');
    if (!ctx) return;

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Trả Nợ Vay',
            data: debtLine,
            borderColor: '#f43f5e',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#f43f5e',
            pointBorderWidth: 2,
          },
          {
            label: 'Tích Sản DCA',
            data: assetLine,
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#10b981',
            pointBorderWidth: 2,
          },
          {
            label: 'Dự Phòng Runway',
            data: runwayLine,
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#3b82f6',
            pointBorderWidth: 2,
          },
          {
            label: 'Cột Mốc Lớn',
            data: milestoneLine,
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#f59e0b',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 36,
            bottom: 16,
            left: 10,
            right: 10,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            min: 0,
            max: 115,
            ticks: {
              stepSize: 25,
              callback: (val) => (Number(val) <= 100 ? val + '%' : ''),
            },
          },
        },
      },
      plugins: [createPointValuePlugin({ valueType: 'percent' })],
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, [
    db,
    debtProgressPercent,
    runwayPercent,
    totalMilestoneTarget,
    netWorth,
    totalAssets,
    goalChartRange,
  ]);

  // Handle Asset type change in DCA form
  const handleAssetTypeChange = (newType: GoalAssetType) => {
    setAssetType(newType);
    setLinkedAssetId(undefined);
    if (newType === 'stock') {
      setUnit('CP');
      setGoalGroup('dca');
    } else if (newType === 'gold') {
      setUnit('chỉ');
      setGoalGroup('dca');
    } else if (newType === 'saving') {
      setUnit('VNĐ');
      setGoalGroup('dca');
    } else if (newType === 'cash') {
      setUnit('VNĐ');
      setGoalGroup('runway');
    }
  };

  // When user selects a specific asset from Tab 1
  const handleSelectAssetFromTab1 = (assetIdStr: string) => {
    if (!assetIdStr) {
      setLinkedAssetId(undefined);
      return;
    }
    const idNum = Number(assetIdStr);
    setLinkedAssetId(idNum);
    const asset = db.assets.find((a) => a.id === idNum);
    if (asset) {
      setGoalName(asset.name);
      if (asset.type === 'saving') {
        setAssetType('saving');
        setUnit('VNĐ');
        setGoalGroup('dca');
        if (asset.amount && (!targetQtyStr || targetQtyStr === '0')) {
          setTargetQtyStr(formatNumberString(Math.min(20000000, Math.round(asset.amount / 10))));
        }
      } else if (asset.type === 'stock') {
        setAssetType('stock');
        setUnit('CP');
        setGoalGroup('dca');
        if (!targetQtyStr || targetQtyStr === '0') {
          setTargetQtyStr('500');
        }
      } else if (asset.type === 'gold') {
        setAssetType('gold');
        setUnit('chỉ');
        setGoalGroup('dca');
        if (!targetQtyStr || targetQtyStr === '0') {
          setTargetQtyStr('2');
        }
      } else if (asset.type === 'cash') {
        setAssetType('cash');
        setUnit('VNĐ');
        setGoalGroup('runway');
        if (!targetQtyStr || targetQtyStr === '0') {
          setTargetQtyStr(formatNumberString(5000000));
        }
      } else {
        setAssetType('other');
        setUnit('VNĐ');
        setGoalGroup('milestone');
        if (asset.amount) {
          setGoalTargetStr(formatNumberString(asset.amount));
        }
      }
    }
  };

  // When user selects a debt from Tab 2 for Nhóm 1
  const handleSelectDebtFromTab2 = (debtIdStr: string) => {
    if (!debtIdStr) {
      setLinkedDebtId(undefined);
      return;
    }
    const idNum = Number(debtIdStr);
    setLinkedDebtId(idNum);
    const debt = db.debts.find((d) => d.id === idNum);
    if (debt) {
      setGoalName(`Tất toán: ${debt.name}`);
      setGoalGroup('debt');
      setFormMode('milestone');
      setGoalTargetStr(formatNumberString(Math.max(0, debt.amount - (debt.paidPrincipal || 0))));
    }
  };

  const handleEditGoal = (g: Goal) => {
    setEditingGoalId(g.id);
    setGoalGroup(g.group || 'dca');
    const isDcaMode = g.goalType === 'dca' || (!g.goalType && (g.group === 'dca' || g.group === 'runway'));
    setFormMode(isDcaMode ? 'dca' : 'milestone');
    setAssetType(g.assetType || 'stock');
    setLinkedAssetId(g.linkedAssetId);
    setLinkedDebtId(g.linkedDebtId);
    setGoalName(g.name || '');
    setFreqMonths(g.freqMonths || 1);
    setTargetQtyStr(formatNumberString(g.targetQty || g.targetAmountPerPeriod || ''));
    setUnit(g.unit || (g.assetType === 'gold' ? 'chỉ' : g.assetType === 'saving' || g.assetType === 'cash' ? 'VNĐ' : 'CP'));
    setGoalDay(g.day || 10);
    setGoalTargetStr(g.target ? formatNumberString(g.target) : '');
    setGoalYears(g.years || 2);
    setGoalNote(g.note || '');
    setShowGoalForm(true);

    setTimeout(() => {
      goalFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      goalNameInputRef.current?.focus();
    }, 80);
  };

  const handleCancelForm = () => {
    setEditingGoalId(null);
    setGoalGroup('dca');
    setFormMode('dca');
    setAssetType('stock');
    setLinkedAssetId(undefined);
    setLinkedDebtId(undefined);
    setGoalName('');
    setFreqMonths(1);
    setTargetQtyStr('');
    setUnit('CP');
    setGoalDay(10);
    setGoalTargetStr('');
    setGoalYears(2);
    setGoalNote('');
    setShowGoalForm(false);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) {
      alert('Vui lòng nhập hoặc chọn tên mục tiêu!');
      return;
    }

    const isDca = formMode === 'dca' || (formMode !== 'milestone' && (goalGroup === 'dca' || goalGroup === 'runway'));

    if (isDca) {
      const qty = parseFormattedNumber(targetQtyStr);
      if (qty <= 0) {
        alert('Vui lòng nhập định mức mỗi kỳ lớn hơn 0!');
        return;
      }

      const existing = editingGoalId ? db.goals.find((g) => g.id === editingGoalId) : null;
      const newGoal: Goal = {
        id: editingGoalId || Date.now(),
        group: goalGroup,
        goalType: 'dca',
        assetType,
        linkedAssetId,
        name: goalName.trim(),
        freqMonths,
        targetQty: qty,
        targetAmountPerPeriod: assetType === 'saving' || unit === 'VNĐ' ? qty : undefined,
        unit,
        day: goalDay,
        backlogQty: existing?.backlogQty || 0,
        totalBought: existing?.totalBought || 0,
        lastBoughtPeriod: existing?.lastBoughtPeriod || '',
        status: existing?.status || 'active',
        note: goalNote.trim() || undefined,
      };

      onUpdateGoal(newGoal);
    } else {
      const target = parseFormattedNumber(goalTargetStr);
      if (target <= 0) {
        alert('Vui lòng nhập tổng số tiền mục tiêu lớn hơn 0!');
        return;
      }

      const existing = editingGoalId ? db.goals.find((g) => g.id === editingGoalId) : null;
      const newGoal: Goal = {
        id: editingGoalId || Date.now(),
        group: goalGroup,
        goalType: 'milestone',
        linkedDebtId,
        linkedAssetId,
        name: goalName.trim(),
        target,
        years: goalYears,
        createdAt: existing?.createdAt || currentPeriodStr,
        status: existing?.status || 'active',
        note: goalNote.trim() || undefined,
      };

      onUpdateGoal(newGoal);
    }

    handleCancelForm();
  };

  // Marking DCA bought/deposited with ACCURATE Tab 1 synchronization!
  const handleMarkDCABought = (goal: Goal) => {
    const dueThisMonth = (goal.targetQty || 0) + (goal.backlogQty || 0);
    const input = prompt(
      `Xác nhận số lượng / số tiền nạp kỳ này cho "${goal.name}"\n(Định mức kỳ này gồm cả nợ cũ: ${formatNumberString(dueThisMonth)} ${goal.unit}):`,
      formatNumberString(dueThisMonth)
    );
    if (input === null) return;
    const boughtVal = parseFormattedNumber(input);
    if (isNaN(boughtVal) || boughtVal <= 0) {
      alert('Số lượng nhập không hợp lệ!');
      return;
    }

    const newTotal = (goal.totalBought || 0) + boughtVal;
    const newBacklog = boughtVal >= dueThisMonth ? 0 : dueThisMonth - boughtVal;

    // UPDATE GOAL STATE
    const updatedGoal: Goal = {
      ...goal,
      totalBought: newTotal,
      lastBoughtPeriod: currentPeriodStr,
      backlogQty: newBacklog,
    };
    onUpdateGoal(updatedGoal);

    // ACCURATELY UPDATE LINKED ASSET IN TAB 1!
    let matchedAsset = goal.linkedAssetId
      ? db.assets.find((a) => a.id === goal.linkedAssetId)
      : db.assets.find((a) => a.name.toLowerCase() === goal.name.toLowerCase());

    if (matchedAsset) {
      if (matchedAsset.type === 'saving' || goal.assetType === 'saving' || goal.unit === 'VNĐ') {
        // FOR SAVING: Increase amount (VNĐ) directly in Tab 1!
        const updatedAsset: Asset = {
          ...matchedAsset,
          amount: (matchedAsset.amount || 0) + boughtVal,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
        onUpdateAssetDirectly(updatedAsset);
        alert(
          `✓ Đã ghi nhận nạp ${formatVND(boughtVal)} vào sổ tiết kiệm "${matchedAsset.name}" ở Tab 1 thành công!\nSố dư mới: ${formatVND(updatedAsset.amount)}.`
        );
      } else if (matchedAsset.type === 'stock') {
        // FOR STOCK: Increase quantity (CP) and update amount
        const currentQty = matchedAsset.quantity || 0;
        const newQty = currentQty + boughtVal;
        const avgPrice = currentQty > 0 ? Math.round(matchedAsset.amount / currentQty) : 30000;
        const updatedAsset: Asset = {
          ...matchedAsset,
          quantity: newQty,
          amount: (matchedAsset.amount || 0) + boughtVal * avgPrice,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
        onUpdateAssetDirectly(updatedAsset);
        alert(
          `✓ Đã ghi nhận mua ${formatNumberString(boughtVal)} CP vào danh mục "${matchedAsset.name}" ở Tab 1 thành công!\nTổng SL mới: ${formatNumberString(newQty)} CP.`
        );
      } else if (matchedAsset.type === 'gold') {
        // FOR GOLD: Increase quantity (chỉ) and value
        const currentQty = matchedAsset.quantity || 0;
        const newQty = currentQty + boughtVal;
        const pricePerUnit = currentQty > 0 ? Math.round(matchedAsset.amount / currentQty) : 8500000;
        const updatedAsset: Asset = {
          ...matchedAsset,
          quantity: newQty,
          amount: (matchedAsset.amount || 0) + boughtVal * pricePerUnit,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
        onUpdateAssetDirectly(updatedAsset);
        alert(
          `✓ Đã ghi nhận tích lũy ${formatNumberString(boughtVal)} chỉ vàng vào "${matchedAsset.name}" ở Tab 1 thành công!\nTổng SL mới: ${formatNumberString(newQty)} chỉ.`
        );
      }
    } else {
      // Auto-create new asset in Tab 1 if not yet existed
      let newAsset: Asset;
      if (goal.assetType === 'stock' || goal.unit === 'CP') {
        newAsset = {
          id: Date.now(),
          level: '2',
          type: 'stock',
          name: goal.name,
          amount: boughtVal * 30000,
          quantity: boughtVal,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
      } else if (goal.assetType === 'gold' || goal.unit === 'chỉ' || goal.unit === 'lượng') {
        newAsset = {
          id: Date.now(),
          level: '1',
          type: 'gold',
          name: goal.name,
          amount: boughtVal * 8500000,
          quantity: boughtVal,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
      } else {
        newAsset = {
          id: Date.now(),
          level: '1',
          type: 'saving',
          name: goal.name,
          amount: boughtVal,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
      }
      onUpdateAssetDirectly(newAsset);
      onUpdateGoal({
        ...updatedGoal,
        linkedAssetId: newAsset.id,
      });
      alert(
        `✓ Đã tự động tạo mới tài sản "${goal.name}" trên Tháp Tài Sản (Tab 1) và liên kết thành công!\nSố dư ban đầu: ${formatVND(newAsset.amount)}.`
      );
    }
  };

  // Complete Goal and Auto Sync with Tab 1 or Tab 2!
  const handleCompleteGoal = (goal: Goal) => {
    if (!confirm(`Xác nhận đánh dấu hoàn thành mục tiêu "${goal.name}"?`)) return;

    // 1. If linked to debt, settle debt in Tab 2
    if (goal.linkedDebtId && onUpdateDebtDirectly) {
      const linkedDebt = db.debts.find((d) => d.id === goal.linkedDebtId);
      if (linkedDebt) {
        onUpdateDebtDirectly({
          ...linkedDebt,
          status: 'Đã tất toán',
          paidPrincipal: linkedDebt.amount,
          settledDate: new Date().toLocaleDateString('vi-VN'),
        });
      }
    }

    // 2. If DCA goal (Vàng, Cổ phiếu, Tiết kiệm) completed, auto-update or sync Tab 1
    if (goal.goalType === 'dca') {
      const linked = goal.linkedAssetId
        ? db.assets.find((a) => a.id === goal.linkedAssetId)
        : db.assets.find((a) => a.name.toLowerCase() === goal.name.toLowerCase());

      if (linked) {
        if (linked.type === 'saving') {
          onUpdateAssetDirectly({
            ...linked,
            updatedAt: new Date().toLocaleDateString('vi-VN'),
          });
        } else if (linked.type === 'stock') {
          const finalQty = Math.max(linked.quantity || 0, goal.totalBought || 0);
          onUpdateAssetDirectly({
            ...linked,
            quantity: finalQty,
            updatedAt: new Date().toLocaleDateString('vi-VN'),
          });
        } else if (linked.type === 'gold') {
          const finalQty = Math.max(linked.quantity || 0, goal.totalBought || 0);
          onUpdateAssetDirectly({
            ...linked,
            quantity: finalQty,
            updatedAt: new Date().toLocaleDateString('vi-VN'),
          });
        }
      } else {
        const addAsset = confirm(
          `🎉 Hoàn thành mục tiêu tích sản "${goal.name}"!\nBạn có muốn tự động ghi nhận vào Tháp Tài Sản (Tab 1) không?`
        );
        if (addAsset) {
          if (goal.assetType === 'stock' || goal.unit === 'CP') {
            const qty = goal.totalBought || goal.targetQty || 1000;
            onUpdateAssetDirectly({
              id: Date.now(),
              level: '2',
              type: 'stock',
              name: goal.name,
              quantity: qty,
              costPrice: 20000,
              marketPrice: 20000,
              amount: qty * 20000,
              updatedAt: new Date().toLocaleDateString('vi-VN'),
            });
          } else if (goal.assetType === 'gold' || goal.unit === 'chỉ') {
            const qty = goal.totalBought || goal.targetQty || 2;
            const goldPrice = 8500000;
            onUpdateAssetDirectly({
              id: Date.now(),
              level: '1',
              type: 'gold',
              name: goal.name,
              quantity: qty,
              marketPrice: goldPrice,
              amount: qty * goldPrice,
              updatedAt: new Date().toLocaleDateString('vi-VN'),
            });
          } else {
            const amt = goal.targetAmountPerPeriod || (goal.totalBought || 1) * 10000000;
            onUpdateAssetDirectly({
              id: Date.now(),
              level: '1',
              type: 'saving',
              name: goal.name,
              amount: amt,
              rate: 6.0,
              termMonths: 12,
              startDate: new Date().toISOString().split('T')[0],
              maturityDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
              updatedAt: new Date().toLocaleDateString('vi-VN'),
            });
          }
        }
      }
    }

    // 3. If milestone goal, offer to register completed asset in Tab 1
    if (goal.goalType === 'milestone' && goal.target) {
      const addAsset = confirm(
        `🎉 Chúc mừng bạn đã hoàn thành cột mốc!\nBạn có muốn tự động ghi nhận tài sản "${goal.name}" trị giá ${formatVND(goal.target)} vào Tháp Tài Sản (Tab 1) không?`
      );
      if (addAsset) {
        const lower = goal.name.toLowerCase();
        let lvl: '1' | '2' | '3' = '2';
        let t: any = 'other';
        if (lower.includes('nhà') || lower.includes('chung cư')) {
          lvl = '2';
          t = 'realestate_live';
        } else if (lower.includes('đất')) {
          lvl = '2';
          t = 'realestate_land';
        } else if (lower.includes('vàng')) {
          lvl = '1';
          t = 'gold';
        } else if (lower.includes('tiết kiệm') || lower.includes('quỹ')) {
          lvl = '1';
          t = 'saving';
        }

        const newAsset: Asset = {
          id: Date.now(),
          level: lvl,
          type: t,
          name: goal.name,
          amount: goal.target,
          updatedAt: new Date().toLocaleDateString('vi-VN'),
        };
        onUpdateAssetDirectly(newAsset);
      }
    }

    // 4. Mark goal status completed
    const updatedGoal: Goal = {
      ...goal,
      status: 'completed',
    };
    onUpdateGoal(updatedGoal);
    alert(`✓ Đã hoàn thành mục tiêu "${goal.name}" thành công! Dữ liệu đã đồng bộ xuyên suốt hệ thống.`);
  };

  // Carry over DCA backlog to next period
  const handleCarryOverBacklog = (goal: Goal) => {
    if (confirm(`Chuyển định mức ${formatNumberString(goal.targetQty)} ${goal.unit} chưa mua kỳ này thành nợ chỉ tiêu dồn sang kỳ sau?`)) {
      const updatedGoal: Goal = {
        ...goal,
        backlogQty: (goal.backlogQty || 0) + (goal.targetQty || 0),
        lastBoughtPeriod: `missed_${currentPeriodStr}`,
      };
      onUpdateGoal(updatedGoal);
    }
  };

  // Stress-test simulation auto-fill
  const autoFillStressTest = () => {
    const cashAndSaving = db.assets
      .filter((a) => a.level === '1' && (a.type === 'cash' || a.type === 'saving'))
      .reduce((sum, a) => sum + a.amount, 0);
    const goldVal = db.assets.filter((a) => a.type === 'gold').reduce((sum, a) => sum + a.amount, 0);
    const stockVal = db.assets.filter((a) => a.type === 'stock').reduce((sum, a) => sum + a.amount, 0);
    const emergencyFund = totalMonthlyDebtOutflow > 0 ? totalMonthlyDebtOutflow * 6 : 150000000;

    setSimTargetValStr(formatNumberString(3000000000));
    setSimMonthsLeft(24);
    setSimCashValStr(formatNumberString(cashAndSaving));
    setSimGoldValStr(formatNumberString(goldVal));
    setSimStockValStr(formatNumberString(stockVal));
    setSimEmergencyFundStr(formatNumberString(emergencyFund));
    setSimLoanYears(20);
    setSimGraceYears(0);
    setSimPromoMonths(24);
    setSimPromoRate(6.5);
    setSimNormalRate(10.5);
    setSimStressRate(12.5);
  };

  // Simulation calculations
  const targetVal = parseFormattedNumber(simTargetValStr) || 3000000000;
  const cashVal = parseFormattedNumber(simCashValStr);
  const goldVal = parseFormattedNumber(simGoldValStr);
  const stockVal = parseFormattedNumber(simStockValStr);
  const emergencyFund = parseFormattedNumber(simEmergencyFundStr) || 150000000;

  const liquidAssetsReady = Math.max(0, cashVal + goldVal + stockVal - emergencyFund);
  const surplusAccumulated = monthlySurplusAvailable * simMonthsLeft;
  const totalOwnCapital = liquidAssetsReady + surplusAccumulated;

  const loanNeeded = Math.max(0, targetVal - totalOwnCapital);
  const totalLoanMonths = simLoanYears * 12;
  const graceMonths = simGraceYears * 12;
  const repayMonths = Math.max(1, totalLoanMonths - graceMonths);

  const principalMonthlyPromo = graceMonths >= simPromoMonths ? 0 : Math.round(loanNeeded / repayMonths);
  const interestMonthlyPromo = Math.round((loanNeeded * (simPromoRate / 100)) / 12);
  const totalPromoMonthlyDebt = principalMonthlyPromo + interestMonthlyPromo;

  const principalMonthlyNormal = Math.round(loanNeeded / repayMonths);
  const remainingPrincipalAfterPromo = Math.max(0, loanNeeded - principalMonthlyPromo * simPromoMonths);
  const interestMonthlyNormal = Math.round((remainingPrincipalAfterPromo * (simNormalRate / 100)) / 12);
  const totalNormalMonthlyDebt = principalMonthlyNormal + interestMonthlyNormal;

  const stressInterestMonthly = Math.round((remainingPrincipalAfterPromo * (simStressRate / 100)) / 12);
  const totalStressMonthlyDebt = principalMonthlyNormal + stressInterestMonthly;

  const netBuffer = monthlySurplusAvailable - totalNormalMonthlyDebt;
  const ltv = targetVal > 0 ? Math.round((loanNeeded / targetVal) * 100) : 0;
  const dsti = totalMonthlyInflow > 0 ? Math.round((totalNormalMonthlyDebt / totalMonthlyInflow) * 100) : 0;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT GOALS CASHFLOW DASHBOARD */}
      <div className="md:hidden bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
        {/* Row 1: Đệm Dòng Tiền Tự Do Còn Lại Banner ĐƯỢC ĐẶT LÊN ĐẦU TIÊN */}
        <div
          className={`flex items-center justify-between rounded-lg px-2.5 py-2 border ${
            remainingFreeBuffer >= 0
              ? 'bg-blue-50/70 border-blue-200/80'
              : 'bg-rose-50/70 border-rose-200/80'
          }`}
        >
          <div className="min-w-0 flex-1 mr-2">
            <span
              className={`text-[9.5px] font-bold uppercase tracking-wide block truncate ${
                remainingFreeBuffer >= 0 ? 'text-blue-800' : 'text-rose-800'
              }`}
            >
              Dòng Tiền Tự Do Còn Lại
            </span>
            <span
              className={`text-base font-black tracking-tight block truncate ${
                remainingFreeBuffer >= 0 ? 'text-blue-700' : 'text-rose-600'
              }`}
            >
              {isPrivacyMode
                ? '•••••• ₫'
                : remainingFreeBuffer >= 0
                ? `+${formatVND(remainingFreeBuffer)}`
                : `${formatVND(remainingFreeBuffer)}`}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
              remainingFreeBuffer >= 0
                ? 'bg-blue-100 text-blue-800 border-blue-300'
                : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}
          >
            {remainingFreeBuffer >= 0 ? '✓ An toàn' : '⚠️ Quá tải'}
          </span>
        </div>

        {/* Row 2: 2 Mini Columns side-by-side (Thặng Dư Khả Dụng vs Nhu Cầu Mục Tiêu) */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Cột 1: Thặng Dư Khả Dụng */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-2 rounded-lg flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide block truncate">
                Thặng Dư Khả Dụng
              </span>
              <div className="text-xs font-black text-emerald-700 mt-0.5 truncate">
                {isPrivacyMode ? '•••••• ₫' : `+${formatVND(monthlySurplusAvailable)}`}
              </div>
            </div>

            <div className="mt-1.5 pt-1 border-t border-emerald-200/60 text-[8.5px] space-y-0.5 text-emerald-950">
              <div className="flex justify-between">
                <span className="text-slate-600 truncate">Thu:</span>
                <span className="font-bold">{formatVND(totalMonthlyInflow, isPrivacyMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 truncate">Nợ:</span>
                <span className="font-bold text-rose-600">-{formatVND(totalMonthlyDebtOutflow, isPrivacyMode)}</span>
              </div>
            </div>
          </div>

          {/* Cột 2: Ngân Sách Mục Tiêu */}
          <div className="bg-amber-50/70 border border-amber-200/80 p-2 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wide truncate">
                  Nhu Cầu Mục Tiêu
                </span>
                <span
                  className={`px-1 py-0.2 rounded text-[8.5px] font-bold border shrink-0 ${
                    allocationBurdenRatio <= 70
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : allocationBurdenRatio <= 100
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  Tải: {isPrivacyMode ? '••%' : `${allocationBurdenRatio}%`}
                </span>
              </div>
              <div className="text-xs font-black text-amber-700 mt-0.5 truncate">
                {isPrivacyMode ? '•••••• ₫' : `-${formatVND(monthlyGoalAllocation)}`}
              </div>
            </div>

            <div className="mt-1.5 pt-1 border-t border-amber-200/60 text-[8.5px] space-y-0.5 text-amber-950">
              <div className="flex justify-between">
                <span className="text-slate-600 truncate">Quý:</span>
                <span className="font-bold">{formatVND(monthlyGoalAllocation * 3, isPrivacyMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 truncate">Năm:</span>
                <span className="font-bold">{formatVND(monthlyGoalAllocation * 12, isPrivacyMode)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chú thích 4 trụ cột */}
        <div className="pt-1 flex items-center justify-between border-t border-slate-100 text-[10px]">
          <span className="text-slate-500 text-[9.5px]">4 trụ cột hoạch định tài chính</span>
          <button
            type="button"
            onClick={() => setShowGoalStandards(!showGoalStandards)}
            className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer bg-blue-50 px-2 py-0.5 rounded transition shrink-0"
          >
            <span>{showGoalStandards ? 'Ẩn Chú Thích' : 'Xem Chuẩn Mực'}</span>
            {showGoalStandards ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        </div>

        {showGoalStandards && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[10px] space-y-2">
            <div className="font-bold text-slate-800 text-[10px]">
              4 Trụ Cột Hoạch Định Tài Chính:
            </div>
            <p className="text-slate-600 leading-relaxed">
              1. <strong>Giảm Nợ:</strong> Ưu tiên khi DTI &gt; 35% hoặc nợ lãi cao.<br/>
              2. <strong>DCA Tích Sản:</strong> Tích sản đều đặn vào ngày cố định hàng tháng.<br/>
              3. <strong>Quỹ Runway:</strong> Dự phòng 3-6 tháng sinh hoạt phí và nợ gốc lãi.<br/>
              4. <strong>Cột Mốc Lớn:</strong> Phân rã mục tiêu dài hạn (mua nhà, xe, FIRE).
            </p>
          </div>
        )}
      </div>

      {/* 2. DEDICATED DESKTOP VIEW (>= md) - PRESERVED 100% AS ORIGINAL */}
      <div className="hidden md:block bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <DollarSign className="w-4 h-4 text-emerald-600 mr-2 shrink-0" />
              <span>Cân Đối Dòng Tiền & Năng Lực Thực Hiện Mục Tiêu</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Đối chiếu thặng dư dòng tiền từ Tab 2 với tổng ngân sách tích sản và phân rã mục tiêu hằng tháng
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowGoalStandards(!showGoalStandards)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition shrink-0"
          >
            <span>{showGoalStandards ? 'Ẩn Chú Thích' : 'Mở Chú Thích & Chuẩn Mực'}</span>
            {showGoalStandards ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Scientific Goals Standards Guide */}
        {showGoalStandards && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <i className="fa-solid fa-graduation-cap text-blue-600"></i>
              <span>4 Trụ Cột Hoạch Định Tài Chính & Kỷ Luật Tích Sản Chuẩn Quốc Tế</span>
            </div>
            <div className="grid grid-cols-4 gap-3 text-[11px] leading-relaxed">
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-rose-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>1. Giảm Đòn Bẩy / Nợ</span>
                </div>
                <p className="text-slate-600">
                  Ưu tiên số 1 khi DTI &gt; 35% hoặc có nợ lãi cao (thẻ tín dụng, vay tiêu dùng). Giảm nợ giúp lập tức giải phóng dòng tiền mặt hàng tháng.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-amber-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>2. Tích Sản Định Kỳ (DCA)</span>
                </div>
                <p className="text-slate-600">
                  Tích lũy bình quân giá tài sản có giá trị nội tại (Cổ phiếu top đầu, Vàng, Tiết kiệm) theo ngày chốt cố định mỗi tháng/quý.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-blue-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>3. Quỹ Runway Dự Phòng</span>
                </div>
                <p className="text-slate-600">
                  Duy trì tối thiểu 3 đến 6 tháng chi phí sinh hoạt và nợ gốc lãi để gia đình luôn đứng vững trước bất kỳ rủi ro công việc hay sức khỏe nào.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-1">
                <div className="font-bold text-emerald-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>4. Cột Mốc Lớn / FIRE</span>
                </div>
                <p className="text-slate-600">
                  Phân rã mục tiêu lớn (Mua nhà, xe, vốn đầu tư, tự do tài chính) thành các khoản tích lũy hàng tháng và kiểm định áp lực nợ trước khi quyết định.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 lg:gap-4">
          {/* Ô 1: Dòng Tiền Tự Do Còn Lại (Đưa lên đầu) */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between min-w-0 ${
              remainingFreeBuffer >= 0
                ? 'bg-blue-50/70 border-blue-200/80'
                : 'bg-rose-50/70 border-rose-200/80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`text-xs font-bold uppercase tracking-wider block ${
                    remainingFreeBuffer >= 0 ? 'text-blue-800' : 'text-rose-800'
                  }`}
                >
                  Dòng Tiền Tự Do Còn Lại
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                    remainingFreeBuffer >= 0
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {remainingFreeBuffer >= 0 ? '✓ Đệm an toàn' : '⚠️ Quá tải'}
                </span>
              </div>
              <div
                className={`text-xl lg:text-2xl font-black mt-1.5 leading-tight ${
                  remainingFreeBuffer >= 0 ? 'text-blue-700' : 'text-rose-600'
                }`}
              >
                {isPrivacyMode
                  ? '•••••• ₫'
                  : remainingFreeBuffer >= 0
                  ? `+${formatVND(remainingFreeBuffer)}`
                  : `${formatVND(remainingFreeBuffer)}`}
              </div>
            </div>

            <div
              className={`mt-2 pt-2 border-t text-[11px] font-medium ${
                remainingFreeBuffer >= 0
                  ? 'border-blue-200/60 text-blue-800/80'
                  : 'border-rose-200/60 text-rose-800/80'
              }`}
            >
              {remainingFreeBuffer >= 0
                ? 'Đệm thanh khoản tự do sau khi trừ mọi khoản nợ & trích lập mục tiêu'
                : 'Cảnh báo: Mục tiêu vượt quá thặng dư hàng tháng, cần giãn thời hạn!'}
            </div>
          </div>

          {/* Ô 2: Dòng Tiền Thặng Dư Khả Dụng */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-xl flex flex-col justify-between min-w-0">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                Dòng Tiền Thặng Dư
              </span>
              <div className="text-xl lg:text-2xl font-black text-emerald-700 mt-1.5 leading-tight">
                {isPrivacyMode ? '•••••• ₫' : `+${formatVND(monthlySurplusAvailable)}`}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-emerald-200/60 text-[11px] space-y-1 text-emerald-900">
              <div className="flex justify-between">
                <span className="text-slate-600">Tổng thu:</span>
                <span className="font-bold">{formatVND(totalMonthlyInflow, isPrivacyMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Nợ Tab 2:</span>
                <span className="font-bold text-rose-600">-{formatVND(totalMonthlyDebtOutflow, isPrivacyMode)}</span>
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold pt-0.5 border-t border-emerald-100">
                Nguồn lực thực tế hàng tháng
              </div>
            </div>
          </div>

          {/* Ô 3: Ngân Sách Phân Bổ Cho Mục Tiêu */}
          <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-xl flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
                  Ngân Sách Mục Tiêu Cần
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold border shrink-0 ${
                    allocationBurdenRatio <= 70
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : allocationBurdenRatio <= 100
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  Tải: {isPrivacyMode ? '••%' : `${allocationBurdenRatio}%`}
                </span>
              </div>
              <div className="text-xl lg:text-2xl font-black text-amber-700 mt-1.5 leading-tight">
                {isPrivacyMode ? '•••••• ₫' : `-${formatVND(monthlyGoalAllocation)}`}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-amber-200/60 text-[11px] space-y-1 text-amber-900">
              <div className="flex justify-between">
                <span className="text-slate-600">Quý cần:</span>
                <span className="font-bold">{formatVND(monthlyGoalAllocation * 3, isPrivacyMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Năm cần:</span>
                <span className="font-bold">{formatVND(monthlyGoalAllocation * 12, isPrivacyMode)}</span>
              </div>
              <div className="text-[10px] text-amber-800 font-semibold pt-0.5 border-t border-amber-100">
                DCA + Quỹ cột mốc
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 PILLAR PROGRESS METRIC CARDS - MOBILE (< md) */}
      <div className="md:hidden bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-900 flex items-center">
            <Target className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
            <span>4 Trụ Cột Hoạch Định & Tích Sản</span>
          </h3>
          <span className="text-[9px] text-slate-400 font-medium">Tổng quan</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* Card 1: Trả Nợ */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider truncate">
                1. Trả Nợ Vay
              </span>
              <i className="fa-solid fa-file-invoice-dollar text-rose-500 text-[10px]"></i>
            </div>
            <div className="text-sm font-black text-slate-900">{debtProgressPercent}%</div>
            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
              <div
                className="bg-rose-500 h-full transition-all duration-500"
                style={{ width: `${debtProgressPercent}%` }}
              ></div>
            </div>
            <div className="text-[8.5px] text-slate-500 font-medium truncate">
              Đã trả: {formatVND(totalDebtPaid, isPrivacyMode)}
            </div>
          </div>

          {/* Card 2: DCA */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider truncate">
                2. DCA Định Kỳ
              </span>
              <i className="fa-solid fa-coins text-amber-500 text-[10px]"></i>
            </div>
            <div className="text-sm font-black text-slate-900">{dcaCount} Mục tiêu</div>
            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: dcaCount ? '100%' : '0%' }}
              ></div>
            </div>
            <div className="text-[8.5px] text-slate-500 font-medium truncate">Định kỳ tháng/quý</div>
          </div>

          {/* Card 3: Runway */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider truncate">
                3. Quỹ Runway
              </span>
              <i className="fa-solid fa-shield-halved text-blue-600 text-[10px]"></i>
            </div>
            <div className="text-sm font-black text-slate-900">{runwayMonths} tháng</div>
            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-500"
                style={{ width: `${runwayPercent}%` }}
              ></div>
            </div>
            <div className="text-[8.5px] text-slate-500 font-medium truncate">
              Đệm: {formatVND(liquidAssets, isPrivacyMode)}
            </div>
          </div>

          {/* Card 4: Quỹ Lớn */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider truncate">
                4. Cột Mốc / BĐS
              </span>
              <i className="fa-solid fa-landmark text-emerald-600 text-[10px]"></i>
            </div>
            <div className="text-sm font-black text-slate-900">{milestoneProgressPercent}%</div>
            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${milestoneProgressPercent}%` }}
              ></div>
            </div>
            <div className="text-[8.5px] text-slate-500 font-medium truncate">
              Cần: {formatVND(totalMilestoneTarget, isPrivacyMode)}
            </div>
          </div>
        </div>
      </div>

      {/* 4 PILLAR PROGRESS METRIC CARDS - DESKTOP (>= md) */}
      <div className="hidden md:block bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Target className="w-4 h-4 text-emerald-600 mr-2" />
              <span>Hoạch Định Mục Tiêu & Kế Hoạch Tích Sản</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Kỷ luật tích sản định kỳ (DCA) • Cột mốc tài sản lớn • Thẩm định phương án vay
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 lg:gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Nhóm 1: Trả Nợ Vay
              </span>
              <i className="fa-solid fa-file-invoice-dollar text-rose-500"></i>
            </div>
            <div className="text-xl font-black text-slate-900">{debtProgressPercent}%</div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-rose-500 h-full transition-all duration-500"
                style={{ width: `${debtProgressPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] text-slate-500 font-medium leading-relaxed">
              Đã trả: {formatVND(totalDebtPaid, isPrivacyMode)} / {formatVND(totalDebtOriginal, isPrivacyMode)}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Nhóm 2: Tích Sản Định Kỳ
              </span>
              <i className="fa-solid fa-coins text-amber-500"></i>
            </div>
            <div className="text-xl font-black text-slate-900">{dcaCount} Mục tiêu</div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: dcaCount ? '100%' : '0%' }}
              ></div>
            </div>
            <div className="text-[10px] text-slate-500 font-medium leading-relaxed">Theo dõi mua bù & nạp định kỳ</div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Nhóm 3: Dự Phòng (Runway)
              </span>
              <i className="fa-solid fa-shield-halved text-blue-600"></i>
            </div>
            <div className="text-xl font-black text-slate-900">{runwayMonths} tháng</div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-500"
                style={{ width: `${runwayPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] text-slate-500 font-medium leading-relaxed">
              Thanh khoản: {formatVND(liquidAssets, isPrivacyMode)}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Nhóm 4: Quỹ Lớn / BĐS
              </span>
              <i className="fa-solid fa-landmark text-emerald-600"></i>
            </div>
            <div className="text-xl font-black text-slate-900">{milestoneProgressPercent}%</div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${milestoneProgressPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] text-slate-500 font-medium leading-relaxed">
              Mục tiêu: {formatVND(totalMilestoneTarget, isPrivacyMode)}
            </div>
          </div>
        </div>
      </div>

      {/* ACTION BUTTON & FILTERS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <button
          onClick={() => {
            if (showGoalForm) handleCancelForm();
            else setShowGoalForm(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-sm cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>{showGoalForm ? 'Đóng Khung Thiết Lập' : '+ Thiết Lập Mục Tiêu Mới'}</span>
        </button>

        {/* TIME RANGE FILTER & GROUP FILTER */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full text-xs">
          {/* Group Filter */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setSelectedGroupFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedGroupFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tất Cả
            </button>
            <button
              onClick={() => setSelectedGroupFilter('debt')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedGroupFilter === 'debt' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Trả Nợ
            </button>
            <button
              onClick={() => setSelectedGroupFilter('dca')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedGroupFilter === 'dca' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tích Sản DCA
            </button>
            <button
              onClick={() => setSelectedGroupFilter('runway')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedGroupFilter === 'runway' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Dự Phòng
            </button>
            <button
              onClick={() => setSelectedGroupFilter('milestone')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedGroupFilter === 'milestone' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Cột Mốc Lớn
            </button>
          </div>

          {/* Time Filter */}
          <div className="flex items-center space-x-1 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Thời gian:</span>
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'month', label: 'Tháng này' },
                { id: 'quarter', label: 'Quý này' },
                { id: 'year', label: '1 Năm' },
                { id: 'longterm', label: 'Dài hạn' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTimeFilter(t.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  selectedTimeFilter === t.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GOAL FORM MODAL OVERLAY (Responsive Bottom Sheet on Mobile, Click outside backdrop to exit) */}
      {showGoalForm && (
        <div
          onClick={handleCancelForm}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <form
            ref={goalFormRef}
            onSubmit={handleSaveGoal}
            onClick={(e) => e.stopPropagation()}
            className={`bg-white p-4 sm:p-6 rounded-t-3xl sm:rounded-2xl border shadow-2xl space-y-4 w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto cursor-default ${
              editingGoalId ? 'border-amber-400 ring-4 ring-amber-100' : 'border-slate-200'
            }`}
          >
            {/* Mobile Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-1 sm:hidden"></div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1 mr-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center">
                  <Target className="w-4 h-4 text-blue-600 mr-2 shrink-0" />
                  <span className="truncate">{editingGoalId ? `Chỉnh Sửa Mục Tiêu: ${goalName}` : 'Thiết Lập Mục Tiêu Hoạch Định'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  Đồng bộ liên kết chính xác từ Tab 1 & Tab 2 • Tùy biến chu kỳ • Nhắc hẹn ngày chốt
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelForm}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer shrink-0"
                title="Đóng khung nhập"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

          {/* Goal Mode Switcher */}
          <div className="flex p-1 bg-slate-100 rounded-xl max-w-md">
            <button
              type="button"
              onClick={() => {
                setFormMode('dca');
                setGoalGroup('dca');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                formMode === 'dca' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <i className="fa-solid fa-calendar-check text-amber-500 mr-1.5"></i>
              <span>Tích Sản Định Kỳ (DCA)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormMode('milestone');
                if (goalGroup === 'dca') setGoalGroup('milestone');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                formMode === 'milestone' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <i className="fa-solid fa-flag-checkered text-blue-600 mr-1.5"></i>
              <span>Cột Mốc Lớn (Milestone)</span>
            </button>
          </div>

          {/* Phân nhóm mục tiêu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Phân Nhóm 4 Trụ Cột Mục Tiêu
              </label>
              <select
                value={goalGroup}
                onChange={(e) => setGoalGroup(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-blue-500"
              >
                <option value="dca">Nhóm 2: Tích Sản Định Kỳ (Cổ phiếu, Vàng, Tiền gửi...)</option>
                <option value="runway">Nhóm 3: Quỹ Dự Phòng Thanh Khoản (Khẩn cấp 3-6-12T)</option>
                <option value="debt">Nhóm 1: Trả Nợ Vay & Giảm Đòn Bẩy (Liên kết nợ Tab 2)</option>
                <option value="milestone">Nhóm 4: Cột Mốc Lớn / Quỹ BĐS / FIRE</option>
              </select>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-700 flex items-center">
              {goalGroupLabels[goalGroup].desc}
            </div>
          </div>

          {/* DCA MODE FORM SECTION */}
          {formMode === 'dca' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Loại Tài Sản</label>
                  <select
                    value={assetType}
                    onChange={(e) => handleAssetTypeChange(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-emerald-500"
                  >
                    <option value="stock">Cổ Phiếu / ETF Tích Sản</option>
                    <option value="gold">Vàng Vật Chất (Nhẫn tròn / SJC)</option>
                    <option value="saving">Tiền Tiết Kiệm Định Kỳ</option>
                    <option value="cash">Tiền Mặt / Quỹ Thanh Khoản</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Liên Kết Tài Sản Tab 1 (Chính xác)
                  </label>
                  <div className="space-y-1.5">
                    <select
                      value={linkedAssetId || ''}
                      onChange={(e) => handleSelectAssetFromTab1(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="">-- Chọn tài sản từ Tab 1 --</option>
                      {db.assets.some((a) => a.type === 'saving') && (
                        <optgroup label="Sổ Tiết Kiệm (Tab 1)">
                          {db.assets
                            .filter((a) => a.type === 'saving')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                🏦 {a.name} (Số dư: {formatVND(a.amount)}{a.rate ? ` • Lãi: ${a.rate}%` : ''}{a.maturityDate ? ` • Đáo hạn: ${a.maturityDate}` : ''})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {db.assets.some((a) => a.type === 'stock') && (
                        <optgroup label="Cổ Phiếu / Quỹ Đầu Tư (Tab 1)">
                          {db.assets
                            .filter((a) => a.type === 'stock')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                📈 {a.name} ({formatNumberString(a.quantity || 0)} CP • {formatVND(a.amount)})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {db.assets.some((a) => a.type === 'gold') && (
                        <optgroup label="Vàng Vật Chất (Tab 1)">
                          {db.assets
                            .filter((a) => a.type === 'gold')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                🪙 {a.name} ({formatNumberString(a.quantity || 0)} chỉ • {formatVND(a.amount)})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {db.assets.some((a) => a.type === 'cash') && (
                        <optgroup label="Tiền Mặt & Quỹ Thanh Khoản (Tab 1)">
                          {db.assets
                            .filter((a) => a.type === 'cash')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                💵 {a.name} ({formatVND(a.amount)})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {db.assets.some((a) => a.type !== 'saving' && a.type !== 'stock' && a.type !== 'gold' && a.type !== 'cash') && (
                        <optgroup label="Tài Sản Khác (Tab 1)">
                          {db.assets
                            .filter((a) => a.type !== 'saving' && a.type !== 'stock' && a.type !== 'gold' && a.type !== 'cash')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                📦 {a.name} ({formatVND(a.amount)})
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>

                    <input
                      ref={formMode === 'dca' ? goalNameInputRef : undefined}
                      type="text"
                      value={goalName}
                      onChange={(e) => setGoalName(e.target.value)}
                      placeholder="Hoặc tự gõ tên mục tiêu..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Kỳ Hạn Mua / Nạp</label>
                  <select
                    value={freqMonths}
                    onChange={(e) => setFreqMonths(Number(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:border-emerald-500"
                  >
                    <option value="1">1 Tháng (Hàng tháng)</option>
                    <option value="2">2 Tháng một lần</option>
                    <option value="3">3 Tháng (Hàng quý)</option>
                    <option value="6">6 Tháng (Nửa năm)</option>
                    <option value="12">1 Năm (Hàng năm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Định Mức & Ngày Chốt
                  </label>
                  <div className="flex space-x-1.5">
                    <input
                      type="text"
                      value={targetQtyStr}
                      onChange={(e) => setTargetQtyStr(formatNumberString(e.target.value))}
                      placeholder={unit === 'VNĐ' ? 'Số tiền' : 'Số lượng'}
                      className="w-1/2 bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-emerald-700 outline-none"
                    />
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-1/4 bg-slate-50 border border-slate-300 rounded-xl px-1 text-xs font-bold outline-none"
                    >
                      <option value="CP">CP</option>
                      <option value="chỉ">chỉ</option>
                      <option value="lượng">lượng</option>
                      <option value="VNĐ">VNĐ</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={goalDay}
                      onChange={(e) => setGoalDay(Number(e.target.value) || 1)}
                      placeholder="Ngày"
                      className="w-1/4 bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none"
                      title="Ngày chốt định kỳ trong tháng"
                    />
                  </div>
                </div>
              </div>

              {/* Tab 1 Linked Info Badge */}
              {linkedAssetId && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      <b>Đã liên kết chính xác với Tab 1:</b>{' '}
                      {(() => {
                        const a = db.assets.find((item) => item.id === linkedAssetId);
                        if (!a) return 'Chưa kết nối';
                        if (a.type === 'saving') {
                          return `Sổ tiết kiệm "${a.name}" • Số dư hiện tại: ${formatVND(a.amount)}${
                            a.rate ? ` • Lãi suất: ${a.rate}%/năm` : ''
                          }`;
                        } else if (a.type === 'stock') {
                          return `Cổ phiếu "${a.name}" • Số lượng hiện có: ${formatNumberString(a.quantity || 0)} CP`;
                        } else if (a.type === 'gold') {
                          return `Vàng "${a.name}" • Số lượng hiện có: ${formatNumberString(a.quantity || 0)} chỉ`;
                        }
                        return `${a.name} • Số dư: ${formatVND(a.amount)}`;
                      })()}
                    </span>
                  </span>
                  <span className="text-[11px] text-emerald-700 italic">
                    Khi bấm "Đã mua kỳ này", số tiền/SL sẽ được tự động cộng vào Tab 1
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* MILESTONE MODE FORM SECTION */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {goalGroup === 'debt' && (
                  <div className="md:col-span-4 bg-rose-50 border border-rose-200 p-3 rounded-xl">
                    <label className="block text-[11px] font-bold text-rose-900 mb-1">
                      Chọn Khoản Nợ Cần Tất Toán Từ Tab 2 (Tự động điền dư nợ)
                    </label>
                    <select
                      value={linkedDebtId || ''}
                      onChange={(e) => handleSelectDebtFromTab2(e.target.value)}
                      className="w-full bg-white border border-rose-300 rounded-lg p-2 text-xs font-bold text-rose-800 outline-none"
                    >
                      <option value="">-- Chọn khoản nợ từ Tab 2 --</option>
                      {db.debts
                        .filter((d) => d.status !== 'Đã tất toán')
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} (Dư nợ gốc: {formatVND(Math.max(0, d.amount - (d.paidPrincipal || 0)))})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Tên Cột Mốc</label>
                  <input
                    ref={formMode === 'milestone' ? goalNameInputRef : undefined}
                    type="text"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="VD: Mua nhà đất ven đô / Quỹ hưu trí..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Tổng Số Tiền Mục Tiêu (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={goalTargetStr}
                    onChange={(e) => setGoalTargetStr(formatNumberString(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-blue-700 outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Thời Hạn Hoàn Thành (Năm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={goalYears}
                    onChange={(e) => setGoalYears(Number(e.target.value) || 1)}
                    placeholder="VD: 3"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold outline-none focus:bg-white"
                  />
                </div>
              </div>

              {parseFormattedNumber(goalTargetStr) > 0 && goalYears > 0 && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900 font-semibold flex items-center justify-between">
                  <span>
                    📅 <b>Phân rã tiến độ:</b> Cần trích lũy trung bình{' '}
                    <b className="text-blue-700">
                      {formatVND(Math.round(parseFormattedNumber(goalTargetStr) / goalYears))} / năm
                    </b>{' '}
                    (≈{' '}
                    <b className="text-blue-700">
                      {formatVND(Math.round(parseFormattedNumber(goalTargetStr) / (goalYears * 12)))} / tháng
                    </b>
                    ).
                  </span>
                  <span className="text-[11px] text-blue-600">
                    Hạn chót:{' '}
                    {calculateMilestoneDueDate(currentPeriodStr, goalYears).targetPeriodStr}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="pt-1">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Ghi Chú Kế Hoạch</label>
            <input
              type="text"
              value={goalNote}
              onChange={(e) => setGoalNote(e.target.value)}
              placeholder="VD: Điều kiện ưu tiên, tài khoản đích, ghi nhớ..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-semibold outline-none focus:bg-white"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer"
          >
            {editingGoalId ? '✓ Cập Nhật Thay Đổi Mục Tiêu' : '+ Lưu Mục Tiêu Vào Kế Hoạch'}
          </button>
          </form>
        </div>
      )}

      {/* GOALS MANAGEMENT TABLE - REQUESTED BY USER */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3 bg-white">
          <div
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none min-w-0 flex-1"
            onClick={() => setShowGoalTable(!showGoalTable)}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
              {showGoalTable ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                  Bảng Quản Trị Mục Tiêu & Kế Hoạch Tích Sản
                </h3>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-bold bg-blue-100 text-blue-800 shrink-0 whitespace-nowrap">
                  {filteredGoals.length} / {db.goals.length} mục tiêu
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">
                Theo dõi hạn chốt, lịch nạp định kỳ và liên kết Tab 1
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowGoalTable(!showGoalTable)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="whitespace-nowrap">{showGoalTable ? 'Thu Gọn' : 'Xem Chi Tiết'}</span>
          </button>
        </div>

        {showGoalTable && (
          <div className="border-t border-slate-100 p-2.5 sm:p-5 pt-2 sm:pt-3 space-y-2 sm:space-y-4">
            {/* 1. DEDICATED MOBILE VIEW (< md) - COMPACT CARD LIST */}
            <div className="md:hidden space-y-2">
              {filteredGoals.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Chưa có mục tiêu nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredGoals.map((g, index) => {
                  const isDCA = g.goalType === 'dca';
                  const groupMeta = goalGroupLabels[g.group] || goalGroupLabels.dca;

                  const linkedAsset = g.linkedAssetId
                    ? db.assets.find((a) => a.id === g.linkedAssetId)
                    : db.assets.find((a) => a.name.toLowerCase() === g.name.toLowerCase());

                  const isBoughtThisPeriod = g.lastBoughtPeriod === currentPeriodStr;
                  const backlog = g.backlogQty || 0;
                  const dueThisPeriod = (g.targetQty || 0) + backlog;
                  const freqMonths = g.freqMonths || 1;
                  const freqLabel =
                    freqMonths === 1
                      ? 'Hàng tháng'
                      : freqMonths === 3
                      ? 'Hàng quý'
                      : freqMonths === 6
                      ? 'Nửa năm'
                      : `${freqMonths}T/lần`;

                  const { diffDays, nextDueDateStr } = calculateDCADaysRemaining(g.day || 10, freqMonths);
                  const { targetPeriodStr, monthsLeft } = calculateMilestoneDueDate(
                    g.createdAt || currentPeriodStr,
                    g.years || 1
                  );

                  const milestoneProgress =
                    !isDCA && g.target && g.target > 0
                      ? Math.min(100, Math.round((netWorth / g.target) * 100))
                      : 0;

                  return (
                    <div
                      key={g.id}
                      className={`bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200 p-2.5 space-y-2 transition shadow-2xs ${
                        g.status === 'completed' ? 'opacity-70 bg-emerald-50/30' : ''
                      }`}
                    >
                      {/* Row 1: STT, Group Badge, Name, Edit/Delete */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold border shrink-0 ${groupMeta.bg} ${groupMeta.color}`}
                          >
                            {groupMeta.label}
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate block leading-tight">{g.name}</span>
                        </div>

                        {/* Status & Edit/Delete actions */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {g.status === 'completed' && (
                            <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ✓ Đã đạt
                            </span>
                          )}
                          <button
                            onClick={() => handleEditGoal(g)}
                            className="p-1 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Sửa mục tiêu"
                          >
                            <Pen className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa mục tiêu "${g.name}"?`)) {
                                onRemoveGoal(g.id);
                              }
                            }}
                            className="p-1 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition active:scale-95 cursor-pointer"
                            title="Xóa mục tiêu"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: 2-Column Info Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-200/70 text-xs">
                        <div>
                          <span className="text-[9px] text-slate-400 font-medium block leading-tight">Định mức cam kết</span>
                          {isDCA ? (
                            <div className="mt-0.5">
                              <span className="text-xs font-black text-slate-900">
                                {formatNumberString(g.targetQty)} {g.unit}
                              </span>
                              <span className="text-[9.5px] text-slate-500 block leading-tight">
                                {freqLabel} • N{g.day || 10}
                              </span>
                            </div>
                          ) : (
                            <div className="mt-0.5">
                              <span className="text-xs font-black text-blue-700">
                                {formatVND(g.target, isPrivacyMode)}
                              </span>
                              <span className="text-[9.5px] text-slate-500 block leading-tight">
                                {g.years}N (~{formatVND(Math.round((g.target || 0) / ((g.years || 1) * 12)), isPrivacyMode)}/th)
                              </span>
                            </div>
                          )}
                          {linkedAsset && (
                            <div className="mt-1 flex items-center gap-1 text-[9px] text-blue-700 font-medium truncate">
                              <LinkIcon className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">Tab 1: {linkedAsset.name}</span>
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 font-medium block leading-tight">Tiến độ tích lũy</span>
                          {isDCA ? (
                            <div className="mt-0.5">
                              <span className="text-xs font-bold text-emerald-700 block leading-tight">
                                Gom: {formatNumberString(g.totalBought || 0)} {g.unit}
                              </span>
                              <div className="flex items-center justify-end gap-1 mt-0.5 flex-wrap">
                                {isBoughtThisPeriod ? (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    ✓ Đã gom
                                  </span>
                                ) : backlog > 0 ? (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                    Bù: {formatNumberString(dueThisPeriod)} {g.unit}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    ⏳ Chờ gom
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-400">
                                  {!isBoughtThisPeriod && diffDays >= 0 && diffDays <= 3 ? (
                                    <span className="text-rose-600 font-bold">{diffDays} ngày</span>
                                  ) : (
                                    <span>Hạn {nextDueDateStr}</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-0.5">
                              <div className="flex items-baseline justify-end gap-1">
                                <span className="text-xs font-black text-slate-900">{milestoneProgress}%</span>
                                <span className="text-[9.5px] text-slate-500">
                                  ({formatVND(netWorth, isPrivacyMode)})
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden my-1">
                                <div
                                  className="bg-blue-600 h-full transition-all duration-500"
                                  style={{ width: `${milestoneProgress}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-500 block leading-tight">
                                Hạn: {targetPeriodStr} (~{monthsLeft}T)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 3: Action Buttons */}
                      {g.status !== 'completed' && (
                        <div className="pt-1.5 border-t border-slate-200/70 grid grid-cols-3 gap-1.5">
                          {isDCA ? (
                            <>
                              <button
                                onClick={() => handleMarkDCABought(g)}
                                className="py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Nạp kỳ này</span>
                              </button>
                              <button
                                onClick={() => handleCarryOverBacklog(g)}
                                className="py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>Nợ kỳ sau</span>
                              </button>
                              <button
                                onClick={() => handleCompleteGoal(g)}
                                className="py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Đã đạt</span>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleCompleteGoal(g)}
                              className="col-span-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-[10.5px] font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Đánh dấu đã hoàn thành</span>
                            </button>
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
                  <th className="p-3 text-center w-10">STT</th>
                  <th className="p-3 min-w-[130px]">Nhóm</th>
                  <th className="p-3 min-w-[200px]">Mục Tiêu & Liên Kết</th>
                  <th className="p-3 min-w-[140px]">Định Mức / Kỳ</th>
                  <th className="p-3 text-right min-w-[180px]">Tiến Độ Tích Lũy</th>
                  <th className="p-3 text-center min-w-[150px]">Lịch Hạn & Trạng Thái</th>
                  <th className="p-3 text-center w-28">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredGoals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      Chưa có mục tiêu nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredGoals.map((g, index) => {
                    const isDCA = g.goalType === 'dca';
                    const groupMeta = goalGroupLabels[g.group] || goalGroupLabels.dca;

                    // Linked asset info from Tab 1
                    const linkedAsset = g.linkedAssetId
                      ? db.assets.find((a) => a.id === g.linkedAssetId)
                      : db.assets.find((a) => a.name.toLowerCase() === g.name.toLowerCase());

                    // DCA calculation
                    const isBoughtThisPeriod = g.lastBoughtPeriod === currentPeriodStr;
                    const backlog = g.backlogQty || 0;
                    const dueThisPeriod = (g.targetQty || 0) + backlog;
                    const freqMonths = g.freqMonths || 1;
                    const freqLabel =
                      freqMonths === 1
                        ? 'Hàng tháng'
                        : freqMonths === 3
                        ? 'Hàng quý'
                        : freqMonths === 6
                        ? 'Nửa năm'
                        : `${freqMonths}T/lần`;

                    const { diffDays, nextDueDateStr } = calculateDCADaysRemaining(g.day || 10, freqMonths);

                    // Milestone calculation
                    const { targetPeriodStr, monthsLeft } = calculateMilestoneDueDate(
                      g.createdAt || currentPeriodStr,
                      g.years || 1
                    );
                    const milestoneTarget = g.target || 1;
                    const milestoneProgress = Math.min(100, Math.round((netWorth / milestoneTarget) * 100));

                    return (
                      <tr key={g.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 text-center font-bold text-slate-400">{index + 1}</td>

                        {/* Nhóm */}
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${groupMeta.tagClass}`}
                          >
                            <i className={`fa-solid ${groupMeta.icon} mr-1`}></i>
                            <span>{g.group === 'debt' ? '1. Trả Nợ' : g.group === 'dca' ? '2. Tích Sản' : g.group === 'runway' ? '3. Dự Phòng' : '4. Cột Mốc'}</span>
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                            {isDCA ? 'Tích sản DCA' : 'Cột mốc vốn'}
                          </div>
                        </td>

                        {/* Tên Mục Tiêu & Liên Kết */}
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-xs">{g.name}</div>
                          {linkedAsset ? (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <LinkIcon className="w-2.5 h-2.5 mr-1" />
                                {linkedAsset.type === 'saving' ? (
                                  <span>Tab 1: Sổ {formatVND(linkedAsset.amount, isPrivacyMode)}</span>
                                ) : linkedAsset.type === 'stock' ? (
                                  <span>Tab 1: {formatNumberString(linkedAsset.quantity || 0)} CP</span>
                                ) : linkedAsset.type === 'gold' ? (
                                  <span>Tab 1: {formatNumberString(linkedAsset.quantity || 0)} chỉ</span>
                                ) : (
                                  <span>Tab 1: {formatVND(linkedAsset.amount, isPrivacyMode)}</span>
                                )}
                              </span>
                            </div>
                          ) : (
                            g.linkedDebtId && (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  Link Nợ Tab 2
                                </span>
                              </div>
                            )
                          )}
                          {g.note && <div className="text-[10px] text-slate-400 italic mt-0.5">"{g.note}"</div>}
                        </td>

                        {/* Định Mức */}
                        <td className="p-3">
                          {isDCA ? (
                            <div>
                              <div className="font-bold text-slate-900 text-xs">
                                {formatNumberString(g.targetQty)} {g.unit}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {freqLabel} • Ngày {g.day || 10}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-bold text-blue-700 text-xs">
                                {formatVND(g.target, isPrivacyMode)}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {g.years} Năm (~
                                {formatVND(Math.round((g.target || 0) / ((g.years || 1) * 12)), isPrivacyMode)}
                                /tháng)
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Tiến Độ Tích Lũy */}
                        <td className="p-3 text-right">
                          {isDCA ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-bold text-emerald-700">
                                Đã gom: {formatNumberString(g.totalBought || 0)} {g.unit}
                              </div>
                              {backlog > 0 ? (
                                <div className="text-[10px] font-bold text-rose-600 animate-pulse">
                                  ⚠️ Nợ mua bù: {formatNumberString(backlog)} {g.unit}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">Đầy đủ tiến độ</div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-end space-x-1 text-[11px]">
                                <span className="font-bold text-slate-900">{milestoneProgress}%</span>
                                <span className="text-slate-400">
                                  ({formatVND(netWorth, isPrivacyMode)} / {formatVND(g.target, isPrivacyMode)})
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden ml-auto max-w-[120px]">
                                <div
                                  className="bg-blue-600 h-full transition-all duration-500"
                                  style={{ width: `${milestoneProgress}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Lịch Hạn & Trạng Thái */}
                        <td className="p-3 text-center">
                          {isDCA ? (
                            <div className="space-y-1">
                              <div>
                                {isBoughtThisPeriod ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    ✓ Đã mua kỳ này
                                  </span>
                                ) : backlog > 0 ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                    ⚠️ Cần mua bù ({formatNumberString(dueThisPeriod)} {g.unit})
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    ⏳ Chờ mua
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {!isBoughtThisPeriod && diffDays >= 0 && diffDays <= 3 ? (
                                  <span className="text-rose-600 font-bold">⚠️ Tới hạn sau {diffDays} ngày</span>
                                ) : (
                                  <span>Hạn: {nextDueDateStr}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Hạn: {targetPeriodStr}
                              </span>
                              <div className="text-[10px] text-slate-500 font-medium">
                                Còn ~{monthsLeft} tháng
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Thao Tác */}
                        <td className="p-3 text-center space-x-1 whitespace-nowrap">
                          {g.status === 'completed' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              <span>Đã đạt</span>
                            </span>
                          ) : (
                            <>
                              {isDCA && (
                                <>
                                  <button
                                    onClick={() => handleMarkDCABought(g)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer inline-flex items-center space-x-1"
                                    title="Xác nhận đã mua/nạp kỳ này (Tự động cộng Tab 1)"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Nạp kỳ này</span>
                                  </button>
                                  <button
                                    onClick={() => handleCarryOverBacklog(g)}
                                    className="px-2 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer inline-flex items-center space-x-1"
                                    title="Chưa gom được kỳ này, chuyển nợ sang tháng sau mua bù (VD: nợ 1 chỉ -> tháng sau mua 2 chỉ)"
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>Nợ kỳ sau</span>
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleCompleteGoal(g)}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer inline-flex items-center space-x-1"
                                title="Đánh dấu hoàn thành mục tiêu (Tự động cập nhật Tab 1 / Tab 2)"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Hoàn thành</span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleEditGoal(g)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Sửa mục tiêu (Tự động cuộn lên form)"
                          >
                            <Pen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa mục tiêu "${g.name}"?`)) {
                                onRemoveGoal(g.id);
                              }
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa mục tiêu"
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

      {/* REAL ESTATE LOAN STRESS TEST SECTION */}
      <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4 bg-white">
          <div
            className="flex items-start sm:items-center space-x-3 cursor-pointer select-none min-w-0 flex-1"
            onClick={() => setShowStressTest(!showStressTest)}
          >
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0">
              {showStressTest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  Thẩm Định Mua BĐS & Thử Tải Nợ
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 shrink-0 whitespace-nowrap">
                  Mô phỏng
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Khớp vốn tự có & thử tải dòng tiền trả góp qua các giai đoạn
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2">
            <button
              onClick={autoFillStressTest}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Tự động trích xuất vốn tự thân và dòng tiền khả dụng từ Tháp tài sản & Dòng tiền"
            >
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 text-emerald-600" />
              <span className="whitespace-nowrap">Tự động điền</span>
            </button>
            <button
              onClick={() => setShowStressTest(!showStressTest)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <span className="whitespace-nowrap">{showStressTest ? 'Thu Gọn' : 'Xem Chi Tiết'}</span>
            </button>
          </div>
        </div>

        {showStressTest && (
          <div className="border-t border-slate-100 p-3 sm:p-6 space-y-4 sm:space-y-5">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 text-xs">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                <span>Thông số giả định thẩm định</span>
                <span className="text-[9.5px] text-slate-400 font-normal lowercase">12 tiêu chí</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    1. Giá BĐS mua (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={simTargetValStr}
                    onChange={(e) => setSimTargetValStr(formatNumberString(e.target.value))}
                    placeholder="VD: 3.000.000.000"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-bold text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    2. Mua sau (tháng)
                  </label>
                  <input
                    type="number"
                    value={simMonthsLeft}
                    onChange={(e) => setSimMonthsLeft(Number(e.target.value) || 1)}
                    placeholder="24"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    3. Tiền gửi bán (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={simCashValStr}
                    onChange={(e) => setSimCashValStr(formatNumberString(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold text-emerald-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    4. Vàng bán (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={simGoldValStr}
                    onChange={(e) => setSimGoldValStr(formatNumberString(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold text-amber-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    5. Cổ phiếu bán (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={simStockValStr}
                    onChange={(e) => setSimStockValStr(formatNumberString(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold text-blue-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    6. Quỹ khẩn cấp giữ (VNĐ)
                  </label>
                  <input
                    type="text"
                    value={simEmergencyFundStr}
                    onChange={(e) => setSimEmergencyFundStr(formatNumberString(e.target.value))}
                    placeholder="150.000.000"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold text-rose-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    7. Hạn gói vay (Năm)
                  </label>
                  <input
                    type="number"
                    value={simLoanYears}
                    onChange={(e) => setSimLoanYears(Number(e.target.value) || 1)}
                    placeholder="20"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-purple-800 mb-1 text-[11px] truncate">
                    8. Ân hạn gốc (Năm)
                  </label>
                  <input
                    type="number"
                    value={simGraceYears}
                    onChange={(e) => setSimGraceYears(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-white border border-purple-300 rounded-lg p-1.5 sm:p-2 text-xs font-bold text-purple-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    9. Lãi ưu đãi (Tháng)
                  </label>
                  <input
                    type="number"
                    value={simPromoMonths}
                    onChange={(e) => setSimPromoMonths(Number(e.target.value) || 0)}
                    placeholder="24"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-800 mb-1 text-[11px] truncate">
                    10. Lãi ưu đãi (%/n)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={simPromoRate}
                    onChange={(e) => setSimPromoRate(Number(e.target.value) || 0)}
                    placeholder="6.5"
                    className="w-full bg-white border border-emerald-300 rounded-lg p-1.5 sm:p-2 text-xs font-bold text-emerald-700 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-rose-800 mb-1 text-[11px] truncate">
                    11. Sau ưu đãi (%/n)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={simNormalRate}
                    onChange={(e) => setSimNormalRate(Number(e.target.value) || 0)}
                    placeholder="10.5"
                    className="w-full bg-white border border-rose-300 rounded-lg p-1.5 sm:p-2 text-xs font-bold text-rose-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px] truncate">
                    12. Sốc lãi suất (%/n)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={simStressRate}
                    onChange={(e) => setSimStressRate(Number(e.target.value) || 0)}
                    placeholder="12.5"
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold text-rose-700 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  A. Nguồn Vốn Tự Có Tích Lũy
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-600">Vốn sẵn có ròng:</span>
                  <span className="font-bold text-slate-900">{formatVND(liquidAssetsReady, isPrivacyMode)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Thặng dư tích thêm:</span>
                  <span className="font-bold text-emerald-600">
                    +{formatVND(surplusAccumulated, isPrivacyMode)} ({simMonthsLeft}T)
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                  <span className="font-bold text-slate-800">Tổng vốn tự thân:</span>
                  <span className="font-black text-emerald-700">
                    {formatVND(totalOwnCapital, isPrivacyMode)}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  B. Chi Trả Từng Giai Đoạn
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-600">Vốn cần vay ngân hàng:</span>
                  <span className="font-bold text-rose-600">{formatVND(loanNeeded, isPrivacyMode)}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span>Giai đoạn ưu đãi:</span>
                  <span>
                    {formatVND(totalPromoMonthlyDebt, isPrivacyMode)}/tháng (Lãi: {simPromoRate}%)
                  </span>
                </div>
                <div className="flex justify-between text-rose-800 font-semibold">
                  <span>Sau ưu đãi (thả nổi):</span>
                  <span>
                    {formatVND(totalNormalMonthlyDebt, isPrivacyMode)}/tháng (Lãi: {simNormalRate}%)
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                  <span className="font-bold text-slate-800">Đệm dòng tiền dư:</span>
                  <span
                    className={`font-black ${
                      netBuffer >= 0 ? 'text-blue-700' : 'text-rose-600'
                    }`}
                  >
                    {netBuffer >= 0 ? `+${formatVND(netBuffer, isPrivacyMode)}` : formatVND(netBuffer, isPrivacyMode)}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  C. Thước Đo An Toàn (Stress-Test)
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tỷ lệ vay (LTV):</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      ltv <= 50
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : ltv <= 70
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {ltv}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Gánh nặng nợ (DSTI sau ƯĐ):</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      dsti <= 35
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : dsti <= 45
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {dsti}%
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-600">Sốc lãi suất kiểm thử:</span>
                  <span className="font-bold text-rose-600">
                    {formatVND(totalStressMonthlyDebt, isPrivacyMode)}/tháng (Lãi {simStressRate}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Advisory feedback */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-xs space-y-2">
              <div className="font-bold text-blue-900 flex items-center">
                <Sparkles className="w-4 h-4 text-amber-500 mr-2" />
                <span>Khuyến Nghị Tài Chính Cụ Thể Cho Phương Án Này</span>
              </div>
              <div className="text-blue-800 leading-relaxed">
                {loanNeeded === 0 ? (
                  <span>
                    🎉 <b>Phương án an toàn tuyệt đối!</b> Tổng vốn tự có tích lũy ({formatVND(totalOwnCapital)}) đã bao phủ
                    100% giá trị tài sản mục tiêu. Bạn không cần vay vốn ngân hàng.
                  </span>
                ) : ltv <= 50 && dsti <= 35 ? (
                  <span>
                    ✅ <b>Phương án rất an toàn & khả thi!</b> Tỷ lệ vay LTV đạt <b>{ltv}%</b> (≤ 50%) và gánh nặng nợ DSTI sau
                    ưu đãi là <b>{dsti}%</b> (≤ 35%). Dù bước vào giai đoạn sau ưu đãi ({simNormalRate}%), đệm dòng tiền thặng
                    dư vẫn còn <b>{formatVND(netBuffer)}/tháng</b>.
                  </span>
                ) : ltv > 70 || dsti > 45 ? (
                  <span>
                    ⚠️ <b>Cảnh báo quá tải nghĩa vụ trả nợ!</b> Gánh nặng DSTI sau ưu đãi là <b>{dsti}%</b> (vượt trần an toàn
                    45%). Khi kiểm thử kịch bản sốc lãi suất ({simStressRate}%), chi trả lên đến{' '}
                    {formatVND(totalStressMonthlyDebt)}/tháng.
                    <br />
                    <b>Khuyến nghị:</b> 1. Kéo dài kỳ hạn vay lên 25–30 năm hoặc tăng số năm ân hạn nợ gốc. 2. Lùi thời điểm giải
                    ngân để tích lũy thêm thặng dư. 3. Bán thêm tài sản Tầng 2 để giảm quy mô nợ vay.
                  </span>
                ) : (
                  <span>
                    ⚖️ <b>Phương án vừa sức nhưng cần theo dõi chặt!</b> Tỷ lệ vay LTV là {ltv}%, DSTI ở mức {dsti}%. Cần bảo
                    toàn nguyên vẹn quỹ dự phòng {formatVND(emergencyFund)} và chuẩn bị sẵn nguồn bù dòng tiền khi hết thời gian
                    ưu đãi.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BIỂU ĐỒ XU HƯỚNG MỤC TIÊU */}
      <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm space-y-2 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2 sm:pb-3 gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center truncate">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 mr-1.5 sm:mr-2 shrink-0" />
            <span className="truncate">Biểu Đồ Xu Hướng Hoàn Thành Mục Tiêu Thực Tế</span>
          </h3>
          <div className="flex bg-slate-100 p-0.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold self-start sm:self-auto">
            {(
              [
                { key: 'quarter', label: 'Quý' },
                { key: 'year', label: '1 Năm' },
                { key: '3years', label: '3 Năm' },
                { key: '5years', label: '5 Năm' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setGoalChartRange(t.key)}
                className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-lg transition cursor-pointer text-[10px] sm:text-xs ${
                  goalChartRange === t.key
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {/* RESPONSIVE CLEAN HTML LEGEND */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 pt-1">
          <div className="flex items-center space-x-1.5 px-2 py-1.5 bg-rose-50/80 border border-rose-200/90 rounded-lg text-[10px] sm:text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
            <span className="font-semibold text-rose-900 truncate">1. Trả Nợ:</span>
            <span className="font-black text-rose-700 ml-auto">{debtProgressPercent}%</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-1.5 bg-emerald-50/80 border border-emerald-200/90 rounded-lg text-[10px] sm:text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="font-semibold text-emerald-900 truncate">2. Tích Sản:</span>
            <span className="font-black text-emerald-700 ml-auto">{currentDcaPct}%</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-1.5 bg-blue-50/80 border border-blue-200/90 rounded-lg text-[10px] sm:text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
            <span className="font-semibold text-blue-900 truncate">3. Dự Phòng:</span>
            <span className="font-black text-blue-700 ml-auto">{runwayMonths}T ({runwayPercent}%)</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2 py-1.5 bg-amber-50/80 border border-amber-200/90 rounded-lg text-[10px] sm:text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
            <span className="font-semibold text-amber-900 truncate">4. Cột Mốc:</span>
            <span className="font-black text-amber-700 ml-auto">{milestoneProgressPercent}%</span>
          </div>
        </div>

        <div className="h-56 sm:h-72 pt-1">
          <canvas ref={chartProgressRef}></canvas>
        </div>
      </div>
    </div>
  );
};
