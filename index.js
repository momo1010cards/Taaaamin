const { Client, LocalAuth, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إنشاء مجلد للجلسات إذا لم يكن موجوداً
const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// متغير لتخزين بيانات الجلسة
let sessionData;
let qrCodeImageUrl = null;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;
let client = null;

// استرداد الجلسة من متغير البيئة إذا كانت متوفرة
if (process.env.WHATSAPP_SESSION) {
  try {
    sessionData = JSON.parse(process.env.WHATSAPP_SESSION);
    console.log('✅ تم استرداد بيانات الجلسة من متغير البيئة');
  } catch (error) {
    console.error('❌ خطأ في قراءة بيانات الجلسة من متغير البيئة:', error);
  }
}

// طباعة معلومات البيئة للتصحيح
console.log(`🔍 مسار Chromium: ${process.env.CHROMIUM_PATH || 'غير محدد'}`);
console.log(`🔍 بيئة التشغيل: ${process.env.NODE_ENV || 'development'}`);

// دالة لإنشاء عميل WhatsApp
function createClient(useSession = true) {
  // إغلاق العميل الحالي إذا كان موجوداً
  if (client) {
    try {
      client.destroy();
    } catch (error) {
      console.error('❌ خطأ في إغلاق العميل السابق:', error);
    }
  }

  // إعداد خيارات العميل
  const clientOptions = {
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
  };

  // تحديد طريقة المصادقة
  if (useSession && sessionData) {
    // استخدام الجلسة المخزنة
    clientOptions.session = sessionData;
    clientOptions.authStrategy = new NoAuth();
    console.log('✅ استخدام بيانات الجلسة المخزنة');
  } else {
    // استخدام المصادقة المحلية (تخزين الجلسات في ملفات)
    clientOptions.authStrategy = new LocalAuth({ clientId: 'taaaamin-whatsapp', dataPath: SESSION_DIR });
    console.log('✅ استخدام المصادقة المحلية');
  }

  // إنشاء العميل
  client = new Client(clientOptions);

  // إعداد أحداث العميل
  setupClientEvents();

  return client;
}

// إعداد أحداث العميل
function setupClientEvents() {
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

    // طباعة بيانات الجلسة بتنسيق واضح للنسخ
    console.log('✅ بيانات الجلسة:');
    console.log(JSON.stringify(session));

    console.log('⚠️ يجب تحديث متغير البيئة WHATSAPP_SESSION يدوياً باستخدام القيمة أعلاه');
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
    }
  });
}

// إنشاء العميل الأولي
client = createClient();

// طريقة جديدة للتسجيل برقم الهاتف
app.post('/register-phone', async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: "رقم الهاتف مطلوب!" });
  }
  
  try {
    // إنشاء عميل جديد بدون استخدام الجلسات الحالية
    client = createClient(false);
    
    // إعادة تعيين المتغيرات
    isConnected = false;
    qrCodeImageUrl = null;
    sessionData = null;
    
    // تهيئة العميل
    await client.initialize();
    
    return res.json({ 
      success: true, 
      message: "تم بدء عملية التسجيل. يرجى مسح رمز QR الجديد عندما يظهر." 
    });
  } catch (error) {
    console.error('❌ خطأ في بدء عملية التسجيل:', error);
    return res.status(500).json({ success: false, error: error.message });
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
    sessionExists: !!sessionData,
    authStrategy: client?.authStrategy?.constructor?.name || 'غير معروف'
  });
});

