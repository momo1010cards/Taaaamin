FROM node:18-bullseye

WORKDIR /app

# تثبيت Chromium والتبعيات
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

# التحقق من وجود Chromium
RUN which chromium || which chromium-browser || echo "Chromium not found"
RUN ls -la /usr/bin/chromium* || echo "No chromium binaries in /usr/bin"

# إنشاء رابط رمزي لضمان التوافق
RUN ln -sf /usr/bin/chromium /usr/bin/chromium-browser

# تعيين متغيرات البيئة
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=8080
ENV NODE_ENV=production

# نسخ ملفات package.json وتثبيت الحزم
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات
COPY . .

# الأوامر الافتراضية
CMD ["npm", "start"]