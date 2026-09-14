import React, { useState, useEffect } from 'react';
import { DatabaseState, EmailScheduleSettings } from '../types';
import {
  DEFAULT_EMAIL_SCHEDULE,
  getEmailScheduleSettings,
  saveEmailScheduleSettings,
  generateEmailHtml,
  generatePlainTextSummary,
} from '../utils/emailReportGenerator';
import {
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  Send,
  Copy,
  Eye,
  Settings,
  X,
  Target,
  ShieldCheck,
  CreditCard,
  TrendingUp,
  Layers,
  Sparkles,
  ExternalLink,
  Check,
  Loader2,
  AlertCircle,
  Save,
} from 'lucide-react';

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseState;
  userDisplay?: string;
  onSaveSchedule?: (newSchedule: EmailScheduleSettings) => void;
}

export const EmailReportModal: React.FC<EmailReportModalProps> = ({
  isOpen,
  onClose,
  db,
  userDisplay,
  onSaveSchedule,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'preview'>('schedule');
  const [settings, setSettings] = useState<EmailScheduleSettings>(() =>
    getEmailScheduleSettings(db)
  );
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string>('');
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const initial = getEmailScheduleSettings(db);
      // Pre-fill email if empty and user has email-like name
      if (!initial.email && userDisplay?.includes('@')) {
        initial.email = userDisplay;
      }
      setSettings(initial);
      setIsSaved(false);
      setIsSending(false);
      setSaveToast('');
      setSendSuccessMessage('');
      setErrorMessage('');
    }
  }, [isOpen, db, userDisplay]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!settings.email || !settings.email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ trước khi lưu lịch.');
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }
    setErrorMessage('');
    setSendSuccessMessage('');

    // Save to local storage
    saveEmailScheduleSettings(settings);

    // Save to main DB / Cloud state via callback
    if (onSaveSchedule) {
      onSaveSchedule(settings);
    }

    setIsSaved(true);
    setSaveToast(`✓ Đã lưu cài đặt lịch gửi ngày ${settings.sendDay} hàng tháng (${settings.sendHour}:00) cho ${settings.email} thành công!`);

    setTimeout(() => {
      setIsSaved(false);
    }, 5000);
  };

  const handleSendNow = async () => {
    if (!settings.email || !settings.email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email nhận báo cáo hợp lệ.');
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    setErrorMessage('');
    setSaveToast('');
    setIsSending(true);
    setSendSuccessMessage('');

    // Auto save schedule to keep state in sync
    saveEmailScheduleSettings(settings);
    if (onSaveSchedule) {
      onSaveSchedule(settings);
    }

    const currentMonthYear = new Date().toLocaleDateString('vi-VN', {
      month: '2-digit',
      year: 'numeric',
    });
    const subject = `[Tháp Tài Sản] Báo Cáo & Nhắc Nhở Mục Tiêu Tháng ${currentMonthYear}`;
    const htmlContent = generateEmailHtml(db, settings, userDisplay);
    const textSummary = generatePlainTextSummary(db, settings, userDisplay);

    try {
      // Call backend direct API
      const response = await fetch('/api/send-email-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: settings.email.trim(),
          subject,
          htmlContent,
          textSummary,
          senderName: userDisplay || 'Tháp Tài Sản 3 Tầng',
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSendSuccessMessage(`✓ Đã gửi email báo cáo thành công tới ${settings.email}! Vui lòng kiểm tra hộp thư đến (hoặc thư mục Spam/Promotions).`);
      } else {
        // Fallback open mailto if server direct transport fails
        const mailtoUrl = `mailto:${settings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textSummary)}`;
        window.location.href = mailtoUrl;
        setSendSuccessMessage(`✓ Đã kích hoạt lệnh gửi báo cáo tới hòm thư ${settings.email}!`);
      }
    } catch (err: any) {
      console.warn('Direct sending notice:', err);
      const mailtoUrl = `mailto:${settings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textSummary)}`;
      window.location.href = mailtoUrl;
      setSendSuccessMessage(`✓ Đã kích hoạt gửi báo cáo tới hòm thư ${settings.email}!`);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyContent = () => {
    const plain = generatePlainTextSummary(db, settings, userDisplay);
    navigator.clipboard.writeText(plain);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const htmlPreview = generateEmailHtml(db, settings, userDisplay);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight flex items-center gap-1.5">
                <span>Báo Cáo & Nhắc Nhở Email</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                  Tự Động
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Lập lịch gửi bản tin tài chính & mục tiêu tích sản hàng tháng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center border-b border-slate-200 px-4 sm:px-6 bg-slate-50/80 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`py-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Cài Đặt Lịch & Nội Dung</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`py-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'preview'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Xem Trước Báo Cáo</span>
          </button>
        </div>

        {/* Alert Notifications: Toast for Save / Send / Error */}
        {saveToast && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">{saveToast}</div>
          </div>
        )}

        {sendSuccessMessage && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">{sendSuccessMessage}</div>
          </div>
        )}

        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {activeTab === 'schedule' ? (
            <div className="space-y-4">
              {/* Recipient Email Input */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  1. Địa Chỉ Email Nhận Báo Cáo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    placeholder="ví dụ: hoannx.epu@gmail.com"
                    value={settings.email}
                    onChange={(e) =>
                      setSettings({ ...settings, email: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium text-slate-900"
                  />
                </div>
                <p className="text-[10.5px] text-slate-500">
                  Hệ thống sẽ gửi bản tin tổng kết tài chính & mục tiêu tích sản trực tiếp tới địa chỉ email này.
                </p>
              </div>

              {/* Schedule Timing Options */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Lập Lịch Nhắc Nhở Hàng Tháng</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(e) =>
                        setSettings({ ...settings, enabled: e.target.checked })
                      }
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="font-bold text-slate-700 text-[11px]">
                      {settings.enabled ? 'Đang Bật Tự Động' : 'Tắt Tự Động'}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Select Day */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Chọn ngày gửi nhắc nhở trong tháng:
                    </label>
                    <select
                      value={settings.sendDay}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sendDay: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                    >
                      <option value={1}>Ngày 1 hàng tháng (Đầu tháng)</option>
                      <option value={5}>Ngày 5 hàng tháng</option>
                      <option value={10}>Ngày 10 hàng tháng (Kỳ nhận lương)</option>
                      <option value={15}>Ngày 15 hàng tháng (Giữa tháng)</option>
                      <option value={20}>Ngày 20 hàng tháng</option>
                      <option value={25}>Ngày 25 hàng tháng</option>
                      <option value={28}>Ngày 28 hàng tháng (Cuối tháng)</option>
                    </select>
                  </div>

                  {/* Select Hour */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Khung giờ gửi nhắc nhở:
                    </label>
                    <select
                      value={settings.sendHour}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sendHour: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                    >
                      <option value={7}>07:00 Sáng (Đầu ngày làm việc)</option>
                      <option value={8}>08:00 Sáng (Khởi động ngày mới)</option>
                      <option value={9}>09:00 Sáng</option>
                      <option value={12}>12:00 Trưa</option>
                      <option value={18}>18:00 Chiều</option>
                      <option value={20}>20:00 Tối (Thảnh thơi xem tài chính)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Content Selection Checkboxes */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <label className="block font-bold text-slate-800 text-xs">
                  3. Nội Dung Tùy Chọn Trong Báo Cáo
                </label>

                {/* 1. Monthly Goals - Highlighted */}
                <label className="flex items-start space-x-2.5 p-2 bg-emerald-50/70 border border-emerald-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeMonthlyGoals}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        includeMonthlyGoals: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-emerald-900 block text-xs flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-emerald-600" />
                      <span>1. Mục Tiêu Tích Sản Tháng (Ưu tiên hàng đầu)</span>
                    </span>
                    <span className="text-[10.5px] text-emerald-700">
                      Bảng theo dõi định mức tháng, % hoàn thành và ngày gom từng tài sản.
                    </span>
                  </div>
                </label>

                {/* 2. Net Worth */}
                <label className="flex items-start space-x-2.5 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={settings.includeNetWorthOverview}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        includeNetWorthOverview: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>2. Tổng Quan Tài Sản Ròng (Net Worth) & Vị Thế Việt Nam</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      Tổng tài sản, nợ phải trả, tỷ lệ đòn bẩy và đối chiếu phân tầng tài sản VN.
                    </span>
                  </div>
                </label>

                {/* 3. Debts */}
                <label className="flex items-start space-x-2.5 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={settings.includeDebts}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        includeDebts: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-rose-600" />
                      <span>3. Nghĩa Vụ Nợ & Lịch Thanh Toán Định Kỳ</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      Chi tiết từng khoản nợ, dư nợ còn lại, tiền gốc + lãi mỗi tháng và hạn trả.
                    </span>
                  </div>
                </label>

                {/* 4. Cash Flow */}
                <label className="flex items-start space-x-2.5 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={settings.includeCashFlow}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        includeCashFlow: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                      <span>4. Dòng Tiền & Kế Hoạch Thặng Dư Ngân Sách</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      Thu nhập lương, chi phí trả nợ và số tiền thặng dư đầu tư tháng.
                    </span>
                  </div>
                </label>

                {/* 5. Asset Pyramid Details */}
                <label className="flex items-start space-x-2.5 p-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={settings.includeAssetPyramid}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        includeAssetPyramid: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      <span>5. Danh Sách Chi Tiết Theo Từng Tầng Tháp Tài Sản (1 - 2 - 3)</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      Bảng kê chi tiết tài sản Tầng Bảo đảm, Tăng trưởng, Rủi ro kèm giá trị cụ thể.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            /* Live HTML Preview Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Xem trước định dạng email sẽ nhận:</span>
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="flex items-center space-x-1 text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isCopied ? 'Đã sao chép!' : 'Sao chép văn bản'}</span>
                </button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-100 p-2 sm:p-4 max-h-[480px] overflow-y-auto">
                <div
                  className="email-rendered-preview bg-white rounded-xl shadow-xs"
                  dangerouslySetInnerHTML={{ __html: htmlPreview }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyContent}
            className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{isCopied ? '✓ Đã sao chép' : 'Sao chép tóm tắt'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSave}
              className={`px-3.5 py-2 text-white rounded-xl font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                isSaved ? 'bg-emerald-700 shadow-md shadow-emerald-700/20' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Đã Lưu Cài Đặt!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-slate-300" />
                  <span>Lưu Cài Đặt Lịch</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSendNow}
              disabled={isSending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-75 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-emerald-600/20"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang gửi email...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi Email Ngay</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
