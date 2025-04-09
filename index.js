const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// إعداد حفظ الجلسة
const SESSION_FILE_PATH = './session.json';
let sessionData;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// إعداد عميل WhatsApp
const client = new Client({
    session: sessionData,
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || require('puppeteer').executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// متغير لتخزين QR Code كصورة
let qrCodeImageUrl = null;

// حفظ بيانات الجلسة عند المصادقة
client.on('authenticated', (session) => {
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), (err) => {
        if (err) {
            console.error('❌ خطأ في حفظ بيانات الجلسة:', err);
        } else {
            console.log('✅ تم حفظ بيانات الجلسة بنجاح');
        }
    });
});

// توليد QR Code كصورة
client.on('qr', async (qr) => {
    console.log("✅ QR Code generated. Generating image...");

    // إنشاء QR Code كصورة  
    const qrCodeImage = await qrcode.toDataURL(qr);  
    qrCodeImageUrl = qrCodeImage;  

    console.log("✅ QR Code image generated. Scan to login:");  
    console.log("QR Code is ready");
});

// التأكد من أن العميل جاهز
client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
});

// معالجة انقطاع الاتصال
client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp client disconnected:', reason);
    // حذف ملف الجلسة عند الانقطاع لإنشاء جلسة جديدة في المرة القادمة
    if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH);
        console.log('✅ تم حذف ملف الجلسة');
    }
    // إعادة تشغيل العميل (اختياري - قد يسبب مشاكل في بيئات الاستضافة)
    // client.initialize();
});

// API لإرسال رسالة
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {  
        return res.status(400).json({ success: false, error: "رقم الهاتف والرسالة مطلوبان!" });  
    }  

    try {  
        // تطبيق تنسيق رقم الهاتف
        const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        
        // التحقق من حالة الاتصال
        if (!client.info) {
            return res.status(503).json({ 
                success: false, 
                error: "WhatsApp غير متصل. يرجى مسح رمز QR أولاً." 
            });
        }

        await client.sendMessage(formattedPhone, message);  
        res.json({ success: true, message: "✅ تم إرسال الرسالة!" });  
    } catch (error) {  
        console.error('❌ خطأ في إرسال الرسالة:', error);
        res.status(500).json({ success: false, error: error.message });  
    }
});

// صفحة الترحيب والحالة
app.get('/', (req, res) => {
    res.send(`
    <html>
        <head>
            <title>WhatsApp API</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0; 
                    padding: 20px; 
                    text-align: center;
                }
                .container { 
                    max-width: 800px; 
                    margin: 0 auto; 
                }
                .status { 
                    padding: 10px; 
                    margin: 10px 0; 
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
            </style>
        </head>
        <body>
            <div class="container">
                <h1>واتساب API</h1>
                <div class="status ${client.info ? 'connected' : 'disconnected'}">
                    <strong>الحالة:</strong> ${client.info ? '✅ متصل' : '❌ غير متصل'}
                </div>
                <p>لمسح رمز QR، قم بزيارة <a href="/qrcode">/qrcode</a></p>
                <p>لإرسال رسالة، أرسل طلب POST إلى <code>/send</code> بالبيانات:</p>
                <pre>
{
    "phone": "رقم الهاتف",
    "message": "نص الرسالة"
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
        return res.status(404).send(`
            <html>
                <head>
                    <title>QR Code غير متوفر</title>
                    <meta http-equiv="refresh" content="10">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    </style>
                </head>
                <body>
                    <h2>رمز QR غير متوفر حالياً</h2>
                    <p>يتم توليد الرمز، يرجى الانتظار. ستتم إعادة تحميل الصفحة تلقائياً...</p>
                </body>
            </html>
        `);
    }
    
    if (client.info) {
        return res.send(`
            <html>
                <head>
                    <title>WhatsApp متصل</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #155724; background-color: #d4edda; padding: 15px; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <div class="success">
                        <h2>✅ تم الاتصال بواتساب بنجاح!</h2>
                        <p>يمكنك الآن استخدام API لإرسال الرسائل.</p>
                    </div>
                </body>
            </html>
        `);
    }
    
    res.send(`
        <html>
            <head>
                <title>WhatsApp QR Code</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                    .qr-container { margin: 20px auto; max-width: 300px; }
                </style>
            </head>
            <body>
                <h2>امسح رمز QR باستخدام تطبيق واتساب</h2>
                <div class="qr-container">
                    <img src="${qrCodeImageUrl}" alt="QR Code" style="width: 100%; height: auto;" />
                </div>
                <p>بعد المسح، سيتم تسجيل دخول الجلسة تلقائياً</p>
            </body>
        </html>
    `);
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
