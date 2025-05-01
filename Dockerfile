FROM node:18-bullseye

WORKDIR /app

# تثبيت Chromium وجميع التبعيات اللازمة
RUN apt-get update && apt-get install -y \
chromium \
libatk-bridge2.0-0 \
libgtk-3-0 \
libnss3 \
libx11-xcb1 \
libxss1 \
libxtst6 \
fonts-noto-color-emoji \
fonts-noto \
fonts-freefont-ttf \
--no-install-recommends \
&& rm -rf /var/lib/apt/lists/*

# التحقق من وجود المتصفح وطباعة المسار
RUN which chromium || which chromium-browser || echo "Chromium not found in standard paths"
RUN ls -la /usr/bin/chromium* || echo "No chromium binaries in /usr/bin"

# تعيين متغيرات البيئة للمتصفح
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

# إنشاء مجلد دائم لتخزين بيانات الجلسة
RUN mkdir -p /app/data /app/sessions
VOLUME ["/app/data", "/app/sessions"]

# تعيين متغيرات البيئة
ENV PORT=8080
ENV SESSION_FILE_PATH=/app/data/whatsapp-session.json
ENV NODE_ENV=production

# نسخ ملفات package.json وتثبيت الحزم
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات إلى الحاوية
COPY . .

# الأوامر الافتراضية لتشغيل التطبيق
CMD ["npm", "start"]