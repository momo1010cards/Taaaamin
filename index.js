const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// تحديد مسار ملف الجلسة - استخدام مسار من متغيرات البيئة أو المجلد الدائم
const SESSION_FILE_PATH = process.env.SESSION_FILE_PATH || '/app/data/whatsapp-session.json';
console.log(`📁 مسار ملف الجلسة: ${SESSION_FILE_PATH}`);

// التأكد من وجود المجلد الذي سيحتوي على ملف الجلسة
const sessionDir = path.dirname(SESSION_FILE_PATH);
if (!fs.existsSync(sessionDir)) {
  console.log(`📁 إنشاء مجلد الجلسة: ${sessionDir}`);
  fs.mkdirSync(sessionDir, { recursive: true });
}

let sessionData;

// التحقق من وجود ملف الجلسة
if (fs.existsSync(SESSION_FILE_PATH)) {
  try {
    const rawData = fs.readFileSync(SESSION_FILE_PATH);
    if (rawData.length > 0) {
      sessionData = JSON.parse(rawData);
      console.log('✅ تم قراءة بيانات الجلسة بنجاح');
    } else {
      console.log('⚠️ ملف الجلسة فارغ');
    }
  } catch (error) {
    console.error('❌ خطأ في قراءة ملف الجلسة:', error);
  }
}

// طباعة معلومات البيئة للتصحيح
console.log(`🔍 مسار Chromium: ${process.env.CHROMIUM_PATH || 'غير محدد'}`);
console.log(`🔍 بيئة التشغيل: ${process.env.NODE_ENV || 'development'}`);

// إعداد عميل WhatsApp مع الجلسة المحفوظة إذا كانت متوفرة
const client = new Client({
  session: sessionData,
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

// متغيرات للتحكم في حالة الاتصال وصورة QR Code
let qrCodeImageUrl = null;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;

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
  connectionRetries = 0;
  
  // حفظ بيانات الجلسة في ملف
  try {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
    console.log(`✅ تم حفظ بيانات الجلسة بنجاح في ${SESSION_FILE_PATH}`);
    
    // التحقق من حفظ الملف
    if (fs.existsSync(SESSION_FILE_PATH)) {
      const stats = fs.statSync(SESSION_FILE_PATH);
      console.log(`📊 حجم ملف الجلسة: ${stats.size} بايت`);
    }
  } catch (err) {
    console.error('❌ خطأ في حفظ بيانات الجلسة:', err);
  }
});

// التأكد من أن العميل جاهز
client.on('ready', () => {
  console.log('✅ عميل WhatsApp جاهز!');
  isConnected = true;
  connectionRetries = 0;
  // يمكن مسح صورة QR Code عند الاتصال
  qrCodeImageUrl = null;
});

// التعامل مع انقطاع الاتصال
client.on('disconnected', (reason) => {
  console.log('❌ تم قطع الاتصال بـ WhatsApp:', reason);
  isConnected = false;
  
  // محاولة إعادة الاتصال عدد محدود من المرات
  if (connectionRetries < MAX_RETRIES) {
    connectionRetries++;
    console.log(`🔄 محاولة إعادة الاتصال ${connectionRetries}/${MAX_RETRIES}...`);
    
    setTimeout(() => {
      client.initialize().catch(err => {
        console.error('❌ فشل في إعادة تهيئة عميل WhatsApp:', err);
      });
    }, 5000);
  } else {
    console.log('⚠️ تم تجاوز الحد الأقصى لمحاولات إعادة الاتصال');
    
    // حذف ملف الجلسة إذا كان موجوداً
    if (fs.existsSync(SESSION_FILE_PATH)) {
      try {
        fs.unlinkSync(SESSION_FILE_PATH);
        console.log('✅ تم حذف ملف الجلسة');
      } catch (err) {
        console.error('❌ خطأ في حذف ملف الجلسة:', err);
      }
    }
  }
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
    qrAvailable: qrCodeImageUrl !== null,
    sessionExists: fs.existsSync(SESSION_FILE_PATH),
    sessionPath: SESSION_FILE_PATH
  });
});

