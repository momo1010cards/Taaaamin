# استخدم إصدار Node يحتوي على أدوات التثبيت اللازمة
FROM node:16-bullseye

# تحديد مجلد العمل داخل الحاوية
WORKDIR /app

# تثبيت التحديثات وأدوات النظام الأساسية
RUN apt-get update && apt-get install -y \
    chromium \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*  # تنظيف الكاش بعد التثبيت

# إنشاء مجلد للبيانات المؤقتة والتأكد من الصلاحيات
RUN mkdir -p /app/public /app/temp /tmp/puppeteer_cache \
    && chmod -R 777 /tmp/puppeteer_cache /app/public /app/temp

# تعيين المتغيرات البيئية لـ Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/tmp/puppeteer_cache

# نسخ ملفات package.json وتثبيت الحزم
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps  # استخدام خيار legacy-peer-deps لتجنب مشاكل التوافق

# نسخ باقي الملفات إلى الحاوية
COPY . .

# التأكد من أن المستخدم لديه صلاحيات على المجلدات
RUN chmod -R 777 /app

# التعرض للمنفذ الذي يستمع عليه التطبيق
EXPOSE 8080

# الأوامر الافتراضية لتشغيل التطبيق
CMD ["npm", "start"]
