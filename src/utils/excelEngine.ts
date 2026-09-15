import * as XLSX from 'xlsx';
import { Asset, AssetLevel, AssetType, Debt, DebtCategory, Goal, GoalGroup, DatabaseState } from '../types';

export interface ParsedAssetItem {
  id?: number;
  level: AssetLevel;
  type: AssetType;
  typeName: string;
  name: string;
  amount: number;
  costPrice?: number;
  rate?: number;
  startDate?: string;
  termMonths?: number;
  maturityDate?: string;
  quantity?: number;
  cashflow?: number;
  divCash?: number;
  note?: string;
}

export interface ParsedDebtItem {
  id?: number;
  category: DebtCategory;
  categoryName: string;
  name: string;
  frequency?: 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'flexible';
  startDate?: string;
  amount: number;
  paidPrincipal: number;
  termMonths?: number;
  promoRate?: number;
  normalRate?: number;
  promoMonths?: number;
  promoEndDate?: string;
  monthlyBefore: number;
  monthlyAfter: number;
  day?: number;
  status: 'Chưa tất toán' | 'Đã tất toán';
  note?: string;
}

export interface ParsedGoalItem {
  id?: number;
  group: GoalGroup;
  groupName: string;
  name: string;
  goalType: 'dca' | 'milestone';
  assetType?: 'stock' | 'gold' | 'saving' | 'cash' | 'other';
  freqMonths?: number;
  day?: number;
  targetQty?: number;
  targetAmountPerPeriod?: number;
  unit?: string;
  totalBought?: number;
  backlogQty?: number;
  target?: number;
  years?: number;
  status?: 'active' | 'completed' | 'pending';
  note?: string;
}

export interface ParsedFullDatabase {
  assets: ParsedAssetItem[];
  debts: ParsedDebtItem[];
  goals: ParsedGoalItem[];
  salaryIncome?: number;
  otherIncome?: number;
}

// Map internal AssetType to Vietnamese display name
export const getAssetTypeLabel = (type: AssetType): string => {
  switch (type) {
    case 'cash':
      return 'Tiền mặt & TK thanh toán';
    case 'saving':
      return 'Tiền gửi tiết kiệm';
    case 'gold':
      return 'Vàng vật chất';
    case 'realestate_live':
      return 'Bất động sản để ở';
    case 'realestate_rent':
      return 'Bất động sản cho thuê';
    case 'realestate_land':
      return 'Bất động sản đất nền';
    case 'stock':
      return 'Cổ phiếu niêm yết';
    case 'bond':
      return 'Trái phiếu doanh nghiệp';
    case 'crypto':
      return 'Tiền mã hóa (Crypto)';
    case 'private_equity':
      return 'Góp vốn kinh doanh';
    case 'peer_lending':
      return 'Cho vay P2P / Cho vay ngoài';
    default:
      return 'Tài sản khác';
  }
};

// Map layer string to internal AssetLevel
export const parseLevelString = (val: string): AssetLevel => {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('1') || s.includes('bảo vệ') || s.includes('bao ve') || s.includes('an toàn') || s.includes('phòng thủ')) {
    return '1';
  }
  if (s.includes('3') || s.includes('rủi ro') || s.includes('rui ro') || s.includes('mạo hiểm') || s.includes('đầu cơ')) {
    return '3';
  }
  return '2'; // Default to Tăng trưởng
};

// Map raw category string to internal AssetType
export const parseAssetTypeString = (val: string, level: AssetLevel): AssetType => {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('vàng') || s.includes('gold') || s.includes('sjc') || s.includes('nhẫn')) return 'gold';
  if (s.includes('tiết kiệm') || s.includes('saving') || s.includes('sổ') || s.includes('gửi')) return 'saving';
  if (s.includes('tiền mặt') || s.includes('cash') || s.includes('thanh toán') || s.includes('ngân hàng') || s.includes('tk')) return 'cash';
  if (s.includes('cổ phiếu') || s.includes('stock') || s.includes('chứng khoán') || s.includes('cp')) return 'stock';
  if (s.includes('trái phiếu') || s.includes('bond')) return 'bond';
  if (s.includes('cho thuê') || s.includes('dòng tiền')) return 'realestate_rent';
  if (s.includes('đất nền') || s.includes('đất') || s.includes('mb') || s.includes('lô')) return 'realestate_land';
  if (s.includes('bất động sản') || s.includes('bđs') || s.includes('nhà') || s.includes('căn hộ') || s.includes('cc') || s.includes('chung cư')) return 'realestate_live';
  if (s.includes('crypto') || s.includes('mã hóa') || s.includes('btc') || s.includes('eth') || s.includes('coin')) return 'crypto';
  if (s.includes('góp vốn') || s.includes('kinh doanh') || s.includes('doanh nghiệp')) return 'private_equity';
  if (s.includes('cho vay') || s.includes('lending') || s.includes('p2p')) return 'peer_lending';

  if (level === '1') return 'saving';
  if (level === '3') return 'crypto';
  return 'stock';
};

// Map Debt category string
export const parseDebtCategoryString = (val: string): DebtCategory => {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('1') || s.includes('có lãi') || s.includes('ngân hàng') || s.includes('thế chấp') || s.includes('bđs')) return 'type1';
  if (s.includes('2') || s.includes('trả góp') || s.includes('0%')) return 'type2';
  if (s.includes('3') || s.includes('người thân') || s.includes('tự do') || s.includes('mượn') || s.includes('bạn bè')) return 'type_free';
  if (s.includes('4') || s.includes('định kỳ') || s.includes('bảo hiểm') || s.includes('thuê nhà')) return 'type3';
  if (s.includes('5') || s.includes('sinh hoạt') || s.includes('chi tiêu') || s.includes('tiêu dùng')) return 'type4';
  return 'type1';
};

export const getDebtCategoryLabel = (cat: DebtCategory): string => {
  switch (cat) {
    case 'type1': return 'Loại 1: Vay có lãi';
    case 'type2': return 'Loại 2: Trả góp 0%';
    case 'type_free': return 'Loại 3: Mượn người thân 0%';
    case 'type3': return 'Loại 4: Chi phí định kỳ';
    case 'type4': return 'Loại 5: Chi tiêu sinh hoạt';
    default: return 'Khoản nợ';
  }
};

// Map Goal group string
export const parseGoalGroupString = (val: string): GoalGroup => {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('1') || s.includes('nợ') || s.includes('trả nợ') || s.includes('đòn bẩy')) return 'debt';
  if (s.includes('2') || s.includes('dca') || s.includes('tích sản')) return 'dca';
  if (s.includes('3') || s.includes('runway') || s.includes('dự phòng') || s.includes('khẩn cấp')) return 'runway';
  if (s.includes('4') || s.includes('cột mốc') || s.includes('bđs') || s.includes('nhà') || s.includes('đất')) return 'milestone';
  return 'dca';
};

export const getGoalGroupLabel = (group: GoalGroup): string => {
  switch (group) {
    case 'debt': return 'Nhóm 1: Trả nợ & giảm đòn bẩy';
    case 'dca': return 'Nhóm 2: Tích sản định kỳ (DCA)';
    case 'runway': return 'Nhóm 3: Dự phòng Runway';
    case 'milestone': return 'Nhóm 4: Cột mốc tài chính / BĐS';
    default: return 'Mục tiêu tài chính';
  }
};

// Parse ID helper: extracts numeric ID from "TS-1710123456", "NO-102", "1710123456", etc.
export const parseIdValue = (val: any): number | undefined => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return isNaN(val) || val <= 0 ? undefined : Math.round(val);
  const s = String(val).trim();
  if (!s) return undefined;
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return undefined;
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) || num <= 0 ? undefined : num;
};

// Safe number parser for Vietnamese currency and number formats (e.g. "500.000.000", "500,000,000", "500 tr", "5 tỷ")
export const parseAmountValue = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  if (!val) return 0;

  let s = String(val).trim().toLowerCase();

  // Handle shorthand words
  if (s.includes('tỷ') || s.includes('ty')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 1_000_000_000);
  }
  if (s.includes('tr') || s.includes('triệu') || s.includes('trieu')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 1_000_000);
  }

  s = s.replace(/đ|vnđ|vnd|đồng/gi, '').trim();

  // Detect decimal vs thousand separators
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  s = s.replace(/[^0-9.]/g, '');
  const res = parseFloat(s);
  return isNaN(res) ? 0 : Math.round(res);
};