// API لإعادة تهيئة الاتصال
app.post('/reset', (req, res) => {
  try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      fs.unlinkSync(SESSION_FILE_PATH);
      console.log('✅ تم حذف ملف الجلسة');
    }
    
    isConnected = false;
    qrCodeImageUrl = null;
    connectionRetries = 0;
    
    // إعادة تهيئة العميل
    setTimeout(() => {
      client.initialize().catch(err => {
        console.error('❌ فشل في إعادة تهيئة عميل WhatsApp:', err);
      });
    }, 1000);
    
    res.json({ success: true, message: "تمت إعادة تهيئة الاتصال. يرجى مسح QR Code الجديد." });
  } catch (error) {
    console.error('❌ خطأ في إعادة تهيئة الاتصال:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// صفحة رئيسية محسنة
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
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
          color: #333;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          border-radius: 8px;
          margin-top: 30px;
        }
        header {
          text-align: center;
          margin-bottom: 30px;
        }
        h1 {
          color: #128C7E;
          margin: 0;
          padding: 0;
        }
        .status-container {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .status {
          padding: 15px;
          margin: 10px 0;
          border-radius: 5px;
          font-weight: bold;
          text-align: center;
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
          text-align: center;
          margin: 20px 0;
        }
        .btn {
          background-color: #128C7E;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          margin: 10px 0;
          display: inline-block;
        }
        .btn:hover {
          background-color: #075E54;
        }
        .btn-danger {
          background-color: #dc3545;
        }
        .btn-danger:hover {
          background-color: #c82333;
        }
        .actions {
          text-align: center;
          margin: 20px 0;
        }
        .debug-info {
          background-color: #f8f9fa;
          border: 1px solid #ddd;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          font-size: 12px;
          margin-top: 20px;
          max-height: 200px;
          overflow-y: auto;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6c757d;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>خدمة Taaaamin WhatsApp</h1>
          <p>واجهة لإرسال رسائل WhatsApp عبر API</p>
        </header>
        
        <div class="status-container">
          <h2>حالة الاتصال</h2>
          <div id="status" class="status">جاري التحقق من الحالة...</div>
        </div>
        
        <div id="qrcode"></div>
        
        <div class="actions">
          <button id="resetBtn" class="btn btn-danger" style="display: none;">إعادة تهيئة الاتصال</button>
        </div>
        
        <div id="debugInfo" class="debug-info" style="display: none;"></div>
        
        <div class="footer">
          <p>Taaaamin WhatsApp API &copy; 2025</p>
        </div>
      </div>
      
      <script>
        function checkStatus() {
          fetch('/status')
            .then(response => response.json())
            .then(data => {
              const statusDiv = document.getElementById('status');
              const qrcodeDiv = document.getElementById('qrcode');
              const resetBtn = document.getElementById('resetBtn');
              const debugInfo = document.getElementById('debugInfo');
              
              // عرض معلومات التصحيح
              debugInfo.style.display = 'block';
              debugInfo.innerHTML = '<h3>معلومات النظام</h3>' + 
                                   '<p>الاتصال: ' + (data.connected ? 'متصل' : 'غير متصل') + '</p>' +
                                   '<p>QR متاح: ' + (data.qrAvailable ? 'نعم' : 'لا') + '</p>' +
                                   '<p>ملف الجلسة موجود: ' + (data.sessionExists ? 'نعم' : 'لا') + '</p>' +
                                   '<p>مسار الجلسة: ' + data.sessionPath + '</p>';
              
              if (data.connected) {
                statusDiv.className = 'status connected';
                statusDiv.innerHTML = '✅ متصل بـ WhatsApp';
                qrcodeDiv.innerHTML = '<p>تم الاتصال بنجاح! يمكنك الآن استخدام API لإرسال الرسائل.</p>';
                resetBtn.style.display = 'inline-block';
              } else {
                statusDiv.className = 'status disconnected';
                statusDiv.innerHTML = '❌ غير متصل بـ WhatsApp';
                resetBtn.style.display = 'inline-block';
                
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
              document.getElementById('status').className = 'status disconnected';
              document.getElementById('status').textContent = '❌ خطأ في الاتصال بالخادم';
            });
        }
        
        // إعادة تهيئة الاتصال
        document.getElementById('resetBtn').addEventListener('click', function() {
          if (confirm('هل أنت متأكد من رغبتك في إعادة تهيئة الاتصال؟ سيتم قطع الاتصال الحالي.')) {
            fetch('/reset', { method: 'POST' })
              .then(response => response.json())
              .then(data => {
                alert(data.message);
                checkStatus();
              })
              .catch(error => {
                console.error('Error:', error);
                alert('حدث خطأ أثناء إعادة التهيئة');
              });
          }
        });
        
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
