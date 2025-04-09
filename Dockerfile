FROM node:18-bullseye

# تحديد مجلد العمل
WORKDIR /app

# تثبيت Chromium والمتطلبات الأخرى
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# تعيين متغيرات البيئة
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# نسخ ملفات package.json وتثبيت الحزم
COPY package*.json ./
RUN npm install --legacy-peer-deps

# نسخ باقي الملفات إلى الحاوية
COPY . .

# تحديد المنفذ
EXPOSE 8080

# تشغيل التطبيق
CMD ["npm", "start"]
