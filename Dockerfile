FROM node:16-bullseye

WORKDIR /app

# تثبيت التبعيات المطلوبة لـ Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=8080

# إنشاء مجلد لبيانات الجلسة
RUN mkdir -p /app/session-data

CMD ["npm", "start"]
