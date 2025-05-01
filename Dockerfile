# استخدام صورة Node.js الإصدار 18 على أساس Debian Bullseye
FROM node:18-bullseye

# تحديد مجلد العمل
WORKDIR /app

# تثبيت Chromium والتبعيات المطلوبة
RUN apt-get update && apt-get install -y \
chromium \
libatk-bridge2.0-0 \
libgtk-3-0 \
libnss3 \
libx11-xcb1 \
libxss1 \
libxtst6 \
libasound2 \
libgbm1 \
fonts-noto-color-emoji \
fonts-noto \
fonts-freefont-ttf \
--no-install-recommends \
&& rm -rf /var/lib/apt/lists/*

# تعيين متغيرات البيئة
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV DISPLAY=:99
ENV PORT=8080
ENV SESSION_FILE_PATH=/app/data/whatsapp-session.json
ENV NODE_ENV=production
ENV TZ=Asia/Riyadh

# التحقق من تثبيت Chromium
RUN echo "Chromium path: $(which chromium || which chromium-browser)" && \
ls -la /usr/bin/chromium* && \
chromium --version

# إنشاء مجلد للبيانات
RUN mkdir -p /app/data
VOLUME /app/data

# نسخ وتركيب التبعيات
COPY package*.json ./
RUN npm install --legacy-peer-deps

# نسخ ملفات التطبيق
COPY . .

# تعديل الصلاحيات
RUN chown -R node:node /app
USER node

# أمر التشغيل
CMD ["npm", "start"]