# استخدم صورة Node الرسمية
FROM node:18-slim

# تثبيت الأدوات المطلوبة (لـ puppeteer)
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  chromium \
  --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

# إعداد مجلد العمل
WORKDIR /app

# نسخ ملفات الحزم فقط أولاً لتقليل إعادة التثبيت
COPY package*.json ./

# تثبيت الحزم
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات
COPY . .

# إعداد المتغير البيئي لمسار كروميوم
ENV CHROMIUM_PATH=/usr/bin/chromium

# تشغيل التطبيق
CMD ["node", "index.js"]