// Safe percentage parser (supports "5.5%", "0.055", "5,5%", 5.5)
export const parseRateValue = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    if (val > 0 && val <= 1) {
      return Number((val * 100).toFixed(2));
    }
    return Number(val.toFixed(2));
  }
  let s = String(val).trim().replace(',', '.');
  if (s.includes('%')) {
    s = s.replace(/%/g, '').trim();
  }
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (num > 0 && num <= 1 && !String(val).includes('%')) {
    return Number((num * 100).toFixed(2));
  }
  return Number(num.toFixed(2));
};

// Safe quantity parser
export const parseQuantityValue = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  s = s.replace(/cp|cổ phiếu|lượng|chỉ|đơn vị|căn/gi, '').trim();
  return parseAmountValue(s);
};

// Safe date string parser - output standardized YYYY-MM-DD
export const parseDateValue = (val: any): string => {
  if (!val) return '';
  
  // Excel Serial Number (e.g. 45200)
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(val).trim();
  if (!s) return '';

  // Case 1: DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Case 2: YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Case 3: Standard JS Date parse fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2100) {
      return `${y}-${m}-${day}`;
    }
  }

  return s;
};

// Check if a row is a header row
const isHeaderRow = (row: any[]): boolean => {
  const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
  return (
    rowStr.includes('báo cáo danh mục') ||
    rowStr.includes('tổng giá trị') ||
    rowStr.includes('tổng nợ') ||
    rowStr.includes('hướng dẫn nhập') ||
    rowStr.includes('lưu ý:') ||
    rowStr.includes('chủ tài khoản') ||
    (rowStr.includes('tầng') && (rowStr.includes('giá trị') || rowStr.includes('tên') || rowStr.includes('phân loại'))) ||
    (rowStr.includes('phân loại') && (rowStr.includes('nợ') || rowStr.includes('tên'))) ||
    (rowStr.includes('nhóm') && rowStr.includes('mục tiêu')) ||
    rowStr.includes('[phần 1') ||
    rowStr.includes('[phần 2')
  );
};

// Check if a row is a summary row
const isSummaryRow = (row: any[]): boolean => {
  const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
  return (
    rowStr.includes('tổng cộng') ||
    rowStr.includes('tong cong') ||
    rowStr.includes('tổng nợ') ||
    rowStr.includes('tong no') ||
    rowStr.includes('đã tính toán tự động') ||
    rowStr.includes('tính toán tự động')
  );
};

// Helper to format currency number
const formatCurrency = (val: number) => {
  return val.toLocaleString('vi-VN') + ' đ';
};

