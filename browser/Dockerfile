# Argus Lens — Chromium + Playwright. Image tag matches package.json playwright version.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /lens
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.mjs ./
# pwuser ships with the Playwright image — never run Chromium as root.
USER pwuser
EXPOSE 7900 7901
CMD ["node", "server.mjs"]