// API لإعادة تهيئة الاتصال
app.post('/reset', (req, res) => {
  try {
    isConnected = false;
    qrCodeImageUrl = null;
    connectionRetries = 0;
    sessionData = null;

    // إعادة تهيئة العميل
    client = createClient(false);
    
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

// API لعرض بيانات الجلسة الحالية بتنسيق نصي للنسخ المباشر
app.get('/get-session', (req, res) => {
  if (!sessionData) {
    return res.status(404).send('لا توجد جلسة نشطة. يرجى مسح رمز QR أولاً.');
  }

  // إرجاع بيانات الجلسة كنص عادي للنسخ المباشر
  res.setHeader('Content-Type', 'text/plain');
  res.send(JSON.stringify(sessionData));
});

// API لعرض بيانات الجلسة الحالية (للنسخ اليدوي)
app.get('/session', (req, res) => {
  if (!sessionData) {
    return res.status(404).json({ success: false, error: "لا توجد جلسة نشطة" });
  }

  res.json({
    success: true,
    message: "يمكنك نسخ هذه البيانات وتحديث متغير البيئة WHATSAPP_SESSION في Render",
    session: JSON.stringify(sessionData)
  });
});

// API للتشخيص
app.get('/debug-session', (req, res) => {
  res.json({
    hasSession: sessionData !== null,
    sessionDataType: typeof sessionData,
    sessionDataKeys: sessionData ? Object.keys(sessionData) : [],
    sessionDataSize: sessionData ? JSON.stringify(sessionData).length : 0,
    isConnected: isConnected,
    qrAvailable: qrCodeImageUrl !== null,
    authStrategy: client?.authStrategy?.constructor?.name || 'غير معروف',
    sessionDir: SESSION_DIR,
    sessionFiles: fs.existsSync(SESSION_DIR) ? fs.readdirSync(SESSION_DIR) : []
  });
});

// صفحة رئيسية محسنة مع دعم التسجيل برقم الهاتف
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html dir="rtl" lang="ar">
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
        .session-data {
            background-color: #f8f9fa;
            border: 1px solid #ddd;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            margin-top: 20px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #6c757d;
            font-size: 14px;
        }
        .register-form {
            background-color: #f0f8ff;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }
        .register-form input {
            padding: 10px;
            margin: 10px 5px;
            border-radius: 5px;
            border: 1px solid #ddd;
            width: 60%;
            font-size: 16px;
            text-align: center;
        }
        .tabs {
            display: flex;
            justify-content: center;
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 20px;
            background-color: #f0f0f0;
            cursor: pointer;
            border-radius: 5px 5px 0 0;
            margin: 0 5px;
        }
        .tab.active {
            background-color: #128C7E;
            color: white;
        }
        .tab-content {
            display: none;
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

        <div class="tabs">
            <div class="tab active" data-tab="qr-auth">التسجيل بواسطة QR</div>
            <div class="tab" data-tab="phone-auth">التسجيل برقم الهاتف</div>
        </div>

        <div class="tab-content active" id="qr-auth">
            <div class="status-container">
                <h2>حالة الاتصال</h2>
                <div id="status" class="status">جاري التحقق من الحالة...</div>
            </div>
            <div id="qrcode"></div>
        </div>

        <div class="tab-content" id="phone-auth">
            <div class="register-form">
                <h2>التسجيل برقم الهاتف</h2>
                <p>أدخل رقم الهاتف لبدء عملية التسجيل</p>
                <form id="phoneForm">
                    <input type="text" id="phoneNumber" placeholder="أدخل رقم الهاتف (مثال: 9665xxxxxxxx)" required>
                    <button type="submit" class="btn">بدء التسجيل</button>
                </form>
            </div>
        </div>

        <div class="actions">
            <button id="resetBtn" class="btn btn-danger" style="display: none;">إعادة تهيئة الاتصال</button>
            <button id="showSessionBtn" class="btn" style="display: none;">عرض بيانات الجلسة</button>
            <a href="/get-session" target="_blank" id="directSessionBtn" class="btn" style="display: none;">عرض بيانات الجلسة مباشرة</a>
            <a href="/debug-session" target="_blank" id="debugBtn" class="btn" style="display: none;">معلومات التشخيص</a>
        </div>
        <div id="sessionData" class="session-data"></div>
        <div class="footer">
            <p>Taaaamin WhatsApp API &copy; 2025</p>
        </div>
    </div>

    <script>
        // التبديل بين التبويبات
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                // إزالة الفئة النشطة من جميع التبويبات
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // إضافة الفئة النشطة للتبويب المحدد
                this.classList.add('active');
                document.getElementById(this.dataset.tab).classList.add('active');
            });
        });

        // التسجيل برقم الهاتف
        document.getElementById('phoneForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!phoneNumber) {
                alert('يرجى إدخال رقم الهاتف');
                return;
            }
            
            fetch('/register-phone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(data.message);
                    // تبديل إلى تبويب QR
                    document.querySelector('.tab[data-tab="qr-auth"]').click();
                    checkStatus();
                } else {
                    alert('حدث خطأ: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('حدث خطأ أثناء محاولة التسجيل');
            });
        });

        function checkStatus() {
            fetch('/status')
                .then(response => response.json())
                .then(data => {
                    const statusDiv = document.getElementById('status');
                    const qrcodeDiv = document.getElementById('qrcode');
                    const resetBtn = document.getElementById('resetBtn');
                    const showSessionBtn = document.getElementById('showSessionBtn');
                    const directSessionBtn = document.getElementById('directSessionBtn');
                    const debugBtn = document.getElementById('debugBtn');

                    if (data.connected) {
                        statusDiv.className = 'status connected';
                        statusDiv.innerHTML = '✅ متصل بـ WhatsApp';
                        qrcodeDiv.innerHTML = '<p>تم الاتصال بنجاح! يمكنك الآن استخدام API لإرسال الرسائل.</p>';
                        resetBtn.style.display = 'inline-block';
                        showSessionBtn.style.display = 'inline-block';
                        directSessionBtn.style.display = 'inline-block';
                        debugBtn.style.display = 'inline-block';
                    } else {
                        statusDiv.className = 'status disconnected';
                        statusDiv.innerHTML = '❌ غير متصل بـ WhatsApp';
                        resetBtn.style.display = 'inline-block';
                        showSessionBtn.style.display = data.sessionExists ? 'inline-block' : 'none';
                        directSessionBtn.style.display = data.sessionExists ? 'inline-block' : 'none';
                        debugBtn.style.display = 'inline-block';

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

        // عرض بيانات الجلسة
        document.getElementById('showSessionBtn').addEventListener('click', function() {
            fetch('/session')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const sessionDataDiv = document.getElementById('sessionData');
                        sessionDataDiv.style.display = 'block';
                        sessionDataDiv.innerHTML = '<h3>بيانات الجلسة</h3>' +
                            '<p>انسخ هذه البيانات وأضفها كمتغير بيئة WHATSAPP_SESSION في Render:</p>' +
                            '<textarea readonly style="width: 100%; height: 100px;">' + data.session + '</textarea>' +
                            '<p><strong>ملاحظة:</strong> بعد تحديث متغير البيئة، يجب إعادة تشغيل التطبيق لتطبيق التغييرات.</p>';
                    } else {
                        alert(data.error);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('حدث خطأ أثناء جلب بيانات الجلسة');
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