// =========================================================================
// 1. TẢI FILE EXCEL MẪU CHUẨN (TOP SUMMARY + BỘ LỌC + NHẬP VÔ TẬN Ở DƯỚI)
// =========================================================================
export const downloadStandardExcelTemplate = () => {
  const wb = XLSX.utils.book_new();

  // SHEET 1: 1_Tai_San
  const ws1Data: any[][] = [
    ['BÁO CÁO DANH MỤC THÁP TÀI SẢN 3 TẦNG (FILE MẪU CHUẨN)'],
    ['[TỔNG HỢP]: Tổng Giá Trị = 5.290.000.000 đ | Tổng Vốn Ban Đầu = 4.490.000.000 đ | Số Lượng Mục = 7 | App tự động tính toán'],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Giữ nguyên Mã ID khi sửa dòng cũ. Để trống Mã ID khi thêm mới. Ngày tháng định dạng YYYY-MM-DD hoặc DD/MM/YYYY.'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Tầng Tháp (*)',
      'Phân Loại Tài Sản (*)',
      'Tên Tài Sản / Danh Mục (*)',
      'Giá Trị Hiện Tại (VNĐ) (*)',
      'Giá Vốn Ban Đầu (VNĐ) (*)',
      'Lãi Suất (%/năm)',
      'Ngày Bắt Đầu / Mua',
      'Kỳ Hạn (Tháng)',
      'Ngày Đáo Hạn',
      'Số Lượng',
      'Dòng Tiền Thu Về (VNĐ/tháng)',
      'Cổ Tức (VNĐ/CP/năm)',
      'Ghi Chú / Kỳ Vọng',
    ],
    ['TS-101', 1, 'Tầng 1: Bảo vệ', 'Tiền gửi tiết kiệm', 'Sổ tiết kiệm Vietcombank 12T', 300000000, 300000000, 0.055, '2025-06-15', 12, '2026-06-15', 1, 0, 0, 'Lãi suất 5.5%/năm, kỳ hạn 12 tháng'],
    ['TS-102', 2, 'Tầng 1: Bảo vệ', 'Tiền mặt & TK thanh toán', 'Tài khoản Techcombank (Quỹ khẩn cấp)', 50000000, 50000000, 0, '2025-01-01', 0, '', 1, 0, 0, 'Dự phòng sinh hoạt 6 tháng'],
    ['TS-103', 3, 'Tầng 1: Bảo vệ', 'Vàng vật chất', 'Vàng miếng SJC 9999', 170000000, 150000000, 0.12, '2024-08-10', 0, '', 2, 0, 0, '2 lượng vàng tích trữ phòng vệ lạm phát'],
    ['TS-104', 4, 'Tầng 2: Tăng trưởng', 'Cổ phiếu niêm yết', 'Cổ phiếu FPT Technology', 650000000, 500000000, 0.18, '2024-03-15', 0, '', 5000, 0, 2000, '5.000 CP, cổ tức 2.000 đ/CP/năm'],
    ['TS-105', 5, 'Tầng 2: Tăng trưởng', 'Bất động sản cho thuê', 'Căn hộ chung cư Vinhomes', 3800000000, 3200000000, 0.056, '2023-11-20', 0, '', 1, 18000000, 0, 'Cho thuê 18 triệu/tháng, tỷ suất 5.6%/năm'],
    ['TS-106', 6, 'Tầng 2: Tăng trưởng', 'Trái phiếu doanh nghiệp', 'Trái phiếu Masan Group', 200000000, 200000000, 0.092, '2024-05-10', 24, '2026-05-10', 200, 0, 0, 'Trái phiếu kỳ hạn 2 năm lãi 9.2%/năm'],
    ['TS-107', 7, 'Tầng 3: Rủi ro', 'Tiền mã hóa (Crypto)', 'Bitcoin (BTC) & Ethereum (ETH)', 120000000, 90000000, 0.25, '2024-10-01', 0, '', 1, 0, 0, 'Danh mục mạo hiểm chu kỳ mới'],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  ws1['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 22 }, // Tầng Tháp (*)
    { wch: 28 }, // Phân Loại Tài Sản (*)
    { wch: 38 }, // Tên Tài Sản (*)
    { wch: 26 }, // Giá Trị Hiện Tại (*)
    { wch: 26 }, // Giá Vốn (*)
    { wch: 22 }, // Lãi Suất %
    { wch: 20 }, // Ngày Bắt Đầu
    { wch: 16 }, // Kỳ Hạn
    { wch: 18 }, // Ngày Đáo Hạn
    { wch: 14 }, // Số Lượng
    { wch: 28 }, // Dòng Tiền
    { wch: 26 }, // Cổ Tức
    { wch: 45 }, // Ghi Chú
  ];
  // AutoFilter on row 4
  ws1['!autofilter'] = { ref: 'A4:O4' };

  for (let r = 4; r < ws1Data.length; r++) {
    const cE = ws1[XLSX.utils.encode_cell({ r, c: 5 })];
    if (cE) cE.z = '#,##0';
    const cF = ws1[XLSX.utils.encode_cell({ r, c: 6 })];
    if (cF) cF.z = '#,##0';
    const cG = ws1[XLSX.utils.encode_cell({ r, c: 7 })];
    if (cG) cG.z = '0.0%';
  }
  XLSX.utils.book_append_sheet(wb, ws1, '1_Tai_San');

  // SHEET 2: 2_Dong_Tien_Va_No
  const ws2Data: any[][] = [
    ['THU NHẬP DÒNG TIỀN VÀ NGHĨA VỤ NỢ (FILE MẪU CHUẨN)'],
    ['[TỔNG HỢP]: Tổng Nợ Gốc = 1.436.000.000 đ | Lương = 35.000.000 đ/tháng | Thu nhập khác = 15.000.000 đ/tháng | Tổng nợ: 5 khoản'],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Điền thu nhập ở phần 1, các khoản nợ ở phần 2. Giữ nguyên Mã ID khi sửa nợ cũ.'],
    ['[PHẦN 1: THU NHẬP HÀNG THÁNG]'],
    ['Khoản Thu Nhập (*)', 'Số Tiền (VNĐ/tháng) (*)', 'Ghi Chú'],
    ['Lương chủ động hằng tháng', 35000000, 'Thu nhập chính sau thuế'],
    ['Thu nhập thụ động / ngoài khác', 15000000, 'Dòng tiền cho thuê + freelance'],
    [],
    ['[PHẦN 2: DANH SÁCH CÁC KHOẢN NỢ & CHI PHÍ ĐỊNH KỲ]'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Phân Loại Khoản Nợ (*)',
      'Tên Khoản Nợ / Chi Phí (*)',
      'Ngày Vay / Bắt Đầu',
      'Tổng Nợ Gốc (VNĐ) (*)',
      'Đã Trả Gốc (VNĐ)',
      'Kỳ Hạn Vay (Tháng)',
      'Kỳ Chi Trả (*)',
      'Tiền Trả Hàng Tháng / Trong Ưu Đãi (VNĐ) (*)',
      'Lãi Suất Ưu Đãi (%/năm)',
      'Thời Hạn Ưu Đãi (Tháng)',
      'Ngày Hết Ưu Đãi Lãi',
      'Lãi Suất Sau Ưu Đãi (%/năm)',
      'Tiền Trả Sau Ưu Đãi (VNĐ)',
      'Ngày Trả Hàng Tháng (1-31)',
      'Trạng Thái',
      'Ghi Chú',
    ],
    ['NO-201', 1, 'Loại 1: Vay có lãi', 'Vay mua nhà BIDV', '2024-03-15', 1200000000, 200000000, 120, 'Hàng tháng', 15500000, 0.065, 24, '2026-03-15', 0.105, 19800000, 15, 'Chưa tất toán', 'Cố định 2 năm đầu 6.5%'],
    ['NO-202', 2, 'Loại 2: Trả góp 0%', 'Trả góp Laptop Macbook', '2025-01-10', 36000000, 18000000, 12, 'Hàng tháng', 3000000, 0, 0, '', 0, 3000000, 20, 'Chưa tất toán', 'Trả góp 0% qua thẻ tín dụng'],
    ['NO-203', 3, 'Loại 3: Mượn người thân 0%', 'Vay người thân mua đất', '2024-06-01', 200000000, 50000000, 24, 'Linh hoạt', 0, 0, 0, '', 0, 0, 1, 'Chưa tất toán', 'Mượn 0% không tính lãi'],
    ['NO-204', 4, 'Loại 4: Chi phí định kỳ', 'Bảo hiểm nhân thọ Dai-ichi', '2023-08-01', 0, 0, 12, 'Hàng tháng', 2500000, 0, 0, '', 0, 2500000, 10, 'Chưa tất toán', 'Đóng định kỳ bảo vệ gia đình'],
    ['NO-205', 5, 'Loại 5: Chi tiêu sinh hoạt', 'Chi tiêu sinh hoạt gia đình', '2025-01-01', 0, 0, 1, 'Hàng tháng', 16000000, 0, 0, '', 0, 16000000, 1, 'Chưa tất toán', 'Ngân sách sinh hoạt tối thiểu'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 28 }, // Phân Loại (*)
    { wch: 34 }, // Tên Khoản Nợ (*)
    { wch: 20 }, // Ngày Vay
    { wch: 24 }, // Tổng Nợ Gốc (*)
    { wch: 20 }, // Đã Trả Gốc
    { wch: 18 }, // Kỳ Hạn
    { wch: 18 }, // Kỳ Chi Trả (*)
    { wch: 30 }, // Tiền Trả Trong Ưu Đãi (*)
    { wch: 22 }, // Lãi Suất Ưu Đãi
    { wch: 22 }, // Thời Hạn Ưu Đãi
    { wch: 20 }, // Ngày Hết Ưu Đãi
    { wch: 24 }, // Lãi Suất Thả Nổi
    { wch: 28 }, // Tiền Trả Sau Ưu Đãi
    { wch: 24 }, // Ngày Trả
    { wch: 16 }, // Trạng Thái
    { wch: 40 }, // Ghi Chú
  ];
  ws2['!autofilter'] = { ref: 'A10:R10' };
  XLSX.utils.book_append_sheet(wb, ws2, '2_Dong_Tien_Va_No');

  // SHEET 3: 3_Muc_Tieu
  const ws3Data: any[][] = [
    ['KẾ HOẠCH MỤC TIÊU TÀI CHÍNH 4 NHÓM (FILE MẪU CHUẨN)'],
    ['[TỔNG HỢP]: Tổng số 4 mục tiêu | Tích sản DCA & Cột mốc tích lũy tài chính lớn | App tự động tính toán'],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Giữ nguyên Mã ID khi sửa mục tiêu cũ. Để trống Mã ID khi thêm mới.'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Nhóm Mục Tiêu (*)',
      'Tên Mục Tiêu (*)',
      'Loại Mục Tiêu (*)',
      'Kênh Tài Sản',
      'Chu Kỳ Gom (Tháng)',
      'Ngày Chốt Mua Trong Tháng',
      'Định Mức SL Mỗi Kỳ',
      'Đơn Vị',
      'Tiền Nạp Mỗi Kỳ (VNĐ)',
      'Đã Tích Lũy Đến Nay',
      'Nợ Chỉ Tiêu Chưa Mua',
      'Tổng Tiền Mục Tiêu (VNĐ)',
      'Thời Hạn (Năm)',
      'Trạng Thái',
      'Ghi Chú / Chiến Lược',
    ],
    ['MT-301', 1, 'Nhóm 2: Tích sản định kỳ (DCA)', 'Tích sản cổ phiếu FPT', 'DCA', 'Cổ phiếu', 1, 20, 200, 'CP', 0, 1500, 0, 0, 3, 'active', 'Mua định kỳ 200 CP ngày 20 hằng tháng'],
    ['MT-302', 2, 'Nhóm 2: Tích sản định kỳ (DCA)', 'Tích sản Vàng nhẫn 9999', 'DCA', 'Vàng', 1, 25, 1, 'Chỉ', 0, 8, 0, 0, 2, 'active', 'Mua tích trữ mỗi tháng 1 chỉ'],
    ['MT-303', 3, 'Nhóm 3: Dự phòng Runway', 'Quỹ khẩn cấp 6 tháng', 'Cột mốc', 'Tiền mặt', 1, 1, 0, 'VNĐ', 5000000, 50000000, 0, 120000000, 1, 'active', 'Quỹ dự phòng an toàn'],
    ['MT-304', 4, 'Nhóm 4: Cột mốc tài chính / BĐS', 'Mua đất nền ven đô', 'Cột mốc', 'Khác', 3, 15, 0, 'VNĐ', 30000000, 300000000, 0, 1500000000, 4, 'active', 'Tích lũy vốn tự có chuẩn bị đầu tư'],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
  ws3['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 32 }, // Nhóm Mục Tiêu (*)
    { wch: 34 }, // Tên Mục Tiêu (*)
    { wch: 18 }, // Loại Mục Tiêu (*)
    { wch: 20 }, // Kênh Tài Sản
    { wch: 18 }, // Chu Kỳ Gom
    { wch: 26 }, // Ngày Chốt Mua
    { wch: 22 }, // Định Mức SL
    { wch: 12 }, // Đơn Vị
    { wch: 24 }, // Tiền Nạp Mỗi Kỳ
    { wch: 22 }, // Đã Tích Lũy
    { wch: 22 }, // Nợ Chỉ Tiêu
    { wch: 26 }, // Tổng Tiền Mục Tiêu
    { wch: 16 }, // Thời Hạn
    { wch: 16 }, // Trạng Thái
    { wch: 45 }, // Ghi Chú
  ];
  ws3['!autofilter'] = { ref: 'A4:Q4' };
  XLSX.utils.book_append_sheet(wb, ws3, '3_Muc_Tieu');

  XLSX.writeFile(wb, 'Mau_Nhap_Thap_Tai_San_Chuan.xlsx');
};

