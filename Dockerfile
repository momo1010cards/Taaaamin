FROM node:18-bullseye

WORKDIR /app

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

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=8080
ENV NODE_ENV=production
ENV TZ=Asia/Riyadh

RUN echo "Chromium path: $(which chromium || which chromium-browser)" && \
chromium --version || echo "Chromium not found!"

RUN mkdir -p /app/data
VOLUME /app/data

COPY package*.json ./
RUN npm ci --production --legacy-peer-deps

COPY . .

RUN chown -R node:node /app
RUN chmod -R 755 /app
USER node

CMD ["npm", "start"]