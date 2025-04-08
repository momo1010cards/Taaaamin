const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// إعداد عميل WhatsApp مع حفظ الجلسة
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session-data' // مجلد لحفظ بيانات الجلسة
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// متغير لتخزين QR Code
let qrCodeImageUrl = null;
let isClientReady = false;

// توليد QR Code
client.on('qr', async (qr) => {
  console.log("✅ QR Code generated. Generating image...");
  
  try {
    qrCodeImageUrl = await qrcode.toDataURL(qr);
    console.log("✅ QR Code image generated.");
  } catch (err) {
    console.error('❌ QR Code generation error:', err);
  }
});

// عند جاهزية العميل
client.on('ready', () => {
  isClientReady = true;
  console.log('✅ WhatsApp Client is ready!');
});

// عند فصل الاتصال
client.on('disconnected', (reason) => {
  isClientReady = false;
  console.log('❌ Client disconnected:', reason);
});

// API للتحقق من حالة الاتصال
app.get('/status', (req, res) => {
  res.json({ 
    ready: isClientReady,
    qrCode: qrCodeImageUrl ? true : false
  });
});

// API لإرسال رسالة
app.post('/send', async (req, res) => {
  if (!isClientReady) {
    return res.status(400).json({ 
      success: false, 
      error: "Client is not ready. Please scan QR code first." 
    });
  }

  const { phone, message } = req.body;

  if (!phone || !message) {  
    return res.status(400).json({ 
      success: false, 
      error: "Phone number and message are required!" 
    });  
  }

  try {  
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);  
    res.json({ 
      success: true, 
      message: "✅ Message sent successfully!" 
    });  
  } catch (error) {  
    console.error('❌ Send message error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });  
  }
});

// API لعرض QR Code
app.get('/qrcode', (req, res) => {
  if (!qrCodeImageUrl) {
    return res.status(404).json({ 
      success: false, 
      error: "QR Code not generated yet." 
    });
  }
  res.send(`<img src="${qrCodeImageUrl}" alt="QR Code" />`);
});

// تشغيل السيرفر والعميل
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  client.initialize().catch(err => {
    console.error('❌ Failed to initialize WhatsApp client:', err);
  });
});