// =========================================================================
// 2. XUẤT TOÀN BỘ CƠ SỞ DỮ LIỆU RA EXCEL (TOP SUMMARY + BỘ LỌC + DỮ LIỆU VÔ TẬN)
// =========================================================================
export const exportFullDatabaseToExcel = (db: DatabaseState, accountName?: string) => {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toLocaleDateString('vi-VN');

  // SHEET 1: TÀI SẢN
  const totalAssetValue = db.assets.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalCostPrice = db.assets.reduce((sum, a) => sum + (Number(a.costPrice || a.amount) || 0), 0);

  const rows1: any[][] = [
    ['BÁO CÁO DANH MỤC THÁP TÀI SẢN 3 TẦNG'],
    [`[TỔNG HỢP]: Tổng Giá Trị = ${formatCurrency(totalAssetValue)} | Tổng Giá Vốn = ${formatCurrency(totalCostPrice)} | Tổng Số Mục = ${db.assets.length} | Chủ TK: ${accountName || 'Cá nhân'} | Ngày: ${dateStr}`],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Giữ nguyên Mã ID khi sửa dòng cũ. Để trống Mã ID khi thêm mới. Phía dưới có thể nhập vô tận mà không bị vướng tổng.'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Tầng Tháp (*)',
      'Phân Loại Tài Sản (*)',
      'Tên Tài Sản / Danh Mục (*)',
      'Giá Trị Hiện Tại (VNĐ) (*)',
      'Giá Vốn Ban Đầu (VNĐ) (*)',
      'Lãi Suất (%/năm)',
      'Ngày Bắt Đầu / Mua',
      'Kỳ Hạn (Tháng)',
      'Ngày Đáo Hạn',
      'Số Lượng',
      'Dòng Tiền Thu Về (VNĐ/tháng)',
      'Cổ Tức (VNĐ/CP/năm)',
      'Ghi Chú / Kỳ Vọng',
    ],
  ];

  const sortedAssets = [...db.assets].sort((a, b) => {
    if (a.level !== b.level) return a.level.localeCompare(b.level);
    return (b.amount || 0) - (a.amount || 0);
  });

  sortedAssets.forEach((item, idx) => {
    const levelLabel =
      item.level === '1'
        ? 'Tầng 1: Bảo vệ'
        : item.level === '2'
        ? 'Tầng 2: Tăng trưởng'
        : 'Tầng 3: Rủi ro';

    rows1.push([
      `TS-${item.id}`,
      idx + 1,
      levelLabel,
      getAssetTypeLabel(item.type),
      item.name,
      item.amount || 0,
      item.costPrice || item.amount || 0,
      item.rate ? item.rate / 100 : 0,
      item.startDate || '',
      item.termMonths || 0,
      item.maturityDate || '',
      item.quantity || 1,
      item.cashflow || 0,
      item.divCash || 0,
      item.note || (item.updatedAt ? `Cập nhật: ${item.updatedAt}` : ''),
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 22 }, // Tầng Tháp (*)
    { wch: 28 }, // Phân Loại (*)
    { wch: 38 }, // Tên Tài Sản (*)
    { wch: 26 }, // Giá Trị Hiện Tại (*)
    { wch: 26 }, // Giá Vốn (*)
    { wch: 22 }, // Lãi Suất %
    { wch: 20 }, // Ngày Bắt Đầu
    { wch: 16 }, // Kỳ Hạn
    { wch: 18 }, // Ngày Đáo Hạn
    { wch: 14 }, // Số Lượng
    { wch: 28 }, // Dòng Tiền
    { wch: 26 }, // Cổ Tức
    { wch: 40 }, // Ghi Chú
  ];
  // AutoFilter on row 4
  ws1['!autofilter'] = { ref: `A4:O4` };

  for (let r = 4; r < rows1.length; r++) {
    const cE = ws1[XLSX.utils.encode_cell({ r, c: 5 })];
    if (cE) cE.z = '#,##0';
    const cF = ws1[XLSX.utils.encode_cell({ r, c: 6 })];
    if (cF) cF.z = '#,##0';
    const cG = ws1[XLSX.utils.encode_cell({ r, c: 7 })];
    if (cG) cG.z = '0.0%';
    const cL = ws1[XLSX.utils.encode_cell({ r, c: 11 })];
    if (cL) cL.z = '#,##0';
    const cM = ws1[XLSX.utils.encode_cell({ r, c: 12 })];
    if (cM) cM.z = '#,##0';
    const cN = ws1[XLSX.utils.encode_cell({ r, c: 13 })];
    if (cN) cN.z = '#,##0';
  }

  XLSX.utils.book_append_sheet(wb, ws1, '1_Tai_San');

  // SHEET 2: DÒNG TIỀN VÀ NỢ
  const totalDebtAmount = db.debts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalMonthlyDebt = db.debts.reduce((sum, d) => sum + (Number(d.monthlyBefore) || 0), 0);

  const rows2: any[][] = [
    ['BÁO CÁO DÒNG TIỀN VÀ NGHĨA VỤ NỢ'],
    [`[TỔNG HỢP]: Tổng Nợ Gốc = ${formatCurrency(totalDebtAmount)} | Tổng Trả/Tháng = ${formatCurrency(totalMonthlyDebt)} | Lương = ${formatCurrency(db.salaryIncome || 0)} | Thu Nhập Khác = ${formatCurrency(db.otherIncome || 0)} | Số Khoản = ${db.debts.length}`],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Điền thu nhập ở phần 1, các khoản nợ ở phần 2. Giữ nguyên Mã ID khi sửa nợ cũ.'],
    ['[PHẦN 1: THU NHẬP HÀNG THÁNG]'],
    ['Khoản Thu Nhập (*)', 'Số Tiền (VNĐ/tháng) (*)', 'Ghi Chú'],
    ['Lương chủ động hằng tháng', db.salaryIncome || 0, 'Thu nhập chính sau thuế'],
    ['Thu nhập thụ động / ngoài khác', db.otherIncome || 0, 'Dòng tiền kinh doanh, cho thuê, freelance'],
    [],
    ['[PHẦN 2: DANH SÁCH CÁC KHOẢN NỢ & CHI PHÍ ĐỊNH KỲ]'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Phân Loại Khoản Nợ (*)',
      'Tên Khoản Nợ / Chi Phí (*)',
      'Ngày Vay / Bắt Đầu',
      'Tổng Nợ Gốc (VNĐ) (*)',
      'Đã Trả Gốc (VNĐ)',
      'Kỳ Hạn Vay (Tháng)',
      'Kỳ Chi Trả (*)',
      'Tiền Trả Hàng Tháng / Trong Ưu Đãi (VNĐ) (*)',
      'Lãi Suất Ưu Đãi (%/năm)',
      'Thời Hạn Ưu Đãi (Tháng)',
      'Ngày Hết Ưu Đãi Lãi',
      'Lãi Suất Sau Ưu Đãi (%/năm)',
      'Tiền Trả Sau Ưu Đãi (VNĐ)',
      'Ngày Trả Hàng Tháng (1-31)',
      'Trạng Thái',
      'Ghi Chú',
    ],
  ];

  db.debts.forEach((item, idx) => {
    const freqName =
      item.frequency === 'quarterly'
        ? 'Hàng quý'
        : item.frequency === 'biannual'
        ? '6 tháng'
        : item.frequency === 'annual'
        ? 'Hàng năm'
        : item.frequency === 'flexible'
        ? 'Linh hoạt'
        : 'Hàng tháng';

    rows2.push([
      `NO-${item.id}`,
      idx + 1,
      getDebtCategoryLabel(item.category),
      item.name,
      item.startDate || '',
      item.amount || 0,
      item.paidPrincipal || 0,
      item.termMonths || 0,
      freqName,
      item.monthlyBefore || 0,
      item.promoRate ? item.promoRate / 100 : 0,
      item.promoMonths || 0,
      item.promoEndDate || '',
      item.normalRate ? item.normalRate / 100 : 0,
      item.monthlyAfter || item.monthlyBefore || 0,
      item.day || 1,
      item.status || 'Chưa tất toán',
      item.note || '',
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 28 }, // Phân Loại (*)
    { wch: 34 }, // Tên Khoản Nợ (*)
    { wch: 20 }, // Ngày Vay
    { wch: 24 }, // Tổng Nợ Gốc (*)
    { wch: 20 }, // Đã Trả Gốc
    { wch: 18 }, // Kỳ Hạn Vay
    { wch: 18 }, // Kỳ Chi Trả (*)
    { wch: 30 }, // Tiền Trả Trong Ưu Đãi (*)
    { wch: 22 }, // Lãi Suất Ưu Đãi
    { wch: 22 }, // Thời Hạn Ưu Đãi
    { wch: 20 }, // Ngày Hết Ưu Đãi
    { wch: 24 }, // Lãi Suất Thả Nổi
    { wch: 28 }, // Tiền Trả Sau Ưu Đãi
    { wch: 24 }, // Ngày Trả
    { wch: 16 }, // Trạng Thái
    { wch: 40 }, // Ghi Chú
  ];
  ws2['!autofilter'] = { ref: 'A10:R10' };

  XLSX.utils.book_append_sheet(wb, ws2, '2_Dong_Tien_Va_No');

  // SHEET 3: MỤC TIÊU TÀI CHÍNH
  const rows3: any[][] = [
    ['BÁO CÁO MỤC TIÊU TÀI CHÍNH 4 NHÓM'],
    [`[TỔNG HỢP]: Tổng Số Mục Tiêu = ${db.goals.length} | Tích sản DCA & Cột mốc tích lũy tài chính lớn | Chủ TK: ${accountName || 'Cá nhân'} | Ngày: ${dateStr}`],
    ['* HƯỚNG DẪN: Cột có (*) là BẮT BUỘC. Giữ nguyên Mã ID khi sửa mục tiêu cũ. Để trống Mã ID khi thêm mới.'],
    [
      'Mã ID (Trống=Thêm mới)',
      'STT',
      'Nhóm Mục Tiêu (*)',
      'Tên Mục Tiêu (*)',
      'Loại Mục Tiêu (*)',
      'Kênh Tài Sản',
      'Chu Kỳ Gom (Tháng)',
      'Ngày Chốt Mua Trong Tháng',
      'Định Mức SL Mỗi Kỳ',
      'Đơn Vị',
      'Tiền Nạp Mỗi Kỳ (VNĐ)',
      'Đã Tích Lũy Đến Nay',
      'Nợ Chỉ Tiêu Chưa Mua',
      'Tổng Tiền Mục Tiêu (VNĐ)',
      'Thời Hạn (Năm)',
      'Trạng Thái',
      'Ghi Chú / Chiến Lược',
    ],
  ];

  db.goals.forEach((item, idx) => {
    const assetTypeName =
      item.assetType === 'stock'
        ? 'Cổ phiếu'
        : item.assetType === 'gold'
        ? 'Vàng'
        : item.assetType === 'saving'
        ? 'Tiết kiệm'
        : item.assetType === 'cash'
        ? 'Tiền mặt'
        : 'Khác';

    rows3.push([
      `MT-${item.id}`,
      idx + 1,
      getGoalGroupLabel(item.group),
      item.name,
      item.goalType === 'dca' ? 'DCA tích sản' : 'Cột mốc tích lũy',
      assetTypeName,
      item.freqMonths || 1,
      item.day || 1,
      item.targetQty || 0,
      item.unit || 'VNĐ',
      item.targetAmountPerPeriod || 0,
      item.totalBought || 0,
      item.backlogQty || 0,
      item.target || 0,
      item.years || 1,
      item.status || 'active',
      item.note || '',
    ]);
  });

  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3['!cols'] = [
    { wch: 22 }, // Mã ID
    { wch: 8 },  // STT
    { wch: 32 }, // Nhóm Mục Tiêu (*)
    { wch: 34 }, // Tên Mục Tiêu (*)
    { wch: 18 }, // Loại Mục Tiêu (*)
    { wch: 20 }, // Kênh Tài Sản
    { wch: 18 }, // Chu Kỳ Gom
    { wch: 26 }, // Ngày Chốt Mua
    { wch: 22 }, // Định Mức SL
    { wch: 12 }, // Đơn Vị
    { wch: 24 }, // Tiền Nạp Mỗi Kỳ
    { wch: 22 }, // Đã Tích Lũy
    { wch: 22 }, // Nợ Chỉ Tiêu
    { wch: 26 }, // Tổng Tiền Mục Tiêu
    { wch: 16 }, // Thời Hạn
    { wch: 16 }, // Trạng Thái
    { wch: 45 }, // Ghi Chú
  ];
  ws3['!autofilter'] = { ref: 'A4:Q4' };

  XLSX.utils.book_append_sheet(wb, ws3, '3_Muc_Tieu');

  const safeName = (accountName || 'User').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Bao_Cao_Thap_Tai_San_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

export const exportAssetsToExcel = (assetsOrDb: Asset[] | DatabaseState, accountName?: string) => {
  if ('assets' in (assetsOrDb as any) && 'debts' in (assetsOrDb as any)) {
    exportFullDatabaseToExcel(assetsOrDb as DatabaseState, accountName);
  } else {
    const miniDb: DatabaseState = {
      assets: assetsOrDb as Asset[],
      debts: [],
      goals: [],
      history: [],
      salaryIncome: 0,
      otherIncome: 0,
      lastUpdate: '',
    };
    exportFullDatabaseToExcel(miniDb, accountName);
  }
};

// =========================================================================
// 3. PARSER THÔNG MINH (LIÊN THÔNG GIÁ TRỊ - GIÁ VỐN & ĐỒNG BỘ MÃ ID)
// =========================================================================

// Parse Sheet 1: Assets
export const parseRawRowsToAssets = (rawRows: any[][]): ParsedAssetItem[] => {
  const results: ParsedAssetItem[] = [];

  // 1. Detect header row & column index mapping
  const colMap: Record<string, number> = {};
  let headerFound = false;

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('tầng') && (rowStr.includes('giá trị') || rowStr.includes('tên') || rowStr.includes('phân loại') || rowStr.includes('mã'))) {
      row.forEach((cell, idx) => {
        const lower = String(cell || '').toLowerCase().trim();
        if (lower.includes('mã id') || lower === 'id' || lower.includes('trống=thêm')) colMap.id = idx;
        else if (lower === 'stt' || lower === 'tt') colMap.stt = idx;
        else if (lower.includes('tầng') || lower.includes('tháp')) colMap.level = idx;
        else if (lower.includes('phân loại') || (lower.includes('mã') && !lower.includes('id'))) colMap.type = idx;
        else if (lower.includes('tên')) colMap.name = idx;
        else if (lower.includes('hiện tại') || lower.includes('giá trị')) colMap.amount = idx;
        else if (lower.includes('vốn') || lower.includes('ban đầu')) colMap.costPrice = idx;
        else if (lower.includes('lãi')) colMap.rate = idx;
        else if (lower.includes('bắt đầu') || lower.includes('ngày gửi') || lower.includes('ngày mua')) colMap.startDate = idx;
        else if (lower.includes('kỳ hạn')) colMap.termMonths = idx;
        else if (lower.includes('đáo hạn')) colMap.maturityDate = idx;
        else if (lower.includes('số lượng') || lower === 'sl') colMap.quantity = idx;
        else if (lower.includes('dòng tiền')) colMap.cashflow = idx;
        else if (lower.includes('cổ tức')) colMap.divCash = idx;
        else if (lower.includes('ghi chú')) colMap.note = idx;
      });
      headerFound = true;
      break;
    }
  }

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;
    if (isHeaderRow(row) || isSummaryRow(row)) continue;

    let colId: any = undefined;
    let colLevel = '';
    let colType = '';
    let colName = '';
    let colAmount: any = 0;
    let colCostPrice: any = 0;
    let colRate: any = 0;
    let colStartDate = '';
    let colTerm: any = 0;
    let colMaturityDate = '';
    let colQty: any = 1;
    let colCashflow: any = 0;
    let colDivCash: any = 0;
    let colNote = '';

    if (headerFound && (colMap.name !== undefined || colMap.amount !== undefined || colMap.costPrice !== undefined)) {
      colId = colMap.id !== undefined ? row[colMap.id] : undefined;
      colLevel = colMap.level !== undefined ? String(row[colMap.level] || '') : '';
      colType = colMap.type !== undefined ? String(row[colMap.type] || '') : '';
      colName = colMap.name !== undefined ? String(row[colMap.name] || '') : '';
      colAmount = colMap.amount !== undefined ? row[colMap.amount] : 0;
      colCostPrice = colMap.costPrice !== undefined ? row[colMap.costPrice] : 0;
      colRate = colMap.rate !== undefined ? row[colMap.rate] : 0;
      colStartDate = colMap.startDate !== undefined ? String(row[colMap.startDate] || '') : '';
      colTerm = colMap.termMonths !== undefined ? row[colMap.termMonths] : 0;
      colMaturityDate = colMap.maturityDate !== undefined ? String(row[colMap.maturityDate] || '') : '';
      colQty = colMap.quantity !== undefined ? row[colMap.quantity] : 1;
      colCashflow = colMap.cashflow !== undefined ? row[colMap.cashflow] : 0;
      colDivCash = colMap.divCash !== undefined ? row[colMap.divCash] : 0;
      colNote = colMap.note !== undefined ? String(row[colMap.note] || '') : '';
    } else {
      // Positional parsing fallback
      let cleanRow = [...row];
      // Check if col 0 is ID (e.g. "TS-123")
      if (String(cleanRow[0] || '').toLowerCase().startsWith('ts-') || (typeof cleanRow[0] === 'string' && /^ts-\d+/i.test(cleanRow[0]))) {
        colId = cleanRow.shift();
      }
      // Check if next col is STT
      if (typeof cleanRow[0] === 'number' && cleanRow.length >= 4) {
        cleanRow.shift();
      } else if (/^\d+$/.test(String(cleanRow[0]).trim()) && cleanRow.length >= 4 && String(cleanRow[0]).trim().length <= 3) {
        cleanRow.shift();
      }

      if (cleanRow.length >= 12) {
        colLevel = String(cleanRow[0] || '');
        colType = String(cleanRow[1] || '');
        colName = String(cleanRow[2] || '');
        colAmount = cleanRow[3];
        colCostPrice = cleanRow[4];
        colRate = cleanRow[5];
        colStartDate = String(cleanRow[6] || '');
        colTerm = cleanRow[7];
        colMaturityDate = String(cleanRow[8] || '');
        colQty = cleanRow[9];
        colCashflow = cleanRow[10];
        colDivCash = cleanRow[11];
        colNote = String(cleanRow[12] || '');
      } else if (cleanRow.length >= 4) {
        colLevel = String(cleanRow[0] || '');
        colType = String(cleanRow[1] || '');
        colName = String(cleanRow[2] || '');
        colAmount = cleanRow[3];
        colCostPrice = cleanRow[4];
        colNote = String(cleanRow[5] || '');
      } else if (cleanRow.length >= 2) {
        colName = String(cleanRow[0] || '');
        colAmount = cleanRow[1];
      }
    }

    const cleanName = colName.trim();
    let rawAmountNum = parseAmountValue(colAmount);
    let rawCostPriceNum = parseAmountValue(colCostPrice);

    // KEY IMPROVEMENT: Smart Fallback between Current Value and Cost Price
    if (rawAmountNum === 0 && rawCostPriceNum > 0) {
      rawAmountNum = rawCostPriceNum;
    } else if (rawCostPriceNum === 0 && rawAmountNum > 0) {
      rawCostPriceNum = rawAmountNum;
    }

    if (!cleanName && rawAmountNum <= 0) continue;
    if (cleanName.toLowerCase().includes('tổng cộng') || cleanName.toLowerCase().includes('tong cong')) continue;

    const parsedId = parseIdValue(colId);
    const level = parseLevelString(colLevel || colType || cleanName);
    const assetType = parseAssetTypeString(colType || colName, level);

    const rateNum = colRate ? parseRateValue(colRate) : 0;
    const qtyNum = colQty ? parseQuantityValue(colQty) : 1;
    const cashflowNum = colCashflow ? parseAmountValue(colCashflow) : 0;
    const divCashNum = colDivCash ? parseAmountValue(colDivCash) : 0;
    const termNum = colTerm ? parseInt(String(colTerm), 10) : undefined;
    const startDateVal = parseDateValue(colStartDate);
    const maturityVal = parseDateValue(colMaturityDate);

    results.push({
      id: parsedId,
      level,
      type: assetType,
      typeName: getAssetTypeLabel(assetType),
      name: cleanName || `Tài sản ${results.length + 1}`,
      amount: rawAmountNum,
      costPrice: rawCostPriceNum,
      rate: rateNum > 0 ? rateNum : undefined,
      startDate: startDateVal || undefined,
      termMonths: termNum && termNum > 0 ? termNum : undefined,
      maturityDate: maturityVal || undefined,
      quantity: qtyNum > 0 ? qtyNum : undefined,
      cashflow: cashflowNum > 0 ? cashflowNum : undefined,
      divCash: divCashNum > 0 ? divCashNum : undefined,
      note: colNote.trim() || undefined,
    });
  }

  return results;
};

// Parse Sheet 2: Debts & Cashflow
export const parseRawRowsToDebtsAndIncome = (rawRows: any[][]): { debts: ParsedDebtItem[]; salaryIncome: number; otherIncome: number } => {
  const debts: ParsedDebtItem[] = [];
  let salaryIncome = 0;
  let otherIncome = 0;

  const colMap: Record<string, number> = {};
  let headerFound = false;

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('phân loại') && (rowStr.includes('nợ') || rowStr.includes('tên') || rowStr.includes('mã'))) {
      row.forEach((cell, idx) => {
        const lower = String(cell || '').toLowerCase().trim();
        if (lower.includes('mã id') || lower === 'id' || lower.includes('trống=thêm')) colMap.id = idx;
        else if (lower === 'stt' || lower === 'tt') colMap.stt = idx;
        else if (lower.includes('phân loại')) colMap.category = idx;
        else if (lower.includes('tên')) colMap.name = idx;
        else if (lower.includes('ngày vay') || lower.includes('bắt đầu') || lower.includes('giải ngân')) colMap.startDate = idx;
        else if (lower.includes('tổng nợ') || lower.includes('nợ gốc')) colMap.amount = idx;
        else if (lower.includes('đã trả')) colMap.paidPrincipal = idx;
        else if (lower.includes('kỳ hạn')) colMap.termMonths = idx;
        else if (lower.includes('kỳ chi trả') || lower.includes('chu kỳ')) colMap.frequency = idx;
        else if (lower.includes('trong ưu đãi') || lower.includes('hàng tháng')) colMap.monthlyBefore = idx;
        else if (lower.includes('lãi suất ưu đãi') || lower.includes('ưu đãi (%')) colMap.promoRate = idx;
        else if (lower.includes('thời hạn ưu đãi') || lower.includes('tháng ưu đãi')) colMap.promoMonths = idx;
        else if (lower.includes('hết ưu đãi')) colMap.promoEndDate = idx;
        else if (lower.includes('sau ưu đãi (%') || lower.includes('thả nổi')) colMap.normalRate = idx;
        else if (lower.includes('sau ưu đãi (vnđ') || lower.includes('tiền trả sau ưu đãi')) colMap.monthlyAfter = idx;
        else if (lower.includes('ngày trả')) colMap.day = idx;
        else if (lower.includes('trạng thái')) colMap.status = idx;
        else if (lower.includes('ghi chú')) colMap.note = idx;
      });
      headerFound = true;
      break;
    }
  }

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');

    // Check income rows in Section 1
    if (rowStr.includes('lương chủ động') || rowStr.includes('luong')) {
      const val = row.find((c, i) => i > 0 && parseAmountValue(c) > 0);
      if (val) salaryIncome = parseAmountValue(val);
      continue;
    }
    if (rowStr.includes('thu nhập thụ động') || rowStr.includes('thu nhập khác') || rowStr.includes('freelance')) {
      const val = row.find((c, i) => i > 0 && parseAmountValue(c) > 0);
      if (val) otherIncome = parseAmountValue(val);
      continue;
    }

    if (isHeaderRow(row) || isSummaryRow(row)) continue;

    let colId: any = undefined;
    let colCat = '';
    let colName = '';
    let colStartDate = '';
    let colAmount: any = 0;
    let colPaid: any = 0;
    let colTerm: any = 0;
    let colFreq = 'monthly';
    let colMonthlyBefore: any = 0;
    let colPromoRate: any = 0;
    let colPromoMonths: any = 0;
    let colPromoEndDate = '';
    let colNormalRate: any = 0;
    let colMonthlyAfter: any = 0;
    let colDay: any = 1;
    let colStatus = 'Chưa tất toán';
    let colNote = '';

    if (headerFound && (colMap.name !== undefined || colMap.amount !== undefined || colMap.monthlyBefore !== undefined)) {
      colId = colMap.id !== undefined ? row[colMap.id] : undefined;
      colCat = colMap.category !== undefined ? String(row[colMap.category] || '') : '';
      colName = colMap.name !== undefined ? String(row[colMap.name] || '') : '';
      colStartDate = colMap.startDate !== undefined ? String(row[colMap.startDate] || '') : '';
      colAmount = colMap.amount !== undefined ? row[colMap.amount] : 0;
      colPaid = colMap.paidPrincipal !== undefined ? row[colMap.paidPrincipal] : 0;
      colTerm = colMap.termMonths !== undefined ? row[colMap.termMonths] : 0;
      colFreq = colMap.frequency !== undefined ? String(row[colMap.frequency] || '') : 'monthly';
      colMonthlyBefore = colMap.monthlyBefore !== undefined ? row[colMap.monthlyBefore] : 0;
      colPromoRate = colMap.promoRate !== undefined ? row[colMap.promoRate] : 0;
      colPromoMonths = colMap.promoMonths !== undefined ? row[colMap.promoMonths] : 0;
      colPromoEndDate = colMap.promoEndDate !== undefined ? String(row[colMap.promoEndDate] || '') : '';
      colNormalRate = colMap.normalRate !== undefined ? row[colMap.normalRate] : 0;
      colMonthlyAfter = colMap.monthlyAfter !== undefined ? row[colMap.monthlyAfter] : colMonthlyBefore;
      colDay = colMap.day !== undefined ? row[colMap.day] : 1;
      colStatus = colMap.status !== undefined ? String(row[colMap.status] || 'Chưa tất toán') : 'Chưa tất toán';
      colNote = colMap.note !== undefined ? String(row[colMap.note] || '') : '';
    } else {
      let cleanRow = [...row];
      if (String(cleanRow[0] || '').toLowerCase().startsWith('no-') || (typeof cleanRow[0] === 'string' && /^no-\d+/i.test(cleanRow[0]))) {
        colId = cleanRow.shift();
      }
      if (typeof cleanRow[0] === 'number' && cleanRow.length >= 4) {
        cleanRow.shift();
      } else if (/^\d+$/.test(String(cleanRow[0]).trim()) && cleanRow.length >= 4 && String(cleanRow[0]).trim().length <= 3) {
        cleanRow.shift();
      }

      if (cleanRow.length >= 15) {
        colCat = String(cleanRow[0] || '');
        colName = String(cleanRow[1] || '');
        colStartDate = String(cleanRow[2] || '');
        colAmount = cleanRow[3];
        colPaid = cleanRow[4];
        colTerm = cleanRow[5];
        colFreq = String(cleanRow[6] || 'monthly');
        colMonthlyBefore = cleanRow[7];
        colPromoRate = cleanRow[8];
        colPromoMonths = cleanRow[9];
        colPromoEndDate = String(cleanRow[10] || '');
        colNormalRate = cleanRow[11];
        colMonthlyAfter = cleanRow[12];
        colDay = cleanRow[13];
        colStatus = String(cleanRow[14] || 'Chưa tất toán');
        colNote = String(cleanRow[15] || '');
      } else if (cleanRow.length >= 4) {
        colCat = String(cleanRow[0] || '');
        colName = String(cleanRow[1] || '');
        colAmount = cleanRow[2];
        colMonthlyBefore = cleanRow[3];
        colMonthlyAfter = cleanRow[3];
      } else if (cleanRow.length >= 2) {
        colName = String(cleanRow[0] || '');
        colAmount = cleanRow[1];
      }
    }

    const cleanName = colName.trim();
    const amountNum = parseAmountValue(colAmount);
    const monthlyBeforeNum = parseAmountValue(colMonthlyBefore);
    const monthlyAfterNum = colMonthlyAfter ? parseAmountValue(colMonthlyAfter) : monthlyBeforeNum;

    if (!cleanName && amountNum <= 0 && monthlyBeforeNum <= 0) continue;
    if (cleanName.toLowerCase().includes('tổng cộng') || cleanName.toLowerCase().includes('tổng nợ')) continue;

    const parsedId = parseIdValue(colId);
    const category = parseDebtCategoryString(colCat || cleanName);
    const paidNum = parseAmountValue(colPaid);
    const termNum = parseInt(String(colTerm || 0), 10) || undefined;
    const pRate = parseRateValue(colPromoRate);
    const nRate = parseRateValue(colNormalRate);
    const pMonths = parseInt(String(colPromoMonths || 0), 10) || undefined;
    const dayNum = parseInt(String(colDay || 1), 10) || 1;
    const statusVal: 'Chưa tất toán' | 'Đã tất toán' =
      String(colStatus).toLowerCase().includes('đã') ? 'Đã tất toán' : 'Chưa tất toán';

    let freq: 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'flexible' = 'monthly';
    const lowerFreq = String(colFreq).toLowerCase();
    if (lowerFreq.includes('quý')) freq = 'quarterly';
    else if (lowerFreq.includes('6 tháng') || lowerFreq.includes('nửa năm')) freq = 'biannual';
    else if (lowerFreq.includes('năm')) freq = 'annual';
    else if (lowerFreq.includes('linh hoạt')) freq = 'flexible';

    debts.push({
      id: parsedId,
      category,
      categoryName: getDebtCategoryLabel(category),
      name: cleanName || `Khoản nợ ${debts.length + 1}`,
      frequency: freq,
      startDate: parseDateValue(colStartDate) || undefined,
      amount: amountNum,
      paidPrincipal: paidNum,
      termMonths: termNum,
      promoRate: pRate > 0 ? pRate : undefined,
      normalRate: nRate > 0 ? nRate : undefined,
      promoMonths: pMonths,
      promoEndDate: parseDateValue(colPromoEndDate) || undefined,
      monthlyBefore: monthlyBeforeNum,
      monthlyAfter: monthlyAfterNum,
      day: dayNum,
      status: statusVal,
      note: colNote.trim() || undefined,
    });
  }

  return { debts, salaryIncome, otherIncome };
};

