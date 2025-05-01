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
libasound2 \
libgbm1 \
fonts-noto-color-emoji \
fonts-noto \
fonts-freefont-ttf \
--no-install-recommends \
&& rm -rf /var/lib/apt/lists/*

# تعيين متغيرات البيئة للمتصفح
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV DISPLAY=:99

# التحقق من وجود المتصفح وطباعة المسار
RUN echo "Chromium path: $(which chromium || which chromium-browser)" && \
ls -la /usr/bin/chromium* && \
chromium --version

# إنشاء مجلد دائم لتخزين بيانات الجلسة
RUN mkdir -p /app/data
VOLUME /app/data

# تعيين متغيرات البيئة
ENV PORT=8080
ENV SESSION_FILE_PATH=/app/data/whatsapp-session.json
ENV NODE_ENV=production
ENV TZ=Asia/Riyadh # تعيين المنطقة الزمنية

# نسخ ملفات package.json وتثبيت الحزم
COPY package*.json ./
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات إلى الحاوية
COPY . .

# تخصيص صلاحيات المجلد
RUN chown -R node:node /app
USER node

# الأوامر الافتراضية لتشغيل التطبيق
CMD ["npm", "start"]