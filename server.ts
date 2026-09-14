import express from 'express';
import path from 'path';
import nodemailer, { type Transporter } from 'nodemailer';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Check SMTP server configuration status
  app.get('/api/smtp-status', (req, res) => {
    const envUser = process.env.SMTP_USER || process.env.GMAIL_USER;
    const envPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    const configured = Boolean(envUser && envPass);

    res.json({
      configured,
      user: envUser ? envUser.trim() : null,
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
    });
  });

  // Direct Send Email Report Endpoint - Thực hiện gửi thư thực sự
  app.post('/api/send-email-report', async (req, res) => {
    try {
      const { email, emails, subject, htmlContent, textSummary, senderName, customSmtp } = req.body;

      // 1. Phân tích danh sách email nhận (hỗ trợ nhiều email cùng lúc)
      const rawRecipients: string[] = [];
      if (Array.isArray(emails)) {
        rawRecipients.push(...emails);
      }
      if (typeof email === 'string') {
        rawRecipients.push(...email.split(/[,;\n\r\t ]+/));
      } else if (Array.isArray(email)) {
        rawRecipients.push(...email);
      }

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      const validRecipients: string[] = [];
      for (const item of rawRecipients) {
        const clean = String(item).trim().toLowerCase();
        if (clean && emailRegex.test(clean) && !validRecipients.includes(clean)) {
          validRecipients.push(clean);
        }
      }

      if (validRecipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Vui lòng nhập ít nhất một địa chỉ email nhận hợp lệ (ví dụ: hoannx.epu@gmail.com).',
        });
      }

      console.log(`[Email Dispatcher] Yêu cầu gửi tới ${validRecipients.length} hòm thư:`, validRecipients);

      // 2. Xác định thông tin tài khoản SMTP gửi thư
      const smtpUser = (customSmtp?.user || process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
      const smtpPass = (customSmtp?.pass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, '');
      const smtpHost = (customSmtp?.host || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
      const smtpPort = Number(customSmtp?.port) || Number(process.env.SMTP_PORT) || (smtpHost.includes('gmail') ? 465 : 587);
      const smtpSecure = customSmtp?.secure !== undefined ? Boolean(customSmtp.secure) : (process.env.SMTP_SECURE === 'true' || smtpPort === 465);
      const fromDisplayName = senderName || process.env.SMTP_FROM_NAME || 'Tháp Tài Sản 3 Tầng';

      // 3. Nếu chưa cấu hình thông tin gửi email thật: BÁO RÕ RÀNG để người dùng không bị nhầm lẫn
      if (!smtpUser || !smtpPass) {
        console.warn('[Email Dispatcher] Chưa cấu hình SMTP_USER và SMTP_PASS');
        return res.status(400).json({
          success: false,
          requiresConfig: true,
          error: 'CHƯA_CẤU_HÌNH_SMTP',
          message: 'Chưa cấu hình Mật khẩu ứng dụng Gmail (App Password 16 ký tự). Thư thật chưa thể gửi tới hòm thư Gmail của bạn.',
          recipients: validRecipients,
          guidance: {
            title: 'Các bước 1 phút để gửi thư thật về Gmail của bạn:',
            steps: [
              '1. Truy cập https://myaccount.google.com/apppasswords (bật Xác minh 2 bước nếu chưa bật)',
              '2. Đặt tên ứng dụng là "Tháp Tài Sản" rồi bấm Tạo (Create)',
              '3. Google sẽ cấp cho bạn Mật khẩu ứng dụng gồm 16 chữ cái (ví dụ: abcd efgh ijkl mnop)',
              '4. Nhập email và mật khẩu 16 chữ cái này vào mục "Cấu hình gửi email thật" hoặc khai báo biến môi trường SMTP_USER / SMTP_PASS'
            ],
          },
        });
      }

      // 4. Khởi tạo kết nối SMTP thật sự với Google / Mail Server
      const transporter: Transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      console.log(`[Email Dispatcher] Đang gửi thư thật qua ${smtpHost}:${smtpPort} (Sender: ${smtpUser})...`);

      const sendResult = await transporter.sendMail({
        from: `"${fromDisplayName}" <${smtpUser}>`,
        to: validRecipients,
        subject: subject || 'Báo Cáo & Nhắc Nhở Mục Tiêu Tài Chính',
        text: textSummary,
        html: htmlContent,
      });

      console.log('[Email Dispatcher] Gửi thư thật thành công! Message ID:', sendResult.messageId);

      return res.json({
        success: true,
        message: `Đã gửi báo cáo tài chính thật thành công tới ${validRecipients.length} hòm thư (${validRecipients.join(', ')})! Vui lòng kiểm tra hộp thư đến.`,
        details: {
          recipients: validRecipients,
          sender: smtpUser,
          subject,
          dispatchedAt: new Date().toISOString(),
          sentVia: 'gmail_smtp',
          messageId: sendResult.messageId,
        },
      });
    } catch (error: any) {
      console.error('[Email Dispatcher] Lỗi trong quá trình gửi email thật:', error);

      let userFriendlyError = error?.message || 'Có lỗi xảy ra khi kết nối máy chủ gửi email.';
      if (
        userFriendlyError.includes('EAUTH') ||
        userFriendlyError.includes('535') ||
        userFriendlyError.includes('Username and Password not accepted')
      ) {
        userFriendlyError =
          'Google từ chối đăng nhập (Mã lỗi 535): Vui lòng kiểm tra lại: Bạn cần dùng "Mật khẩu ứng dụng" (App Password 16 ký tự) tạo tại https://myaccount.google.com/apppasswords, KHÔNG dùng mật khẩu đăng nhập tài khoản Google thông thường.';
      } else if (userFriendlyError.includes('ETIMEDOUT') || userFriendlyError.includes('ECONNREFUSED')) {
        userFriendlyError = 'Không thể kết nối đến máy chủ SMTP. Vui lòng kiểm tra lại cấu hình cổng mạng (Port 465 / 587) hoặc kết nối internet.';
      }

      return res.status(500).json({
        success: false,
        error: userFriendlyError,
        rawError: error?.message,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
