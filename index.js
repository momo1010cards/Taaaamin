const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
app.use(express.json());

// متغير لتخزين بيانات الجلسة
let sessionData;

// تحميل الجلسة من متغير البيئة
if (process.env.WHATSAPP_SESSION) {
    try {
        sessionData = JSON.parse(process.env.WHATSAPP_SESSION);
        console.log('✅ تم تحميل بيانات الجلسة من متغير البيئة');
    } catch (error) {
        console.error('❌ خطأ في تحميل بيانات الجلسة:', error);
    }
}

// إعداد عميل WhatsApp
const client = new Client({
    session: sessionData,
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// متغيرات للتحكم
let qrCodeImageUrl = null;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;

// API للحصول على رمز الاقتران (Pairing Code)
app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
    }
    try {
        const cleanPhone = phone.toString().replace(/[^\d]/g, '');
        console.log(`✅ جاري طلب رمز الاقتران للرقم: ${cleanPhone}`);
        const pairingCode = await client.requestPairingCode(cleanPhone);
        console.log(`✅ رمز الاقتران: ${pairingCode}`);
        res.json({ success: true, pairingCode, message: 'أدخل رمز الاقتران في تطبيق WhatsApp' });
    } catch (error) {
        console.error('❌ خطأ في طلب رمز الاقتران:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// معالجة QR Code (احتياطي)
client.on('qr', async (qr) => {
    console.log('✅ تم إنشاء QR Code');
    isConnected = false;
    try {
        qrCodeImageUrl = await qrcode.toDataURL(qr);
        console.log('✅ تم إنشاء صورة QR Code');
    } catch (error) {
        console.error('❌ خطأ في إنشاء QR Code:', error);
    }
});

// حفظ الجلسة عند المصادقة
client.on('authenticated', (session) => {
    console.log('✅ تمت المصادقة بنجاح!');
    sessionData = session;
    console.log('✅ بيانات الجلسة:');
    console.log(JSON.stringify(session));
    console.log('⚠️ انسخ البيانات أعلاه وحدّث متغير البيئة WHATSAPP_SESSION في Render');
});

// التأكد من أن العميل جاهز
client.on('ready', () => {
    console.log('✅ عميل WhatsApp جاهز!');
    isConnected = true;
    connectionRetries = 0;
    qrCodeImageUrl = null;
});

// التعامل مع انقطاع الاتصال
client.on('disconnected', (reason) => {
    console.log('❌ تم قطع الاتصال:', reason);
    isConnected = false;
    if (connectionRetries < MAX_RETRIES) {
        connectionRetries++;
        console.log(`🔄 محاولة إعادة الاتصال ${connectionRetries}/${MAX_RETRIES}...`);
        setTimeout(() => {
            client.initialize().catch(err => {
                console.error('❌ فشل في إعادة التهيئة:', err);
            });
        }, 5000);
    } else {
        console.log('⚠️ تجاوز الحد الأقصى لمحاولات إعادة الاتصال');
    }
});

// API لإرسال رسالة
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف والرسالة مطلوبان' });
    }
    if (!isConnected) {
        return res.status(503).json({ success: false, error: 'WhatsApp غير متصل' });
    }
    try {
        const cleanPhone = phone.toString().replace(/[^\d]/g, '');
        await client.sendMessage(`${cleanPhone}@c.us`, message);
        console.log(`✅ تم إرسال رسالة إلى ${cleanPhone}`);
        res.json({ success: true, message: '✅ تم إرسال الرسالة' });
    } catch (error) {
        console.error('❌ خطأ في إرسال الرسالة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API للحصول على QR Code
app.get('/qrcode', (req, res) => {
    if (!qrCodeImageUrl) {
        return res.status(404).json({ success: false, error: 'QR Code غير متوفر' });
    }
    res.send(`<img src="${qrCodeImageUrl}" alt="QR Code" />`);
});

// API للتحقق من الحالة
app.get('/status', (req, res) => {
    res.json({
        success: true,
        connected: isConnected,
        qrAvailable: qrCodeImageUrl !== null,
        sessionExists: !!sessionData
    });
});

// API لإعادة التهيئة
app.post('/reset', (req, res) => {
    try {
        isConnected = false;
        qrCodeImageUrl = null;
        connectionRetries = 0;
        sessionData = null;
        client.initialize().catch(err => {
            console.error('❌ فشل في إعادة التهيئة:', err);
        });
        res.json({ success: true, message: 'تمت إعادة التهيئة. استخدم رمز الاقتران أو QR Code جديد' });
    } catch (error) {
        console.error('❌ خطأ في إعادة التهيئة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API لعرض بيانات الجلسة
app.get('/get-session', (req, res) => {
    if (!sessionData) {
        return res.status(404).send('لا توجد جلسة نشطة');
    }
    res.setHeader('Content-Type', 'text/plain');
    res.send(JSON.stringify(sessionData));
});

// API لتشخيص الجلسة
app.get('/debug-session', (req, res) => {
    res.json({
        hasSession: sessionData !== null,
        sessionDataType: typeof sessionData,
        sessionDataKeys: sessionData ? Object.keys(sessionData) : [],
        sessionDataSize: sessionData ? JSON.stringify(sessionData).length : 0,
        isConnected: isConnected,
        qrAvailable: qrCodeImageUrl !== null
    });
});

// صفحة رئيسية
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ar">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Taaaamin WhatsApp</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; color: #333; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; background-color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 8px; margin-top: 30px; }
            header { text-align: center; margin-bottom: 30px; }
            h1 { color: #128C7E; margin: 0; padding: 0; }
            .status-container { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
            .status { padding: 15px; margin: 10px 0; border-radius: 5px; font-weight: bold; text-align: center; }
            .connected { background-color: #d4edda; color: #155724; }
            .disconnected { background-color: #f8d7da; color: #721c24; }
            #qrcode, #pairing { text-align: center; margin: 20px 0; }
            .btn { background-color: #128C7E; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; display: inline-block; }
            .btn:hover { background-color: #075E54; }
            .btn-danger { background-color: #dc3545; }
            .btn-danger:hover { background-color: #c82333; }
            .actions { text-align: center; margin: 20px 0; }
            .session-data { background-color: #f8f9fa; border: 1px solid #ddd; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; margin-top: 20px; max-height: 200px; overflow-y: auto; display: none; }
            .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 14px; }
            input { padding: 10px; width: 200px; margin: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <header><h1>Taaaamin WhatsApp</h1></header>
            <div class="status-container">
                <h2>حالة الاتصال</h2>
                <div id="status" class="status">جاري التحقق...</div>
            </div>
            <div id="pairing">
                <h3>تسجيل برقم الهاتف</h3>
                <input type="text" id="phone" placeholder="أدخل رقم الهاتف (مثال: 966123456789)" />
                <button class="btn" onclick="requestPairingCode()">طلب رمز الاقتران</button>
                <div id="pairingCode"></div>
            </div>
            <div id="qrcode"></div>
            <div class="actions">
                <button id="resetBtn" class="btn btn-danger" style="display: none;">إعادة تهيئة</button>
                <button id="showSessionBtn" class="btn" style="display: none;">عرض بيانات الجلسة</button>
                <a href="/get-session" target="_blank" id="directSessionBtn" class="btn" style="display: none;">بيانات الجلسة مباشرة</a>
                <a href="/debug-session" target="_blank" id="debugBtn" class="btn" style="display: none;">معلومات التشخيص</a>
            </div>
            <div id="sessionData" class="session-data"></div>
            <div class="footer"><p>Taaaamin WhatsApp API © 2025</p></div>
        </div>
        <script>
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
                            qrcodeDiv.innerHTML = '<p>تم الاتصال بنجاح!</p>';
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
                        document.getElementById('status').textContent = '❌ خطأ في الاتصال';
                    });
            }

            function requestPairingCode() {
                const phone = document.getElementById('phone').value;
                if (!phone) {
                    alert('يرجى إدخال رقم الهاتف');
                    return;
                }
                fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            document.getElementById('pairingCode').innerHTML = `<p><strong>رمز الاقتران:</strong> ${data.pairingCode}</p><p>أدخل هذا الرمز في تطبيق WhatsApp</p>`;
                        } else {
                            alert(data.error);
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        alert('حدث خطأ أثناء طلب رمز الاقتران');
                    });
            }

            document.getElementById('resetBtn').addEventListener('click', function() {
                if (confirm('هل أنت متأكد من إعادة التهيئة؟')) {
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

            document.getElementById('showSessionBtn').addEventListener('click', function() {
                fetch('/get-session')
                    .then(response => response.text())
                    .then(data => {
                        const sessionDataDiv = document.getElementById('sessionData');
                        sessionDataDiv.style.display = 'block';
                        sessionDataDiv.innerHTML = '<h3>بيانات الجلسة</h3>' +
                            '<p>انسخ هذه البيانات وأضفها إلى متغير البيئة WHATSAPP_SESSION في Render:</p>' +
                            '<textarea readonly style="width: 100%; height: 100px;">' + data + '</textarea>' +
                            '<p><strong>ملاحظة:</strong> بعد تحديث المتغير، أعد نشر التطبيق.</p>';
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        alert('حدث خطأ أثناء جلب بيانات الجلسة');
                    });
            });

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
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
});

// تهيئة العميل
client.initialize().catch(err => {
    console.error('❌ فشل في تهيئة العميل:', err);
});