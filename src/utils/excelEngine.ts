import * as XLSX from 'xlsx';
import { Asset, AssetLevel, AssetType } from '../types';

export interface ParsedAssetItem {
  id?: number;
  level: AssetLevel;
  type: AssetType;
  typeName: string;
  name: string;
  amount: number;
  note?: string;
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
  if (s.includes('vàng') || s.includes('gold') || s.includes('sjc')) return 'gold';
  if (s.includes('tiết kiệm') || s.includes('saving') || s.includes('sổ')) return 'saving';
  if (s.includes('tiền mặt') || s.includes('cash') || s.includes('thanh toán') || s.includes('ngân hàng')) return 'cash';
  if (s.includes('cổ phiếu') || s.includes('stock') || s.includes('chứng khoán')) return 'stock';
  if (s.includes('trái phiếu') || s.includes('bond')) return 'bond';
  if (s.includes('cho thuê') || s.includes('dòng tiền')) return 'realestate_rent';
  if (s.includes('đất nền') || s.includes('đất')) return 'realestate_land';
  if (s.includes('bất động sản') || s.includes('bđs') || s.includes('nhà') || s.includes('căn hộ')) return 'realestate_live';
  if (s.includes('crypto') || s.includes('mã hóa') || s.includes('btc') || s.includes('eth') || s.includes('coin')) return 'crypto';
  if (s.includes('góp vốn') || s.includes('kinh doanh') || s.includes('doanh nghiệp')) return 'private_equity';
  if (s.includes('cho vay') || s.includes('lending') || s.includes('p2p')) return 'peer_lending';

  // Fallback according to layer
  if (level === '1') return 'saving';
  if (level === '3') return 'crypto';
  return 'stock';
};

// Safe number parser for Vietnamese currency formats (e.g. "500.000.000", "500,000,000", "500 tr", "5 tỷ")
export const parseAmountValue = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  if (!val) return 0;

  let s = String(val).trim().toLowerCase();

  // Handle shorthand words like "tỷ" or "tr"
  if (s.includes('tỷ') || s.includes('ty')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 1_000_000_000);
  }
  if (s.includes('tr') || s.includes('triệu') || s.includes('trieu')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 1_000_000);
  }

  // Remove common currency markers
  s = s.replace(/đ|vnđ|vnd|đồng/gi, '').trim();

  // If there are dots and commas, detect separator
  if (s.includes('.') && s.includes(',')) {
    // Standard Vietnamese: 500.000.000,00
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard US: 500,000,000.00
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    const parts = s.split('.');
    // If multiple dots, they are thousand separators: 500.000.000
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    // If multiple commas, they are thousand separators: 500,000,000
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  // Strip anything left that is not digit or dot
  s = s.replace(/[^0-9.]/g, '');
  const res = parseFloat(s);
  return isNaN(res) ? 0 : Math.round(res);
};