// Parse Sheet 3: Goals
export const parseRawRowsToGoals = (rawRows: any[][]): ParsedGoalItem[] => {
  const goals: ParsedGoalItem[] = [];

  const colMap: Record<string, number> = {};
  let headerFound = false;

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('mục tiêu') && (rowStr.includes('nhóm') || rowStr.includes('tên') || rowStr.includes('mã'))) {
      row.forEach((cell, idx) => {
        const lower = String(cell || '').toLowerCase().trim();
        if (lower.includes('mã id') || lower === 'id' || lower.includes('trống=thêm')) colMap.id = idx;
        else if (lower === 'stt' || lower === 'tt') colMap.stt = idx;
        else if (lower.includes('nhóm')) colMap.group = idx;
        else if (lower.includes('tên')) colMap.name = idx;
        else if (lower.includes('loại')) colMap.goalType = idx;
        else if (lower.includes('kênh')) colMap.assetType = idx;
        else if (lower.includes('chu kỳ')) colMap.freqMonths = idx;
        else if (lower.includes('ngày chốt') || lower.includes('ngày mua')) colMap.day = idx;
        else if (lower.includes('định mức')) colMap.targetQty = idx;
        else if (lower.includes('đơn vị')) colMap.unit = idx;
        else if (lower.includes('tiền nạp') || lower.includes('mỗi kỳ')) colMap.targetAmountPerPeriod = idx;
        else if (lower.includes('đã tích lũy')) colMap.totalBought = idx;
        else if (lower.includes('nợ chỉ tiêu') || lower.includes('chưa mua')) colMap.backlogQty = idx;
        else if (lower.includes('tổng tiền') || lower.includes('mục tiêu (vnđ)')) colMap.target = idx;
        else if (lower.includes('thời hạn') || lower.includes('năm')) colMap.years = idx;
        else if (lower.includes('trạng thái')) colMap.status = idx;
        else if (lower.includes('ghi chú') || lower.includes('chiến lược')) colMap.note = idx;
      });
      headerFound = true;
      break;
    }
  }

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;
    if (isHeaderRow(row) || isSummaryRow(row)) continue;

    let colId: any = undefined;
    let colGroup = '';
    let colName = '';
    let colType = 'DCA';
    let colAssetType = '';
    let colFreqMonths: any = 1;
    let colDay: any = 1;
    let colTargetQty: any = 0;
    let colUnit = 'VNĐ';
    let colPeriodAmount: any = 0;
    let colAccum: any = 0;
    let colBacklog: any = 0;
    let colTarget: any = 0;
    let colYears: any = 1;
    let colStatus = 'active';
    let colNote = '';

    if (headerFound && (colMap.name !== undefined || colMap.target !== undefined || colMap.targetQty !== undefined)) {
      colId = colMap.id !== undefined ? row[colMap.id] : undefined;
      colGroup = colMap.group !== undefined ? String(row[colMap.group] || '') : '';
      colName = colMap.name !== undefined ? String(row[colMap.name] || '') : '';
      colType = colMap.goalType !== undefined ? String(row[colMap.goalType] || 'DCA') : 'DCA';
      colAssetType = colMap.assetType !== undefined ? String(row[colMap.assetType] || '') : '';
      colFreqMonths = colMap.freqMonths !== undefined ? row[colMap.freqMonths] : 1;
      colDay = colMap.day !== undefined ? row[colMap.day] : 1;
      colTargetQty = colMap.targetQty !== undefined ? row[colMap.targetQty] : 0;
      colUnit = colMap.unit !== undefined ? String(row[colMap.unit] || 'VNĐ') : 'VNĐ';
      colPeriodAmount = colMap.targetAmountPerPeriod !== undefined ? row[colMap.targetAmountPerPeriod] : 0;
      colAccum = colMap.totalBought !== undefined ? row[colMap.totalBought] : 0;
      colBacklog = colMap.backlogQty !== undefined ? row[colMap.backlogQty] : 0;
      colTarget = colMap.target !== undefined ? row[colMap.target] : 0;
      colYears = colMap.years !== undefined ? row[colMap.years] : 1;
      colStatus = colMap.status !== undefined ? String(row[colMap.status] || 'active') : 'active';
      colNote = colMap.note !== undefined ? String(row[colMap.note] || '') : '';
    } else {
      let cleanRow = [...row];
      if (String(cleanRow[0] || '').toLowerCase().startsWith('mt-') || (typeof cleanRow[0] === 'string' && /^mt-\d+/i.test(cleanRow[0]))) {
        colId = cleanRow.shift();
      }
      if (typeof cleanRow[0] === 'number' && cleanRow.length >= 4) {
        cleanRow.shift();
      } else if (/^\d+$/.test(String(cleanRow[0]).trim()) && cleanRow.length >= 4 && String(cleanRow[0]).trim().length <= 3) {
        cleanRow.shift();
      }

      if (cleanRow.length >= 14) {
        colGroup = String(cleanRow[0] || '');
        colName = String(cleanRow[1] || '');
        colType = String(cleanRow[2] || 'DCA');
        colAssetType = String(cleanRow[3] || '');
        colFreqMonths = cleanRow[4];
        colDay = cleanRow[5];
        colTargetQty = cleanRow[6];
        colUnit = String(cleanRow[7] || 'VNĐ');
        colPeriodAmount = cleanRow[8];
        colAccum = cleanRow[9];
        colBacklog = cleanRow[10];
        colTarget = cleanRow[11];
        colYears = cleanRow[12];
        colStatus = String(cleanRow[13] || 'active');
        colNote = String(cleanRow[14] || '');
      } else if (cleanRow.length >= 4) {
        colGroup = String(cleanRow[0] || '');
        colName = String(cleanRow[1] || '');
        colTarget = cleanRow[2];
        colNote = String(cleanRow[3] || '');
      } else if (cleanRow.length >= 2) {
        colName = String(cleanRow[0] || '');
        colTarget = cleanRow[1];
      }
    }

    const cleanName = colName.trim();
    const targetQtyNum = parseQuantityValue(colTargetQty);
    const targetNum = parseAmountValue(colTarget);
    const periodAmtNum = parseAmountValue(colPeriodAmount);
    const accumNum = parseQuantityValue(colAccum);
    const backlogNum = parseQuantityValue(colBacklog);

    if (!cleanName && targetQtyNum <= 0 && targetNum <= 0 && periodAmtNum <= 0) continue;
    if (cleanName.toLowerCase().includes('tổng cộng')) continue;

    const parsedId = parseIdValue(colId);
    const group = parseGoalGroupString(colGroup || cleanName);
    const isDCA = String(colType).toLowerCase().includes('dca') || group === 'dca';
    const yearsNum = parseInt(String(colYears || 1), 10) || 1;
    const freqNum = parseInt(String(colFreqMonths || 1), 10) || 1;
    const dayNum = parseInt(String(colDay || 1), 10) || 1;

    let parsedAssetType: 'stock' | 'gold' | 'saving' | 'cash' | 'other' | undefined;
    const lowerAsset = (colAssetType || cleanName).toLowerCase();
    if (lowerAsset.includes('cổ phiếu') || lowerAsset.includes('stock')) parsedAssetType = 'stock';
    else if (lowerAsset.includes('vàng') || lowerAsset.includes('gold')) parsedAssetType = 'gold';
    else if (lowerAsset.includes('tiết kiệm') || lowerAsset.includes('saving')) parsedAssetType = 'saving';
    else if (lowerAsset.includes('tiền mặt') || lowerAsset.includes('cash')) parsedAssetType = 'cash';
    else if (colAssetType) parsedAssetType = 'other';

    const statusClean: 'active' | 'completed' | 'pending' =
      String(colStatus).toLowerCase().includes('completed') || String(colStatus).toLowerCase().includes('hoàn thành')
        ? 'completed'
        : String(colStatus).toLowerCase().includes('pending') || String(colStatus).toLowerCase().includes('tạm dừng')
        ? 'pending'
        : 'active';

    goals.push({
      id: parsedId,
      group,
      groupName: getGoalGroupLabel(group),
      name: cleanName || `Mục tiêu ${goals.length + 1}`,
      goalType: isDCA ? 'dca' : 'milestone',
      assetType: parsedAssetType,
      freqMonths: freqNum,
      day: dayNum,
      targetQty: targetQtyNum > 0 ? targetQtyNum : undefined,
      targetAmountPerPeriod: periodAmtNum > 0 ? periodAmtNum : undefined,
      unit: colUnit.trim() || (isDCA ? 'CP' : 'VNĐ'),
      totalBought: accumNum > 0 ? accumNum : undefined,
      backlogQty: backlogNum > 0 ? backlogNum : undefined,
      target: targetNum > 0 ? targetNum : undefined,
      years: yearsNum,
      status: statusClean,
      note: colNote.trim() || undefined,
    });
  }

  return goals;
};

