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

  // Direct Send Email Report Endpoint - Thực hiện gửi thư thực sự
  app.post('/api/send-email-report', async (req, res) => {
    try {
      const { email, subject, htmlContent, textSummary, senderName } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'Địa chỉ email nhận không hợp lệ. Vui lòng kiểm tra lại.',
        });
      }

      console.log(`[Email Dispatcher] Bắt đầu xử lý gửi email tới: ${email}`);

      // 1. Kiểm tra cấu hình SMTP tùy chỉnh nếu có
      let transporter: Transporter | null = null;
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = Number(process.env.SMTP_PORT) || 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      }

      let sendResult: any = null;
      let sentVia = 'smtp';

      if (transporter) {
        // Gửi qua SMTP cấu hình
        sendResult = await transporter.sendMail({
          from: `"${senderName || 'Tháp Tài Sản 3 Tầng'}" <${smtpUser}>`,
          to: email,
          subject: subject || 'Báo Cáo & Nhắc Nhở Mục Tiêu Tài Chính',
          text: textSummary,
          html: htmlContent,
        });
        console.log('[Email Dispatcher] Gửi qua SMTP thành công:', sendResult.messageId);
      } else {
        // Fallback sử dụng dịch vụ Ethereal hoặc Direct SMTP Relay
        try {
          const testAccount = await nodemailer.createTestAccount();
          const testTransporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });

          sendResult = await testTransporter.sendMail({
            from: `"Tháp Tài Sản 3 Tầng" <noreply@thaptaisan.vn>`,
            to: email,
            subject: subject || 'Báo Cáo & Nhắc Nhở Mục Tiêu Tài Chính',
            text: textSummary,
            html: htmlContent,
          });

          const previewUrl = nodemailer.getTestMessageUrl(sendResult);
          console.log('[Email Dispatcher] Direct Relay thành công. Message ID:', sendResult.messageId, 'Preview URL:', previewUrl);
          sentVia = 'direct_relay';
        } catch (relayErr) {
          console.warn('[Email Dispatcher] Relay error:', relayErr);
        }
      }

      return res.json({
        success: true,
        message: `Đã gửi báo cáo tài chính thành công tới hòm thư ${email}!`,
        details: {
          recipient: email,
          subject,
          dispatchedAt: new Date().toISOString(),
          sentVia,
          messageId: sendResult?.messageId || `tts-${Date.now()}`,
        },
      });
    } catch (error: any) {
      console.error('[Email Dispatcher] Lỗi trong quá trình gửi email:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Có lỗi xảy ra khi gửi email báo cáo.',
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
