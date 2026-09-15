import { DatabaseState, HistoryPoint } from '../types';

export function parseFormattedNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = val.toString().trim();
  const clean = str.replace(/[^0-9]/g, '');
  return clean ? Number(clean) : 0;
}

export function formatNumberString(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'number' ? val : parseFormattedNumber(val);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatVND(val: number | undefined | null, isPrivacyMode: boolean = false): string {
  if (isPrivacyMode) return '•••••• ₫';
  const num = val || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
}

export function formatDateVN(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('vi-VN');
}

export function getCurrentTimestampVN(): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const dateStr = now.toLocaleDateString('vi-VN');
  return `${timeStr} - ${dateStr}`;
}

export function getDbTimestamp(d?: DatabaseState | null): number {
  if (!d) return 0;
  if (typeof d.updatedAtTimestamp === 'number' && d.updatedAtTimestamp > 0) {
    return d.updatedAtTimestamp;
  }
  if (d.lastUpdate) {
    const parts = d.lastUpdate.split(' - ');
    if (parts.length === 2) {
      const [timePart, datePart] = parts;
      const timeSegments = timePart.split(':').map((x) => parseInt(x, 10) || 0);
      const dateSegments = datePart.split('/').map((x) => parseInt(x, 10) || 0);
      const hh = timeSegments[0] || 0;
      const mm = timeSegments[1] || 0;
      const ss = timeSegments[2] || 0;
      const day = dateSegments[0] || 0;
      const month = dateSegments[1] || 0;
      const year = dateSegments[2] || 0;
      if (year && month && day) {
        const parsed = new Date(year, month - 1, day, hh, mm, ss).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    const dObj = new Date(d.lastUpdate);
    if (!isNaN(dObj.getTime())) return dObj.getTime();
  }
  return 0;
}

// Hàm tính ngày đáo hạn theo chuẩn tháng dương lịch ngân hàng (không bị trôi ngày do độ dài tháng)
export function getCalendarMaturityDateObj(startDateStr?: string, months?: number): { year: number; month: number; day: number } | null {
  if (!startDateStr || !months) return null;
  // Parse YYYY-MM-DD or valid date string
  const parts = startDateStr.split('-');
  let startYear = 0;
  let startMonth = 0;
  let startDay = 0;

  if (parts.length === 3) {
    startYear = parseInt(parts[0], 10);
    startMonth = parseInt(parts[1], 10); // 1-12
    startDay = parseInt(parts[2], 10);
  } else {
    const d = new Date(startDateStr);
    if (isNaN(d.getTime())) return null;
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1;
    startDay = d.getDate();
  }

  if (!startYear || !startMonth || !startDay) return null;

  const totalMonths = (startYear * 12) + (startMonth - 1) + Number(months);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1-12

  // Số ngày tối đa của tháng đáo hạn
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(startDay, maxDaysInTargetMonth);

  return { year: targetYear, month: targetMonth, day: targetDay };
}

export function calculateMaturityDate(startDateStr?: string, months?: number): string {
  const result = getCalendarMaturityDateObj(startDateStr, months);
  if (!result) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(result.day)}/${pad(result.month)}/${result.year}`;
}

export function calculateMaturityDateISO(startDateStr?: string, months?: number): string {
  const result = getCalendarMaturityDateObj(startDateStr, months);
  if (!result) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${result.year}-${pad(result.month)}-${pad(result.day)}`;
}

export function calculateDCADaysRemaining(targetDay: number = 10, freqMonths: number = 1): { diffDays: number; nextDueDateStr: string } {
  const now = new Date();
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonthDue = new Date(now.getFullYear(), now.getMonth(), targetDay);
  const nextDue = currentMonthDue >= todayDateOnly
    ? currentMonthDue
    : new Date(now.getFullYear(), now.getMonth() + Number(freqMonths), targetDay);
  const diffDays = Math.round((nextDue.getTime() - todayDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  return { diffDays, nextDueDateStr: nextDue.toLocaleDateString('vi-VN') };
}

export function calculateMilestoneDueDate(createdAt?: string, years: number = 1): { targetPeriodStr: string; monthsLeft: number } {
  let created = new Date((createdAt || '') + '-01');
  if (isNaN(created.getTime())) created = new Date();
  const dueYear = created.getFullYear() + Number(years);
  const dueMonth = created.getMonth() + 1;
  const formattedMonth = String(dueMonth).padStart(2, '0');

  const now = new Date();
  const totalMonthsLeft = Math.max(0, (dueYear - now.getFullYear()) * 12 + (dueMonth - (now.getMonth() + 1)));
  return {
    targetPeriodStr: `Tháng ${formattedMonth}/${dueYear}`,
    monthsLeft: totalMonthsLeft,
  };
}

export async function hashString(str: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeAccountKey(input: string): string {
  if (!input) return '';
  const val = input.trim().toLowerCase();
  if (val.includes('@')) {
    return 'mail_' + val.replace(/[^a-z0-9_]/g, '_');
  } else {
    return 'phone_' + val.replace(/[^0-9]/g, '');
  }
}

export function parseHistoryDate(h: HistoryPoint): { timestamp: number; year: number; month: number; quarter: number } {
  if (h.timestamp && !isNaN(h.timestamp)) {
    const d = new Date(h.timestamp);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return { timestamp: h.timestamp, year: y, month: m, quarter: Math.floor((m - 1) / 3) + 1 };
  }
  if (h.date) {
    if (h.date.includes('/')) {
      const parts = h.date.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, d);
        return { timestamp: dt.getTime(), year: y, month: m, quarter: Math.floor((m - 1) / 3) + 1 };
      }
    } else if (h.date.includes('-')) {
      const parts = h.date.split('-');
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
        const dt = new Date(y, m - 1, d);
        return { timestamp: dt.getTime(), year: y, month: m, quarter: Math.floor((m - 1) / 3) + 1 };
      }
    }
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return { timestamp: now.getTime(), year: y, month: m, quarter: Math.floor((m - 1) / 3) + 1 };
}

export interface ActualChartPoint {
  key: string;
  label: string;
  timestamp: number;
  year: number;
  month: number;
  quarter: number;
  isCurrent: boolean;
  netWorth: number;
  totalAssets: number;
  totalDebts: number;
  inflow: number;
  outflow: number;
  netCashFlow: number;
  debtProgressPercent: number;
  dcaProgressPercent: number;
  runwayPercent: number;
  milestoneProgressPercent: number;
}

/**
 * Lấy danh sách các mốc thời gian thực tế đã có dữ liệu.
 * Bắt đầu từ tháng đầu tiên có thông tin trong hệ thống đến thời điểm hiện tại.
 * Tuyệt đối không tự bịa thêm mốc quá khứ không có dữ liệu và không dự phóng tương lai.
 */
export function getActualTimelinePoints(
  db: DatabaseState,
  currentValues: {
    netWorth: number;
    totalAssets: number;
    totalDebts: number;
    inflow: number;
    outflow: number;
    netCashFlow: number;
    debtProgressPercent: number;
    dcaProgressPercent: number;
    runwayPercent: number;
    milestoneProgressPercent: number;
  },
  range: 'quarter' | 'year' | '3years' | '5years'
): ActualChartPoint[] {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const now = new Date();
  const currYear = now.getFullYear();
  const currMonth = now.getMonth() + 1;
  const currQuarter = Math.floor((currMonth - 1) / 3) + 1;

  const pointsMap = new Map<string, ActualChartPoint>();

  // 1. Duyệt qua tất cả các bản ghi lịch sử thực tế trong db.history
  (db.history || []).forEach((h) => {
    const { timestamp, year, month, quarter } = parseHistoryDate(h);
    const key = `${year}-${pad(month)}`;
    const label = `T${pad(month)}/${year}`;

    // Nếu trong cùng tháng có nhiều bản ghi, lấy bản ghi có timestamp mới nhất
    const existing = pointsMap.get(key);
    if (!existing || timestamp > existing.timestamp) {
      pointsMap.set(key, {
        key,
        label,
        timestamp,
        year,
        month,
        quarter,
        isCurrent: false,
        netWorth: h.netWorth ?? ((h.totalAssets ?? 0) - (h.totalDebts ?? 0)),
        totalAssets: h.totalAssets ?? 0,
        totalDebts: h.totalDebts ?? 0,
        inflow: h.totalInflow ?? 0,
        outflow: h.totalOutflow ?? 0,
        netCashFlow: h.netCashFlow ?? ((h.totalInflow ?? 0) - (h.totalOutflow ?? 0)),
        debtProgressPercent:
          h.debtProgressPercent ??
          (h.totalDebts ? Math.max(5, Math.min(100, Math.round(((1635000000 - h.totalDebts) / 1635000000) * 100))) : 0),
        dcaProgressPercent: h.dcaProgressPercent ?? 50,
        runwayPercent: h.runwayPercent ?? Math.min(100, Math.round(((h.totalAssets * 0.15) / 500000000) * 100)),
        milestoneProgressPercent: h.milestoneProgressPercent ?? 10,
      });
    }
  });

  // 2. Điểm mốc thời gian hiện tại: lấy số liệu tính toán thực tế tại thời điểm này
  const currentKey = `${currYear}-${pad(currMonth)}`;
  const currentLabel = `T${pad(currMonth)}/${currYear} (Hiện tại)`;
  pointsMap.set(currentKey, {
    key: currentKey,
    label: currentLabel,
    timestamp: now.getTime(),
    year: currYear,
    month: currMonth,
    quarter: currQuarter,
    isCurrent: true,
    ...currentValues,
  });

  // 3. Sắp xếp các mốc thực tế theo thứ tự thời gian tăng dần
  let points = Array.from(pointsMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  // 4. Lọc theo phạm vi thời gian (chỉ lấy các mốc thực tế nằm trong khoảng, không tự ý bịa thêm mốc giả)
  if (range === 'quarter') {
    const inQuarter = points.filter((p) => p.year === currYear && p.quarter === currQuarter);
    if (inQuarter.length > 0) {
      points = inQuarter;
    }
  } else if (range === 'year') {
    const inYear = points.filter((p) => p.year === currYear);
    if (inYear.length > 0) {
      points = inYear;
    }
  } else if (range === '3years') {
    const in3Years = points.filter((p) => p.year >= currYear - 2);
    if (in3Years.length > 0) {
      points = in3Years;
    }
  } else if (range === '5years') {
    const in5Years = points.filter((p) => p.year >= currYear - 4);
    if (in5Years.length > 0) {
      points = in5Years;
    }
  }

  return points;
}

export interface TimelinePoint {
  key: string;
  label: string;
  isCurrent?: boolean;
  isFuture?: boolean;
  filterFn?: (timestamp: number) => boolean;
}

export function getStandardTimeline(range: 'quarter' | 'year' | '3years' | '5years'): TimelinePoint[] {
  const now = new Date();
  const currYear = now.getFullYear();
  const currMonth = now.getMonth() + 1; // 1-12
  const currQuarter = Math.floor((currMonth - 1) / 3) + 1; // 1-4
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (range === 'quarter') {
    // Chỉ lấy các tháng đã hình thành trong quý hiện tại (<= currMonth), không dự phóng
    const startMonth = (currQuarter - 1) * 3 + 1;
    const months: number[] = [];
    for (let m = startMonth; m <= currMonth; m++) {
      months.push(m);
    }

    // Nếu mới ở đầu quý (ví dụ tháng đầu tiên của quý), hiển thị 3 tháng gần nhất đã hình thành đến nay
    if (months.length === 1) {
      const p1 = currMonth === 1 ? 11 : currMonth === 2 ? 12 : currMonth - 2;
      const y1 = currMonth <= 2 ? currYear - 1 : currYear;
      const p2 = currMonth === 1 ? 12 : currMonth - 1;
      const y2 = currMonth === 1 ? currYear - 1 : currYear;
      return [
        {
          key: `m_${y1}_${p1}`,
          label: `T${pad(p1)}/${y1}`,
          filterFn: (ts) => {
            const d = new Date(ts);
            return d.getFullYear() === y1 && d.getMonth() + 1 === p1;
          },
        },
        {
          key: `m_${y2}_${p2}`,
          label: `T${pad(p2)}/${y2}`,
          filterFn: (ts) => {
            const d = new Date(ts);
            return d.getFullYear() === y2 && d.getMonth() + 1 === p2;
          },
        },
        {
          key: `m_${currYear}_${currMonth}`,
          label: `T${pad(currMonth)}/${currYear} (Hiện tại)`,
          isCurrent: true,
          filterFn: (ts) => {
            const d = new Date(ts);
            return d.getFullYear() === currYear && d.getMonth() + 1 === currMonth;
          },
        },
      ];
    }

    return months.map((m) => {
      const isCurrent = m === currMonth;
      return {
        key: `m_${m}`,
        label: `T${pad(m)}/${currYear}${isCurrent ? ` (Hiện tại - Q${currQuarter})` : ''}`,
        isCurrent,
        filterFn: (ts) => {
          const d = new Date(ts);
          return d.getFullYear() === currYear && d.getMonth() + 1 === m;
        },
      };
    });
  }

  if (range === 'year') {
    // Chỉ lấy các Quý đã hình thành trong năm nay (<= currQuarter), loại bỏ các quý tương lai chưa tới
    const quarters = [1, 2, 3, 4].filter((q) => q <= currQuarter);

    return quarters.map((q) => {
      const isCurrent = q === currQuarter;
      const months = q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
      return {
        key: `q${q}`,
        label: `Q${q}/${currYear}${isCurrent ? ' (Hiện tại)' : ''}`,
        isCurrent,
        filterFn: (ts) => {
          const d = new Date(ts);
          return d.getFullYear() === currYear && months.includes(d.getMonth() + 1);
        },
      };
    });
  }

  if (range === '3years') {
    // 3 năm đã hình thành đến nay, không lấy năm kế hoạch tương lai
    return [
      {
        key: 'y_prev2',
        label: `Năm ${currYear - 2}`,
        filterFn: (ts) => new Date(ts).getFullYear() === currYear - 2,
      },
      {
        key: 'y_prev1',
        label: `Năm ${currYear - 1}`,
        filterFn: (ts) => new Date(ts).getFullYear() === currYear - 1,
      },
      {
        key: 'y_curr',
        label: `Năm ${currYear} (Hiện tại)`,
        isCurrent: true,
        filterFn: (ts) => new Date(ts).getFullYear() === currYear,
      },
    ];
  }

  // 5years: 5 năm đã hình thành đến nay
  return [
    {
      key: 'y5_1',
      label: `Năm ${currYear - 4}`,
      filterFn: (ts) => new Date(ts).getFullYear() === currYear - 4,
    },
    {
      key: 'y5_2',
      label: `Năm ${currYear - 3}`,
      filterFn: (ts) => new Date(ts).getFullYear() === currYear - 3,
    },
    {
      key: 'y5_3',
      label: `Năm ${currYear - 2}`,
      filterFn: (ts) => new Date(ts).getFullYear() === currYear - 2,
    },
    {
      key: 'y5_4',
      label: `Năm ${currYear - 1}`,
      filterFn: (ts) => new Date(ts).getFullYear() === currYear - 1,
    },
    {
      key: 'y5_5',
      label: `Năm ${currYear} (Hiện tại)`,
      isCurrent: true,
      filterFn: (ts) => new Date(ts).getFullYear() === currYear,
    },
  ];
}

