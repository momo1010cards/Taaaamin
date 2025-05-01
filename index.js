const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// طباعة معلومات البيئة للتصحيح
console.log(`🔍 مسار Chromium: ${process.env.CHROMIUM_PATH || 'غير محدد'}`);
console.log(`🔍 بيئة التشغيل: ${process.env.NODE_ENV || 'development'}`);

// إعداد عميل WhatsApp مع استخدام LocalAuth للتخزين المحلي للجلسة
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-sessions' // مسار حفظ بيانات الجلسة
  }),
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
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/4.4.1.html', // تحديث النسخة حسب الحاجة
  }
});

// متغيرات للتحكم في حالة الاتصال وصورة QR Code
let qrCodeImageUrl = null;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;
let sessionInfo = null;

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
  connectionRetries = 0;
  console.log('✅ تم تخزين بيانات الجلسة محلياً');
});

// التأكد من أن العميل جاهز
client.on('ready', async () => {
  console.log('✅ عميل WhatsApp جاهز!');
  isConnected = true;
  connectionRetries = 0;
  qrCodeImageUrl = null;
  
  try {
    // الحصول على معلومات الجلسة
    const info = await client.getWid();
    const phoneNumber = info.user;
    const clientInfo = await client.info;
    sessionInfo = {
      phoneNumber: phoneNumber,
      name: clientInfo ? clientInfo.pushname : 'غير متوفر',
      platform: clientInfo ? clientInfo.platform : 'غير متوفر',
      connected: true
    };
    console.log(`✅ متصل برقم: ${phoneNumber}`);
  } catch (err) {
    console.error('❌ خطأ في الحصول على معلومات الحساب:', err);
    sessionInfo = { error: 'فشل في الحصول على معلومات الحساب', connected: true };
  }
});

// التعامل مع انقطاع الاتصال
client.on('disconnected', (reason) => {
  console.log('❌ تم قطع الاتصال بـ WhatsApp:', reason);
  isConnected = false;
  sessionInfo = null;
  
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
    sessionInfo: sessionInfo
  });
});

