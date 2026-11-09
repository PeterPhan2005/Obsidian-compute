FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @obsidian/backend --omit=dev
COPY backend backend
COPY worker worker
CMD ["node", "backend/src/server.js"]
