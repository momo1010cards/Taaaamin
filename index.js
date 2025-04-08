const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// تحديد مسار حفظ الجلسة
const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionData;

// التحقق من وجود ملف الجلسة
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// إعداد عميل WhatsApp مع خيار حفظ الجلسة
const client = new Client({
    session: sessionData,
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
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

// متغير لتخزين QR Code كصورة
let qrCodeImageUrl = null;
let isClientReady = false;

// توليد QR Code كصورة
client.on('qr', async (qr) => {
    console.log("✅ QR Code generated. Generating image...");
    
    try {
        // إنشاء QR Code كصورة  
        qrCodeImageUrl = await qrcode.toDataURL(qr);
        
        // حفظ الصورة في ملف لعرضها عبر الموقع
        const qrImagePath = path.join(__dirname, 'public', 'qrcode.html');
        if (!fs.existsSync(path.join(__dirname, 'public'))) {
            fs.mkdirSync(path.join(__dirname, 'public'));
        }
        
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            <meta http-equiv="refresh" content="30">
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                img { max-width: 300px; }
            </style>
        </head>
        <body>
            <h1>WhatsApp QR Code</h1>
            <p>Scan this QR code with your WhatsApp app</p>
            <img src="${qrCodeImageUrl}" alt="QR Code">
            <p>This page will refresh automatically every 30 seconds</p>
        </body>
        </html>
        `;
        
        fs.writeFileSync(qrImagePath, htmlContent);
        console.log("✅ QR Code image saved. Access it at /qrcode.html");
        
    } catch (err) {
        console.error('❌ Error generating QR code:', err);
    }
});

// حفظ بيانات الجلسة عند المصادقة
client.on('authenticated', (session) => {
    console.log('✅ AUTHENTICATED');
    sessionData = session;
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session), 'utf8');
});

// التأكد من أن العميل جاهز
client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
    isClientReady = true;
    // إنشاء صفحة تأكيد الجاهزية
    const readyPagePath = path.join(__dirname, 'public', 'ready.html');
    const readyContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Client Status</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
            .success { color: green; }
        </style>
    </head>
    <body>
        <h1 class="success">WhatsApp Client is Ready!</h1>
        <p>Your WhatsApp API is now ready to send messages.</p>
    </body>
    </html>
    `;
    fs.writeFileSync(readyPagePath, readyContent);
});

// معالجة حدث قطع الاتصال
client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp client disconnected:', reason);
    isClientReady = false;
    
    // حذف ملف الجلسة إذا تم قطع الاتصال
    if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH);
    }
    
    // إعادة تشغيل العميل بعد فترة
    setTimeout(() => {
        client.initialize().catch(err => {
            console.error('❌ Failed to reinitialize WhatsApp client:', err);
        });
    }, 5000);
});

// API لإرسال رسالة
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {  
        return res.status(400).json({ success: false, error: "رقم الهاتف والرسالة مطلوبان!" });  
    }
    
    if (!isClientReady) {
        return res.status(503).json({ success: false, error: "WhatsApp client is not ready. Please scan the QR code first." });
    }

    try {  
        // تنظيف رقم الهاتف من أي أحرف غير رقمية
        const cleanPhone = phone.toString().replace(/\D/g, '');
        console.log(`Attempting to send message to: ${cleanPhone}@c.us`);
        
        const result = await client.sendMessage(`${cleanPhone}@c.us`, message);
        console.log('Message sent successfully:', result);
        res.json({ success: true, message: "✅ تم إرسال الرسالة!" });  
    } catch (error) {  
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });  
    }
});

// صفحة الترحيب الرئيسية
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp API Service</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: #075e54; }
            .status { padding: 15px; margin-bottom: 20px; border-radius: 5px; }
            .ready { background-color: #dcf8c6; border: 1px solid #25d366; }
            .not-ready { background-color: #f8dcdc; border: 1px solid #d32525; }
            code { background-color: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>WhatsApp API Service</h1>
            <div class="status ${isClientReady ? 'ready' : 'not-ready'}">
                Status: ${isClientReady ? '✅ Ready to send messages' : '❌ Not Ready - Scan QR Code to authenticate'}
            </div>
            ${!isClientReady ? '<p>Please <a href="/qrcode.html">scan the QR code</a> to authenticate.</p>' : ''}
            <h2>How to use:</h2>
            <p>Send POST request to <code>/send</code> with the following JSON body:</p>
            <pre>
{
    "phone": "967737070012", // رقم الهاتف مع رمز الدولة بدون علامة +
    "message": "رسالة الاختبار"
}
            </pre>
        </div>
    </body>
    </html>
    `);
});

// API للحصول على QR Code كصورة
app.get('/qrcode', (req, res) => {
    if (!qrCodeImageUrl) {
        return res.status(404).json({ success: false, error: "QR Code not generated yet." });
    }
    res.send(`<img src="${qrCodeImageUrl}" alt="QR Code" />`);
});

// إضافة نقطة وصول للحالة
app.get('/status', (req, res) => {
    res.json({
        status: isClientReady ? 'ready' : 'waiting_for_qr_scan',
        qrAvailable: qrCodeImageUrl !== null
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// تهيئة العميل
client.initialize().catch(err => {
    console.error('❌ Failed to initialize WhatsApp client:', err);
});
