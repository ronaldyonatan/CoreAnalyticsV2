# ==========================================
# Stage 1 - Build React / Vite
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

COPY . .

RUN npm run build


# ==========================================
# Stage 2 - Nginx
# ==========================================
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
