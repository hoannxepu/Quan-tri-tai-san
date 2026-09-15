import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Shield,
  TrendingUp,
  Target,
  Wallet,
  Scale,
  Calendar,
  Percent,
} from 'lucide-react';
import {
  ParsedFullDatabase,
  parseExcelFile,
  downloadStandardExcelTemplate,
} from '../utils/excelEngine';
import { Asset, Debt, Goal } from '../types';

interface SmartExcelModalProps {
  isOpen: boolean;
  currentAssetsCount: number;
  currentDebtsCount: number;
  currentGoalsCount: number;
  onClose: () => void;
  onImportData: (
    data: {
      assets: Omit<Asset, 'id'>[];
      debts: Omit<Debt, 'id'>[];
      goals: Omit<Goal, 'id'>[];
      salaryIncome?: number;
      otherIncome?: number;
    },
    mode: 'append' | 'replace'
  ) => void;
}

export const SmartExcelModal: React.FC<SmartExcelModalProps> = ({
  isOpen,
  currentAssetsCount,
  currentDebtsCount,
  currentGoalsCount,
  onClose,
  onImportData,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedData, setParsedData] = useState<ParsedFullDatabase | null>(null);
  const [previewTab, setPreviewTab] = useState<'assets' | 'debts' | 'goals'>('assets');
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
      const data = await parseExcelFile(file);
      const totalCount = data.assets.length + data.debts.length + data.goals.length;

      if (totalCount === 0 && (!data.salaryIncome && !data.otherIncome)) {
        setErrorMsg('Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng tải File Mẫu Chuẩn để xem đúng cấu trúc!');
        setParsedData(null);
      } else {
        setParsedData(data);
        if (data.assets.length > 0) setPreviewTab('assets');
        else if (data.debts.length > 0) setPreviewTab('debts');
        else if (data.goals.length > 0) setPreviewTab('goals');

        setSuccessNotice(
          `Đã đọc thành công: ${data.assets.length} tài sản, ${data.debts.length} khoản nợ/dòng tiền, ${data.goals.length} mục tiêu!`
        );
      }
    } catch (err: any) {
      setErrorMsg('Lỗi khi đọc file Excel. Định dạng được hỗ trợ: .xlsx, .xls, .csv');
      setParsedData(null);
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

  const handleConfirmSave = () => {
    if (!parsedData) return;

    const assetsToImport: Omit<Asset, 'id'>[] = parsedData.assets.map((item) => ({
      level: item.level,
      type: item.type,
      name: item.name,
      amount: item.amount,
      costPrice: item.costPrice,
      rate: item.rate,
      quantity: item.quantity,
      cashflow: item.cashflow,
      maturityDate: item.maturityDate,
      note: item.note,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
    }));

    const debtsToImport: Omit<Debt, 'id'>[] = parsedData.debts.map((item) => ({
      category: item.category,
      name: item.name,
      frequency: 'monthly',
      amount: item.amount,
      paidPrincipal: item.paidPrincipal,
      termMonths: item.termMonths,
      promoRate: item.promoRate,
      normalRate: item.normalRate,
      promoMonths: item.promoMonths,
      monthlyBefore: item.monthlyBefore,
      monthlyAfter: item.monthlyAfter,
      day: item.day || 1,
      status: item.status,
      note: item.note,
    }));

    const goalsToImport: Omit<Goal, 'id'>[] = parsedData.goals.map((item) => ({
      group: item.group,
      goalType: item.goalType,
      name: item.name,
      targetQty: item.targetQty,
      unit: item.unit,
      totalBought: item.totalBought,
      target: item.target,
      years: item.years,
      note: item.note,
    }));

    onImportData(
      {
        assets: assetsToImport,
        debts: debtsToImport,
        goals: goalsToImport,
        salaryIncome: parsedData.salaryIncome,
        otherIncome: parsedData.otherIncome,
      },
      importMode
    );
    onClose();
  };

  // Stats calculation
  const totalAssetAmount = parsedData?.assets.reduce((sum, item) => sum + item.amount, 0) || 0;
  const totalDebtAmount = parsedData?.debts.reduce((sum, item) => sum + item.amount, 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div
        id="smart-excel-modal"
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80 shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
                Nhập Dữ Liệu Từ File Excel
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                Tự động nạp Tài sản, Dòng tiền & Nợ, Mục tiêu tài chính
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
            <button
              type="button"
              onClick={downloadStandardExcelTemplate}
              className="hidden sm:inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition cursor-pointer shadow-xs"
              title="Tải tệp mẫu Excel chuẩn 3 sheet đầy đủ thông tin"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải File Mẫu (3 Sheet)</span>
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {/* Mobile-optimized Template Download Banner */}
          <div className="sm:hidden flex items-center justify-between gap-2 p-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-amber-900 min-w-0">
              <Download className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="font-bold text-[11px] truncate">Tải file mẫu Excel chuẩn (3 Sheet)</span>
            </div>
            <button
              type="button"
              onClick={downloadStandardExcelTemplate}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              Tải mẫu
            </button>
          </div>

          {/* FILE DRAG & DROP ONLY */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 sm:p-7 text-center cursor-pointer transition flex flex-col items-center justify-center ${
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
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-emerald-600 shadow-xs mb-2">
              <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              Kéo thả file Excel vào đây hoặc <span className="text-emerald-600 underline font-extrabold">nhấp để chọn</span>
            </p>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
              Hỗ trợ file chuẩn (.xlsx, .xls, .csv). Tự động nhận diện đầy đủ Tầng Tháp, Lãi suất, Kỳ hạn, Thu nhập & Nợ.
            </p>
            {fileName && (
              <div className="mt-3 inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-bold shadow-xs">
                <FileSpreadsheet className="w-4 h-4" />
                <span>{fileName}</span>
              </div>
            )}
          </div>

          {/* Error & Success Messages */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3.5 py-2.5 rounded-xl font-semibold flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successNotice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3.5 py-2 rounded-xl font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* PREVIEW SECTION (XEM TRƯỚC DỮ LIỆU ĐẦY ĐỦ THÔNG TIN) */}
          {parsedData && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-3 gap-2.5">
                <div
                  onClick={() => setPreviewTab('assets')}
                  className={`p-2.5 rounded-xl border cursor-pointer transition ${
                    previewTab === 'assets'
                      ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-400/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 text-blue-700 font-bold text-xs mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Tài Sản</span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {parsedData.assets.length} mục
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold truncate">
                    {totalAssetAmount.toLocaleString('vi-VN')} đ
                  </div>
                </div>

                <div
                  onClick={() => setPreviewTab('debts')}
                  className={`p-2.5 rounded-xl border cursor-pointer transition ${
                    previewTab === 'debts'
                      ? 'bg-rose-50/80 border-rose-400 ring-2 ring-rose-400/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 text-rose-700 font-bold text-xs mb-1">
                    <Scale className="w-3.5 h-3.5" />
                    <span>Dòng Tiền & Nợ</span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {parsedData.debts.length} khoản
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold truncate">
                    Nợ: {totalDebtAmount.toLocaleString('vi-VN')} đ
                  </div>
                </div>

                <div
                  onClick={() => setPreviewTab('goals')}
                  className={`p-2.5 rounded-xl border cursor-pointer transition ${
                    previewTab === 'goals'
                      ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 text-emerald-700 font-bold text-xs mb-1">
                    <Target className="w-3.5 h-3.5" />
                    <span>Mục Tiêu</span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {parsedData.goals.length} mục tiêu
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    DCA & Cột mốc
                  </div>
                </div>
              </div>

              {/* TAB 1 PREVIEW: TÀI SẢN */}
              {previewTab === 'assets' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Chi tiết {parsedData.assets.length} tài sản đọc từ file:
                    </span>
                    <span className="text-slate-500">
                      Tổng giá trị: <strong className="text-blue-700 font-black">{totalAssetAmount.toLocaleString('vi-VN')} đ</strong>
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 text-xs">
                    {parsedData.assets.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">Không có dòng tài sản nào</div>
                    ) : (
                      parsedData.assets.map((item, idx) => (
                        <div key={idx} className="p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                                  item.level === '1'
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.level === '2'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                T{item.level}
                              </span>
                              <span className="font-bold text-slate-900 truncate">{item.name}</span>
                              <span className="text-[11px] text-slate-400">({item.typeName})</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                              {item.costPrice && item.costPrice > 0 && (
                                <span>Vốn: <strong className="text-slate-700">{item.costPrice.toLocaleString('vi-VN')} đ</strong></span>
                              )}
                              {item.rate && item.rate > 0 && (
                                <span className="inline-flex items-center text-emerald-700 font-semibold">
                                  <Percent className="w-3 h-3 mr-0.5" />
                                  {item.rate}%/năm
                                </span>
                              )}
                              {item.quantity && item.quantity > 1 && (
                                <span>SL: <strong>{item.quantity.toLocaleString('vi-VN')}</strong></span>
                              )}
                              {item.cashflow && item.cashflow > 0 && (
                                <span className="text-blue-600 font-semibold">Dòng tiền: +{item.cashflow.toLocaleString('vi-VN')} đ/th</span>
                              )}
                              {item.maturityDate && (
                                <span className="text-amber-700">Đáo hạn: {item.maturityDate}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-black text-slate-900 text-xs">
                              {item.amount.toLocaleString('vi-VN')} đ
                            </div>
                            {item.note && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={item.note}>
                                {item.note}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2 PREVIEW: DÒNG TIỀN VÀ NỢ */}
              {previewTab === 'debts' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Thu nhập & Các khoản nợ ({parsedData.debts.length} khoản):
                    </span>
                    <span className="text-slate-500">
                      Tổng nợ: <strong className="text-rose-700 font-black">{totalDebtAmount.toLocaleString('vi-VN')} đ</strong>
                    </span>
                  </div>

                  {/* Income Preview Strip */}
                  {((parsedData.salaryIncome && parsedData.salaryIncome > 0) || (parsedData.otherIncome && parsedData.otherIncome > 0)) && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        <span>Thu nhập nhận diện:</span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs">
                        {parsedData.salaryIncome ? (
                          <span>Lương: <strong className="text-emerald-950 font-black">{parsedData.salaryIncome.toLocaleString('vi-VN')} đ</strong></span>
                        ) : null}
                        {parsedData.otherIncome ? (
                          <span>Khác: <strong className="text-emerald-950 font-black">{parsedData.otherIncome.toLocaleString('vi-VN')} đ</strong></span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 text-xs">
                    {parsedData.debts.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">Không có khoản nợ nào trong file</div>
                    ) : (
                      parsedData.debts.map((item, idx) => (
                        <div key={idx} className="p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 shrink-0">
                                {item.categoryName}
                              </span>
                              <span className="font-bold text-slate-900 truncate">{item.name}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                  item.status === 'Đã tất toán'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                              {item.amount > 0 && (
                                <span>Gốc: <strong className="text-slate-700">{item.amount.toLocaleString('vi-VN')} đ</strong></span>
                              )}
                              {item.paidPrincipal > 0 && (
                                <span className="text-emerald-700">Đã trả: {item.paidPrincipal.toLocaleString('vi-VN')} đ</span>
                              )}
                              {item.promoRate && (
                                <span className="text-rose-600 font-medium">Lãi: {item.promoRate}%</span>
                              )}
                              {item.monthlyBefore > 0 && (
                                <span>Trả/tháng: <strong className="text-rose-700">{item.monthlyBefore.toLocaleString('vi-VN')} đ</strong></span>
                              )}
                              <span>Ngày trả: mùng {item.day || 1}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3 PREVIEW: MỤC TIÊU TÀI CHÍNH */}
              {previewTab === 'goals' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Mục tiêu tài chính ({parsedData.goals.length} mục tiêu):
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 text-xs">
                    {parsedData.goals.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">Không có mục tiêu nào trong file</div>
                    ) : (
                      parsedData.goals.map((item, idx) => (
                        <div key={idx} className="p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                {item.groupName}
                              </span>
                              <span className="font-bold text-slate-900 truncate">{item.name}</span>
                              <span className="text-[10px] px-1 py-0.2 bg-slate-100 text-slate-600 rounded font-semibold">
                                {item.goalType === 'dca' ? 'DCA Định kỳ' : 'Cột mốc'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                              {item.targetQty && (
                                <span>Định mức kỳ: <strong>{item.targetQty.toLocaleString('vi-VN')} {item.unit}</strong></span>
                              )}
                              {item.totalBought && (
                                <span className="text-emerald-700">Đã tích lũy: {item.totalBought.toLocaleString('vi-VN')} {item.unit}</span>
                              )}
                              {item.target && item.target > 0 && (
                                <span>Mục tiêu tiền: <strong className="text-blue-700">{item.target.toLocaleString('vi-VN')} đ</strong></span>
                              )}
                              {item.years && (
                                <span>Thời hạn: {item.years} năm</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Mode Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Lựa chọn chế độ nạp dữ liệu:</span>
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
                        Giữ nguyên {currentAssetsCount} tài sản, {currentDebtsCount} khoản nợ hiện tại và thêm mới các mục từ file.
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
                        Thay thế toàn bộ danh mục cũ bằng dữ liệu mới trong file Excel.
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
            disabled={!parsedData || isProcessing}
            onClick={handleConfirmSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Lưu Dữ Liệu Vào Ứng Dụng</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
