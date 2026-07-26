FROM node:24-bookworm-slim AS builder
WORKDIR /app

ARG VITE_BACKEND_URL

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --frozen-lockfile

COPY frontend/ .
RUN VITE_BACKEND_URL=${VITE_BACKEND_URL} npm run build

FROM nginx:stable-bookworm
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/frontend-default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
