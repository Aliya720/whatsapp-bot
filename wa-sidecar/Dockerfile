FROM node:20-slim

# Install Chromium and all required shared libraries for headless operation
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    fonts-noto-color-emoji \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
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
    wget \
    procps \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify chromium binary exists and print its version at build time
RUN chromium --version || chromium-browser --version

# Detect and export the real chromium binary path
RUN CHROMIUM_BIN=$(which chromium 2>/dev/null || which chromium-browser 2>/dev/null) \
    && echo "Found chromium at: $CHROMIUM_BIN" \
    && echo "export PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_BIN" >> /etc/environment

# Puppeteer env vars — skip downloading Chromium, use system one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DBUS_SESSION_BUS_ADDRESS=/dev/null

WORKDIR /app

COPY package.json package-lock.json* ./
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD prevents puppeteer from downloading its
# bundled Chromium (we use the system Chromium installed above). This also
# means the extract-zip code path (CVE: GHSA-jmr9-qjv8-65gv) never executes.
RUN npm install --omit=dev

COPY . .

# Sessions will be mounted as a Docker volume at /app/sessions
RUN mkdir -p /app/sessions

EXPOSE 3001

CMD ["node", "index.js"]