// =========================================================================
// 4. BỘ PHÂN TÍCH TOÀN BỘ FILE EXCEL UPLOAD
// =========================================================================
export const parseExcelFile = async (file: File): Promise<ParsedFullDatabase> => {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const result: ParsedFullDatabase = {
    assets: [],
    debts: [],
    goals: [],
    salaryIncome: 0,
    otherIncome: 0,
  };

  if (!wb.SheetNames || wb.SheetNames.length === 0) return result;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    if (!rawData || rawData.length === 0) continue;

    const lowerName = sheetName.toLowerCase().trim();

    if (lowerName.includes('tai_san') || lowerName.includes('tài sản') || lowerName.includes('asset') || lowerName === 'sheet1') {
      const parsed = parseRawRowsToAssets(rawData);
      if (parsed.length > 0) {
        result.assets.push(...parsed);
      }
    } else if (lowerName.includes('dong_tien') || lowerName.includes('dòng tiền') || lowerName.includes('no') || lowerName.includes('nợ') || lowerName.includes('debt') || lowerName.includes('cashflow')) {
      const parsed = parseRawRowsToDebtsAndIncome(rawData);
      if (parsed.debts.length > 0) result.debts.push(...parsed.debts);
      if (parsed.salaryIncome > 0) result.salaryIncome = parsed.salaryIncome;
      if (parsed.otherIncome > 0) result.otherIncome = parsed.otherIncome;
    } else if (lowerName.includes('muc_tieu') || lowerName.includes('mục tiêu') || lowerName.includes('goal')) {
      const parsed = parseRawRowsToGoals(rawData);
      if (parsed.length > 0) result.goals.push(...parsed);
    } else {
      // Fallback if single generic sheet
      if (wb.SheetNames.length === 1) {
        const parsedAssets = parseRawRowsToAssets(rawData);
        if (parsedAssets.length > 0) result.assets.push(...parsedAssets);

        const parsedDebts = parseRawRowsToDebtsAndIncome(rawData);
        if (parsedDebts.debts.length > 0) result.debts.push(...parsedDebts.debts);
        if (parsedDebts.salaryIncome > 0) result.salaryIncome = parsedDebts.salaryIncome;
        if (parsedDebts.otherIncome > 0) result.otherIncome = parsedDebts.otherIncome;

        const parsedGoals = parseRawRowsToGoals(rawData);
        if (parsedGoals.length > 0) result.goals.push(...parsedGoals);
      }
    }
  }

  // Fallback: If no assets found, parse sheet 0 as assets
  if (result.assets.length === 0 && wb.SheetNames[0]) {
    const ws0 = wb.Sheets[wb.SheetNames[0]];
    const rawData0 = XLSX.utils.sheet_to_json<any[]>(ws0, { header: 1 });
    result.assets = parseRawRowsToAssets(rawData0);
  }

  return result;
};
