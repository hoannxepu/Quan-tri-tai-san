import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  X,
  Layers,
  ArrowRight,
  Shield,
  TrendingUp,
  Flame,
  FileUp,
} from 'lucide-react';
import {
  ParsedAssetItem,
  parseClipboardText,
  parseExcelFile,
  downloadStandardExcelTemplate,
} from '../utils/excelEngine';
import { Asset, AssetLevel } from '../types';

interface SmartExcelModalProps {
  isOpen: boolean;
  currentAssetsCount: number;
  onClose: () => void;
  onImportAssets: (newAssets: Omit<Asset, 'id'>[], mode: 'append' | 'replace') => void;
}

export const SmartExcelModal: React.FC<SmartExcelModalProps> = ({
  isOpen,
  currentAssetsCount,
  onClose,
  onImportAssets,
}) => {
  const [activeInputTab, setActiveInputTab] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedAssetItem[]>([]);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [errorMsg, setErrorMsg] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setErrorMsg('');
    setSuccessNotice('');
    setFileName(file.name);
    setIsProcessing(true);

    try {
      const items = await parseExcelFile(file);
      if (items.length === 0) {
        setErrorMsg('Không tìm thấy dòng tài sản hợp lệ trong file Excel. Vui lòng xem file mẫu chuẩn!');
        setParsedItems([]);
      } else {
        setParsedItems(items);
        setSuccessNotice(`Đã đọc thành công ${items.length} tài sản từ file!`);
      }
    } catch (err: any) {
      setErrorMsg('Lỗi khi đọc file Excel. Định dạng được hỗ trợ: .xlsx, .xls, .csv');
      setParsedItems([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleParsePastedText = () => {
    setErrorMsg('');
    setSuccessNotice('');
    if (!pastedText.trim()) {
      setErrorMsg('Vui lòng dán các dòng dữ liệu từ Excel / Google Sheets vào ô bên dưới.');
      return;
    }

    try {
      const items = parseClipboardText(pastedText);
      if (items.length === 0) {
        setErrorMsg('Không thể nhận diện các cột dữ liệu. Hãy sao chép ít nhất cột Tên tài sản và Giá trị.');
        setParsedItems([]);
      } else {
        setParsedItems(items);
        setFileName('Dữ liệu sao chép trực tiếp');
        setSuccessNotice(`Đã trích xuất thành công ${items.length} tài sản từ clipboard!`);
      }
    } catch (err: any) {
      setErrorMsg('Lỗi khi phân tích dữ liệu dán vào.');
      setParsedItems([]);
    }
  };

  const handleConfirmSave = () => {
    if (parsedItems.length === 0) return;

    const assetsToImport: Omit<Asset, 'id'>[] = parsedItems.map((item) => ({
      level: item.level,
      type: item.type,
      name: item.name,
      amount: item.amount,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
    }));

    onImportAssets(assetsToImport, importMode);
    onClose();
  };

  // Stats calculation
  const totalAmount = parsedItems.reduce((sum, item) => sum + item.amount, 0);
  const countL1 = parsedItems.filter((i) => i.level === '1').length;
  const countL2 = parsedItems.filter((i) => i.level === '2').length;
  const countL3 = parsedItems.filter((i) => i.level === '3').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div
        id="smart-excel-modal"
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Nhập Dữ Liệu Tài Sản Từ Excel
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Tự động trích xuất danh mục tài sản thông minh & chính xác
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadStandardExcelTemplate}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition cursor-pointer"
              title="Tải tệp mẫu Excel chuẩn để điền dữ liệu"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải File Mẫu Chuẩn</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Input Method Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveInputTab('upload');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeInputTab === 'upload'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileUp className="w-4 h-4" />
              <span>Tải File Excel Lên (.xlsx, .xls, .csv)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveInputTab('paste');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeInputTab === 'paste'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Dán Trực Tiếp Từ Excel (Copy & Paste)</span>
            </button>
          </div>

          {/* TAB 1: FILE DRAG & DROP */}
          {activeInputTab === 'upload' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50/60'
                  : 'border-slate-300 hover:border-emerald-400 bg-slate-50/40 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-emerald-600 shadow-xs mb-2.5">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Kéo thả file Excel vào đây hoặc <span className="text-emerald-600 underline">nhấp để chọn</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Hỗ trợ định dạng .xlsx, .xls, .csv (Tự động nhận diện Tầng, Phân loại, Tên và Giá trị)
              </p>
              {fileName && (
                <div className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{fileName}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COPY & PASTE FROM EXCEL / GOOGLE SHEETS */}
          {activeInputTab === 'paste' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Dán các ô đã copy từ Excel hoặc Google Sheets:
                </label>
                <span className="text-[11px] text-slate-400">Ctrl+C từ Excel rồi Ctrl+V vào đây</span>
              </div>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Ví dụ sao chép từ Excel:\nBảo vệ\tTiền gửi\tSổ Vietcombank 12T\t300000000\nTăng trưởng\tCổ phiếu\tCổ phiếu FPT\t650000000\nRủi ro\tCrypto\tBitcoin\t120000000`}
                rows={4}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono outline-none focus:border-emerald-500 focus:bg-white transition text-slate-900 resize-none leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Phân Tích Dữ Liệu Đã Dán</span>
                </button>
              </div>
            </div>
          )}

          {/* Error & Success Messages */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2.5 rounded-xl font-semibold flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successNotice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 rounded-xl font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* PREVIEW SECTION (XEM TRƯỚC DỮ LIỆU) */}
          {parsedItems.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Xem trước ({parsedItems.length} tài sản):
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 font-medium">Tổng giá trị: </span>
                  <span className="text-xs font-black text-emerald-600">
                    {totalAmount.toLocaleString('vi-VN')} VNĐ
                  </span>
                </div>
              </div>

              {/* Badges Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-2 flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-blue-600 font-bold">Tầng 1: Bảo vệ</div>
                    <div className="text-xs font-black text-blue-950">{countL1} tài sản</div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-2 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-emerald-600 font-bold">Tầng 2: Tăng trưởng</div>
                    <div className="text-xs font-black text-emerald-950">{countL2} tài sản</div>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-2 flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-rose-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-rose-600 font-bold">Tầng 3: Rủi ro</div>
                    <div className="text-xs font-black text-rose-950">{countL3} tài sản</div>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 text-xs">
                {parsedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          item.level === '1'
                            ? 'bg-blue-100 text-blue-800'
                            : item.level === '2'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        T{item.level}
                      </span>
                      <div className="truncate">
                        <span className="font-bold text-slate-800">{item.name}</span>
                        <span className="text-[11px] text-slate-400 ml-1.5">({item.typeName})</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-bold text-slate-900">
                      {item.amount.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                ))}
              </div>

              {/* Mode Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Lựa chọn chế độ lưu dữ liệu:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`flex items-start space-x-2.5 p-2 rounded-lg border cursor-pointer select-none transition ${
                      importMode === 'append'
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-bold">Thêm vào danh mục hiện tại</div>
                      <div className="text-[11px] text-slate-500">
                        Giữ nguyên {currentAssetsCount} tài sản cũ, thêm {parsedItems.length} tài sản mới vào.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start space-x-2.5 p-2 rounded-lg border cursor-pointer select-none transition ${
                      importMode === 'replace'
                        ? 'border-amber-500 bg-amber-50/50 text-amber-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="text-xs">
                      <div className="font-bold text-rose-700">Ghi đè thay thế toàn bộ</div>
                      <div className="text-[11px] text-slate-500">
                        Xóa danh mục cũ và chỉ giữ {parsedItems.length} tài sản mới này.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            disabled={parsedItems.length === 0 || isProcessing}
            onClick={handleConfirmSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Lưu Dữ Liệu</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