// ==========================================
// 1. TẠO VÀ TẢI FILE EXCEL MẪU CHUẨN
// ==========================================
export const downloadStandardExcelTemplate = () => {
  const wb = XLSX.utils.book_new();

  // Dữ liệu bảng mẫu chuẩn
  const wsData = [
    ['DANH MỤC THÁP TÀI SẢN 3 TẦNG (FILE MẪU CHUẨN NHẬP DỮ LIỆU)'],
    ['* Hướng dẫn: Điền thông tin tài sản vào các cột bên dưới. Bạn có thể copy-paste trực tiếp hoặc tải file này lên ứng dụng.'],
    [], // Blank line
    ['Tầng Tháp', 'Mã Phân Loại', 'Tên Danh Mục / Tài Sản', 'Giá Trị (VNĐ)', 'Ghi Chú / Kỳ Vọng'],
    ['Bảo vệ', 'Tiền gửi tiết kiệm', 'Sổ tiết kiệm Vietcombank 12T', 300000000, 'Lãi suất 5.5%/năm, kỳ hạn 1 năm'],
    ['Bảo vệ', 'Tiền mặt', 'Tài khoản Techcombank (Quỹ khẩn cấp)', 50000000, 'Dự phòng sinh hoạt 6 tháng'],
    ['Bảo vệ', 'Vàng', 'Vàng miếng SJC 9999 (2 lượng)', 170000000, 'Tích trữ phòng vệ lạm phát dài hạn'],
    ['Tăng trưởng', 'Cổ phiếu', 'Cổ phiếu FPT Technology (5.000 CP)', 650000000, 'Mục tiêu tăng trưởng EPS 20%/năm'],
    ['Tăng trưởng', 'Bất động sản', 'Căn hộ chung cư Vinhomes Central Park', 3800000000, 'Cho thuê 18 triệu/tháng, tỷ suất 5.6%'],
    ['Rủi ro', 'Tiền mã hóa', 'Bitcoin (BTC) & Ethereum (ETH)', 120000000, 'Danh mục mạo hiểm chu kỳ thị trường mới'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for aesthetic layout
  ws['!cols'] = [
    { wch: 18 }, // Tầng Tháp
    { wch: 24 }, // Mã Phân Loại
    { wch: 42 }, // Tên Danh Mục
    { wch: 22 }, // Giá Trị (VNĐ)
    { wch: 45 }, // Ghi Chú / Kỳ Vọng
  ];

  // Merge title line
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Thap_Tai_San');

  // Trigger download
  XLSX.writeFile(wb, 'Mau_Nhap_Thap_Tai_San_Chuan.xlsx');
};

// ==========================================
// 2. XUẤT TOÀN BỘ DANH MỤC THỰC TẾ RA EXCEL
// ==========================================
export const exportAssetsToExcel = (assets: Asset[], accountName?: string) => {
  const wb = XLSX.utils.book_new();

  const totalValue = assets.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const dateStr = new Date().toLocaleDateString('vi-VN');

  const rows: any[][] = [
    ['BÁO CÁO DANH MỤC THÁP TÀI SẢN 3 TẦNG'],
    [`Chủ tài khoản: ${accountName || 'Cá nhân'} | Ngày xuất báo cáo: ${dateStr} | Tổng số tài sản: ${assets.length}`],
    [],
    ['STT', 'Tầng Tháp', 'Mã Phân Loại', 'Tên Danh Mục / Tài Sản', 'Giá Trị (VNĐ)', 'Tỷ Trọng (%)', 'Ghi Chú & Chi Tiết'],
  ];

  // Sắp xếp tài sản: Tầng 1 -> Tầng 2 -> Tầng 3
  const sorted = [...assets].sort((a, b) => {
    if (a.level !== b.level) return a.level.localeCompare(b.level);
    return (b.amount || 0) - (a.amount || 0);
  });

  sorted.forEach((item, idx) => {
    const levelLabel =
      item.level === '1'
        ? 'Tầng 1: Bảo vệ'
        : item.level === '2'
        ? 'Tầng 2: Tăng trưởng'
        : 'Tầng 3: Rủi ro';

    const typeLabel = getAssetTypeLabel(item.type);
    const pct = totalValue > 0 ? ((item.amount / totalValue) * 100).toFixed(1) + '%' : '0%';

    let note = '';
    if (item.rate) note += `Lãi suất: ${item.rate}%/năm. `;
    if (item.quantity) note += `Số lượng: ${item.quantity}. `;
    if (item.cashflow) note += `Dòng tiền: ${item.cashflow.toLocaleString('vi-VN')} đ/tháng. `;
    if (item.maturityDate) note += `Đáo hạn: ${item.maturityDate}. `;

    rows.push([
      idx + 1,
      levelLabel,
      typeLabel,
      item.name,
      item.amount,
      pct,
      note.trim() || '—',
    ]);
  });

  // Dòng Tổng Cộng
  const startRow = 5;
  const endRow = rows.length;
  rows.push([]);
  rows.push([
    '',
    'TỔNG CỘNG',
    '',
    `Tổng giá trị toàn bộ ${assets.length} tài sản`,
    totalValue,
    '100%',
    'Công thức tự động cập nhật',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 8 },  // STT
    { wch: 22 }, // Tầng Tháp
    { wch: 28 }, // Phân Loại
    { wch: 42 }, // Tên Tài Sản
    { wch: 24 }, // Giá Trị VNĐ
    { wch: 15 }, // Tỷ Trọng
    { wch: 45 }, // Ghi Chú
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Danh_Muc_Tai_San');

  const safeName = (accountName || 'User').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Thap_Tai_San_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// ==========================================
// 3. PARSER THÔNG MINH CHO CẢ FILE VÀ TEXT CLIPBOARD
// ==========================================
const isHeaderRow = (row: any[]): boolean => {
  const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
  return (
    rowStr.includes('tầng') ||
    rowStr.includes('tháp') ||
    rowStr.includes('giá trị') ||
    rowStr.includes('tên tài sản') ||
    rowStr.includes('danh mục') ||
    rowStr.includes('mã phân loại') ||
    rowStr.includes('hướng dẫn') ||
    rowStr.includes('chủ tài khoản') ||
    rowStr.includes('stt')
  );
};

export const parseRawRowsToAssets = (rawRows: any[][]): ParsedAssetItem[] => {
  const results: ParsedAssetItem[] = [];

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;

    // Filter out obvious empty rows
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    // Check if header row
    if (isHeaderRow(row)) continue;

    // Row formats can vary:
    // Format A (5 cols): Tầng | Phân loại | Tên tài sản | Giá trị | Ghi chú
    // Format B (4 cols): Tầng | Tên tài sản | Giá trị | Ghi chú
    // Format C (3 cols): Tên tài sản | Giá trị | Tầng/Ghi chú
    // Format D (With STT): STT | Tầng | Phân loại | Tên tài sản | Giá trị | ...

    let colLevel = '';
    let colType = '';
    let colName = '';
    let colAmount: any = 0;
    let colNote = '';

    // If first column is purely an index number 1, 2, 3...
    let cleanRow = [...row];
    if (typeof cleanRow[0] === 'number' && cleanRow.length >= 4) {
      cleanRow.shift(); // Remove STT
    } else if (/^\d+$/.test(String(cleanRow[0]).trim()) && cleanRow.length >= 4 && String(cleanRow[0]).trim().length <= 3) {
      cleanRow.shift(); // Remove STT
    }

    if (cleanRow.length >= 4) {
      colLevel = String(cleanRow[0] || '');
      colType = String(cleanRow[1] || '');
      colName = String(cleanRow[2] || '');
      colAmount = cleanRow[3];
      colNote = String(cleanRow[4] || '');
    } else if (cleanRow.length === 3) {
      colLevel = String(cleanRow[0] || '');
      colName = String(cleanRow[1] || '');
      colAmount = cleanRow[2];
    } else if (cleanRow.length === 2) {
      colName = String(cleanRow[0] || '');
      colAmount = cleanRow[1];
    }

    const cleanName = colName.trim();
    const amountNum = parseAmountValue(colAmount);

    // If amount is 0 or negative and name is empty, skip
    if (!cleanName && amountNum <= 0) continue;

    const level = parseLevelString(colLevel || colType || cleanName);
    const assetType = parseAssetTypeString(colType || colName, level);

    results.push({
      level,
      type: assetType,
      typeName: getAssetTypeLabel(assetType),
      name: cleanName || `Tài sản ${results.length + 1}`,
      amount: amountNum,
      note: colNote.trim() || undefined,
    });
  }

  return results;
};

// Parse from clipboard string (tab separated or comma/semicolon separated)
export const parseClipboardText = (text: string): ParsedAssetItem[] => {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split(/\r?\n/);
  const rawRows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Excel clipboard uses tabs '\t'
    if (line.includes('\t')) {
      rawRows.push(line.split('\t').map((c) => c.trim()));
    } else if (line.includes(';') && line.split(';').length >= 3) {
      rawRows.push(line.split(';').map((c) => c.trim()));
    } else if (line.includes(',') && line.split(',').length >= 3) {
      rawRows.push(line.split(',').map((c) => c.trim()));
    } else {
      // Space separated fallback
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 2) {
        rawRows.push(parts.map((c) => c.trim()));
      }
    }
  }

  return parseRawRowsToAssets(rawRows);
};

// Parse from File (XLSX, XLS, CSV)
export const parseExcelFile = async (file: File): Promise<ParsedAssetItem[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // Read first sheet
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];

  const ws = wb.Sheets[firstSheetName];
  const rawData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

  return parseRawRowsToAssets(rawData);
};
