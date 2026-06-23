FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

CMD ["bash", "-lc", "Xvfb :99 -screen 0 1280x720x24 >/tmp/xvfb.log 2>&1 & export DISPLAY=:99; npm run test:e2e"]
