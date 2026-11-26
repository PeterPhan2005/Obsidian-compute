FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --workspace @obsidian/frontend
COPY frontend/scripts/prepare-recommendation-assets.mjs frontend/scripts/prepare-recommendation-assets.mjs
COPY frontend/src/recommendation-model.js frontend/src/recommendation-model.js
COPY frontend/third-party frontend/third-party
RUN npm run prepare:recommendations -w frontend
COPY frontend frontend
RUN npm run build -w frontend
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
