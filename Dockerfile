# استخدم إصدار Node يحتوي على أدوات التثبيت اللازمة
FROM node:16-bullseye

# تحديد مجلد العمل داخل الحاوية
WORKDIR /app

# تثبيت التحديثات وأدوات النظام الأساسية
RUN apt-get update && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*  # تنظيف الكاش بعد التثبيت

# نسخ ملفات package.json وتثبيت الحزم
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps  # قد يساعد إذا كانت هناك مشاكل توافق في npm

# نسخ باقي الملفات إلى الحاوية
COPY . .

# الأوامر الافتراضية لتشغيل التطبيق
CMD ["npm", "start"]