// API لإعادة تهيئة الاتصال
app.post('/reset', (req, res) => {
  try {
    isConnected = false;
    qrCodeImageUrl = null;
    connectionRetries = 0;
    sessionInfo = null;
    
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

// API لتسجيل الدخول برقم الهاتف (الطريقة الجديدة)
app.post('/login-phone', async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({ success: false, error: "رقم الهاتف مطلوب" });
  }
  
  try {
    // ايقاف أي جلسة حالية
    if (isConnected) {
      await client.logout();
      isConnected = false;
      sessionInfo = null;
    }
    
    // تنظيف رقم الهاتف
    const cleanPhone = phone.toString().replace(/[^\d]/g, '');
    console.log(`🔄 محاولة تسجيل الدخول برقم الهاتف: ${cleanPhone}`);
    
    // إعادة تهيئة العميل للسماح بتسجيل الدخول بالطريقة الجديدة
    qrCodeImageUrl = null;
    client.initialize().catch(err => {
      console.error('❌ فشل في تهيئة عميل WhatsApp:', err);
      return res.status(500).json({ success: false, error: err.message });
    });
    
    res.json({ success: true, message: "تم بدء عملية تسجيل الدخول. انتظر ظهور QR Code في حالة الحاجة لمسحه." });
  } catch (error) {
    console.error('❌ خطأ في عملية تسجيل الدخول:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API لحذف الجلسة الحالية
app.post('/logout', async (req, res) => {
  try {
    if (isConnected) {
      await client.logout();
      console.log('✅ تم تسجيل الخروج بنجاح');
    }
    
    isConnected = false;
    qrCodeImageUrl = null;
    sessionInfo = null;
    
    // محاولة حذف ملفات الجلسة من المسار المحدد
    const sessionPath = './whatsapp-sessions';
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmdirSync(sessionPath, { recursive: true });
        console.log('✅ تم حذف ملفات الجلسة بنجاح');
      } catch (err) {
        console.error('❌ خطأ في حذف ملفات الجلسة:', err);
      }
    }
    
    res.json({ success: true, message: "تم تسجيل الخروج وحذف بيانات الجلسة بنجاح." });
  } catch (error) {
    console.error('❌ خطأ في عملية تسجيل الخروج:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API للتشخيص
app.get('/debug-session', (req, res) => {
  res.json({
    isConnected: isConnected,
    qrAvailable: qrCodeImageUrl !== null,
    sessionInfo: sessionInfo,
    authStrategy: client.authStrategy ? client.authStrategy.constructor.name : 'غير محدد',
    retries: connectionRetries,
    sessionPath: './whatsapp-sessions',
    sessionExists: fs.existsSync('./whatsapp-sessions')
  });
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
          margin-bottom: 30px;
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
          margin: 10px 5px;
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
        .login-form {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          display: none;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input[type="text"] {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 16px;
        }
        .session-info {
          background-color: #f8f9fa;
          border: 1px solid #ddd;
          padding: 20px;
          border-radius: 5px;
          margin-top: 20px;
        }
        .session-info h3 {
          margin-top: 0;
          color: #128C7E;
        }
        .session-info p {
          margin: 5px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6c757d;
          font-size: 14px;
        }
        .tab-container {
          margin: 20px 0;
        }
        .tab-buttons {
          display: flex;
          border-bottom: 1px solid #ddd;
        }
        .tab-button {
          padding: 10px 20px;
          cursor: pointer;
          background-color: #f8f9fa;
          border: 1px solid #ddd;
          border-bottom: none;
          border-radius: 5px 5px 0 0;
          margin-right: 5px;
        }
        .tab-button.active {
          background-color: #128C7E;
          color: white;
          border-color: #128C7E;
        }
        .tab-content {
          display: none;
          padding: 20px;
          border: 1px solid #ddd;
          border-top: none;
          border-radius: 0 0 5px 5px;
        }
        .tab-content.active {
          display: block;
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
          <div id="sessionInfo"></div>
        </div>
        
        <div class="tab-container">
          <div class="tab-buttons">
            <div class="tab-button active" onclick="openTab('qrTab')">تسجيل الدخول بـ QR</div>
            <div class="tab-button" onclick="openTab('phoneTab')">تسجيل الدخول برقم الهاتف</div>
            <div class="tab-button" onclick="openTab('testTab')">اختبار الرسائل</div>
          </div>
          
          <div id="qrTab" class="tab-content active">
            <div id="qrcode">
              <p>جاري التحقق من حالة الاتصال...</p>
            </div>
          </div>
          
          <div id="phoneTab" class="tab-content">
            <h3>تسجيل الدخول برقم الهاتف</h3>
            <p>أدخل رقم الهاتف بصيغة دولية، مثال: 966555555555</p>
            
            <div class="form-group">
              <label for="phoneNumber">رقم الهاتف:</label>
              <input type="text" id="phoneNumber" placeholder="أدخل رقم الهاتف بصيغة دولية" />
            </div>
            
            <button id="loginBtn" class="btn">تسجيل الدخول</button>
            <p id="loginStatus"></p>
          </div>
          
          <div id="testTab" class="tab-content">
            <h3>اختبار إرسال رسالة</h3>
            
            <div class="form-group">
              <label for="testPhone">رقم الهاتف المستقبل:</label>
              <input type="text" id="testPhone" placeholder="أدخل رقم الهاتف بصيغة دولية" />
            </div>
            
            <div class="form-group">
              <label for="testMessage">الرسالة:</label>
              <textarea id="testMessage" rows="3" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;"></textarea>
            </div>
            
            <button id="sendTestBtn" class="btn">إرسال رسالة اختبارية</button>
            <p id="testStatus"></p>
          </div>
        </div>
        
        <div class="actions">
          <button id="resetBtn" class="btn">إعادة تهيئة الاتصال</button>
          <button id="logoutBtn" class="btn btn-danger">تسجيل الخروج</button>
          <a href="/debug-session" target="_blank" id="debugBtn" class="btn">معلومات التشخيص</a>
        </div>
        
        <div class="footer">
          <p>Taaaamin WhatsApp API &copy; 2025</p>
        </div>
      </div>
      
      <script>
        function openTab(tabId) {
          // إخفاء جميع علامات التبويب
          const tabContents = document.getElementsByClassName('tab-content');
          for (let i = 0; i < tabContents.length; i++) {
            tabContents[i].classList.remove('active');
          }
          
          // إلغاء تنشيط جميع أزرار التبويب
          const tabButtons = document.getElementsByClassName('tab-button');
          for (let i = 0; i < tabButtons.length; i++) {
            tabButtons[i].classList.remove('active');
          }
          
          // تنشيط التبويب المطلوب
          document.getElementById(tabId).classList.add('active');
          
          // العثور على الزر المناسب وتنشيطه
          const buttons = document.getElementsByClassName('tab-button');
          for (let i = 0; i < buttons.length; i++) {
            if (buttons[i].getAttribute('onclick').includes(tabId)) {
              buttons[i].classList.add('active');
            }
          }
        }
        
        function checkStatus() {
          fetch('/status')
            .then(response => response.json())
            .then(data => {
              const statusDiv = document.getElementById('status');
              const qrcodeDiv = document.getElementById('qrcode');
              const sessionInfoDiv = document.getElementById('sessionInfo');
              
              if (data.connected) {
                statusDiv.className = 'status connected';
                statusDiv.innerHTML = '✅ متصل بـ WhatsApp';
                qrcodeDiv.innerHTML = '<p>تم الاتصال بنجاح! يمكنك الآن استخدام API لإرسال الرسائل.</p>';
                
                // عرض معلومات الجلسة
                if (data.sessionInfo) {
                  sessionInfoDiv.innerHTML = '<div class="session-info">' +
                    '<h3>معلومات الجلسة</h3>' +
                    '<p><strong>رقم الهاتف:</strong> ' + (data.sessionInfo.phoneNumber || 'غير متوفر') + '</p>' +
                    '<p><strong>الاسم:</strong> ' + (data.sessionInfo.name || 'غير متوفر') + '</p>' +
                    '<p><strong>المنصة:</strong> ' + (data.sessionInfo.platform || 'غير متوفر') + '</p>' +
                    '</div>';
                } else {
                  sessionInfoDiv.innerHTML = '';
                }
              } else {
                statusDiv.className = 'status disconnected';
                statusDiv.innerHTML = '❌ غير متصل بـ WhatsApp';
                sessionInfoDiv.innerHTML = '';
                
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
        
        // تسجيل الخروج
        document.getElementById('logoutBtn').addEventListener('click', function() {
          if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج وحذف بيانات الجلسة؟')) {
            fetch('/logout', { method: 'POST' })
              .then(response => response.json())
              .then(data => {
                alert(data.message);
                checkStatus();
              })
              .catch(error => {
                console.error('Error:', error);
                alert('حدث خطأ أثناء تسجيل الخروج');
              });
          }
        });
        
        // تسجيل الدخول برقم الهاتف
        document.getElementById('loginBtn').addEventListener('click', function() {
          const phoneNumber = document.getElementById('phoneNumber').value.trim();
          const statusElement = document.getElementById('loginStatus');
          
          if (!phoneNumber) {
            statusElement.innerHTML = '⚠️ يرجى إدخال رقم الهاتف';
            return;
          }
          
          statusElement.innerHTML = '🔄 جاري تسجيل الدخول...';
          
          fetch('/login-phone', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone: phoneNumber })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              statusElement.innerHTML = '✅ ' + data.message;
              // الانتقال إلى تبويب QR لعرض QR Code إذا كان ضرورياً
              openTab('qrTab');
            } else {
              statusElement.innerHTML = '❌ ' + (data.error || 'حدث خطأ غير معروف');
            }
            // التحقق من الحالة بعد تسجيل الدخول
            setTimeout(checkStatus, 2000);
          })
          .catch(error => {
            console.error('Error:', error);
            statusElement.innerHTML = '❌ حدث خطأ في الاتصال بالخادم';
          });
        });
        
        // إرسال رسالة اختبارية
        document.getElementById('sendTestBtn').addEventListener('click', function() {
          const phone = document.getElementById('testPhone').value.trim();
          const message = document.getElementById('testMessage').value.trim();
          const statusElement = document.getElementById('testStatus');
          
          if (!phone || !message) {
            statusElement.innerHTML = '⚠️ يرجى إدخال رقم الهاتف والرسالة';
            return;
          }
          
          statusElement.innerHTML = '🔄 جاري إرسال الرسالة...';
          
          fetch('/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone, message })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              statusElement.innerHTML = '✅ ' + data.message;
            } else {
              statusElement.innerHTML = '❌ ' + (data.error || 'حدث خطأ غير معروف');
            }
          })
          .catch(error => {
            console.error('Error:', error);
            statusElement.innerHTML = '❌ حدث خطأ في الاتصال بالخادم';
          });
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