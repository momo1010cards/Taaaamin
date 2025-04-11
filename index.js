const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// تحديد مسار ملف الجلسة
const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionData;

// التحقق من وجود ملف الجلسة
if (fs.existsSync(SESSION_FILE_PATH)) {
  try {
    sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH));
  } catch (error) {
    console.error('❌ خطأ في قراءة ملف الجلسة:', error);
  }
}

// إعداد عميل WhatsApp مع الجلسة المحفوظة إذا كانت متوفرة
const client = new Client({
  session: sessionData,
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || require('puppeteer').executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// متغيرات للتحكم في حالة الاتصال وصورة QR Code
let qrCodeImageUrl = null;
let isConnected = false;

// توليد QR Code كصورة
client.on('qr', async (qr) => {
  console.log("✅ تم إنشاء QR Code. جاري إنشاء الصورة...");
  isConnected = false;
  
  try {
    // إنشاء QR Code كصورة  
    qrCodeImageUrl = await qrcode.toDataURL(qr);  
    console.log("✅ تم إنشاء صورة QR Code. استخدم الرابط التالي للمسح:");  
  } catch (error) {
    console.error('❌ خطأ في إنشاء QR Code:', error);
  }
});

// حفظ بيانات الجلسة عند المصادقة
client.on('authenticated', (session) => {
  console.log('✅ تمت المصادقة بنجاح!');
  sessionData = session;
  
  // حفظ بيانات الجلسة في ملف
  fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), (err) => {
    if (err) {
      console.error('❌ خطأ في حفظ بيانات الجلسة:', err);
    } else {
      console.log('✅ تم حفظ بيانات الجلسة بنجاح');
    }
  });
});

// التأكد من أن العميل جاهز
client.on('ready', () => {
  console.log('✅ عميل WhatsApp جاهز!');
  isConnected = true;
  // يمكن مسح صورة QR Code عند الاتصال
  qrCodeImageUrl = null;
});

// التعامل مع انقطاع الاتصال
client.on('disconnected', (reason) => {
  console.log('❌ تم قطع الاتصال بـ WhatsApp:', reason);
  isConnected = false;
  
  // حذف ملف الجلسة
  if (fs.existsSync(SESSION_FILE_PATH)) {
    fs.unlinkSync(SESSION_FILE_PATH);
    console.log('✅ تم حذف ملف الجلسة');
  }
  
  // إعادة تهيئة العميل بعد فترة قصيرة
  setTimeout(() => {
    console.log('🔄 جاري إعادة الاتصال...');
    client.initialize();
  }, 5000);
});

// API لإرسال رسالة
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {  
    return res.status(400).json({ success: false, error: "رقم الهاتف والرسالة مطلوبان!" });  
  }
  
  if (!isConnected) {
    return res.status(503).json({ success: false, error: "WhatsApp غير متصل. يرجى مسح QR Code أولاً." });
  }

  try {  
    // تنظيف رقم الهاتف من أي أحرف غير رقمية
    const cleanPhone = phone.toString().replace(/[^\d]/g, '');
    await client.sendMessage(`${cleanPhone}@c.us`, message);  
    console.log(`✅ تم إرسال رسالة إلى ${cleanPhone}`);
    res.json({ success: true, message: "✅ تم إرسال الرسالة!" });  
  } catch (error) {  
    console.error('❌ خطأ في إرسال الرسالة:', error);
    res.status(500).json({ success: false, error: error.message });  
  }
});

// API للحصول على QR Code كصورة
app.get('/qrcode', (req, res) => {
  if (!qrCodeImageUrl) {
    return res.status(404).json({ success: false, error: "QR Code غير متوفر حالياً." });
  }
  res.send(`<img src="${qrCodeImageUrl}" alt="QR Code" />`);
});

// API للتحقق من حالة الاتصال
app.get('/status', (req, res) => {
  res.json({
    success: true,
    connected: isConnected,
    qrAvailable: qrCodeImageUrl !== null
  });
});

// صفحة رئيسية بسيطة
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>خدمة Taaaamin WhatsApp</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          text-align: center;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
        }
        .status {
          padding: 10px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .connected {
          background-color: #d4edda;
          color: #155724;
        }
        .disconnected {
          background-color: #f8d7da;
          color: #721c24;
        }
        #qrcode {
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>خدمة Taaaamin WhatsApp</h1>
        <div id="status" class="status">جاري التحقق من الحالة...</div>
        <div id="qrcode"></div>
      </div>
      <script>
        function checkStatus() {
          fetch('/status')
            .then(response => response.json())
            .then(data => {
              const statusDiv = document.getElementById('status');
              const qrcodeDiv = document.getElementById('qrcode');
              
              if (data.connected) {
                statusDiv.className = 'status connected';
                statusDiv.textContent = '✅ متصل بـ WhatsApp';
                qrcodeDiv.innerHTML = '';
              } else {
                statusDiv.className = 'status disconnected';
                statusDiv.textContent = '❌ غير متصل بـ WhatsApp';
                
                if (data.qrAvailable) {
                  fetch('/qrcode')
                    .then(response => response.text())
                    .then(html => {
                      qrcodeDiv.innerHTML = '<h3>امسح رمز QR للاتصال</h3>' + html;
                    });
                } else {
                  qrcodeDiv.innerHTML = '<p>جاري إنشاء رمز QR...</p>';
                }
              }
            })
            .catch(error => {
              console.error('Error:', error);
            });
        }
        
        // التحقق من الحالة كل 5 ثوانٍ
        checkStatus();
        setInterval(checkStatus, 5000);
      </script>
    </body>
    </html>
  `);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 تم تشغيل السيرفر على المنفذ ${PORT}`);
});

// تهيئة العميل
client.initialize().catch(err => {
  console.error('❌ فشل في تهيئة عميل WhatsApp:', err);
});
