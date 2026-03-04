# Stage 1: Build the React frontend
FROM node:20 AS builder
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Build client
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN cd client && npm install && npm run build

# Install server dependencies
RUN cd server && npm install

# Stage 2: Final Runtime Image
FROM node:20-slim
WORKDIR /app

# Install Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxshmfence1 libxtst6 lsb-release wget xdg-utils --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome for Puppeteer
RUN apt-get update && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy build results and server source
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server

# Persistence & Environment
RUN mkdir -p public/screenshots
ENV NODE_ENV=production
ENV PORT=5001
ENV CHROME_PATH=/usr/bin/google-chrome-stable

EXPOSE 5001

CMD ["node", "server/index.js"]
