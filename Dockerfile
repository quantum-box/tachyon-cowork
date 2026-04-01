# Stage 1: Build the Vite SPA
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY index.html vite.config.ts tsconfig*.json ./
COPY src/ src/

# Build args for VITE_ environment variables
ARG VITE_COGNITO_DOMAIN=https://auth-pool.n1.tachy.one
ARG VITE_COGNITO_CLIENT_ID=78a4raqiqns509aadtv7ftjmee
ARG VITE_COGNITO_REDIRECT_URI=https://cowork.txcloud.app/callback
ARG VITE_COGNITO_SCOPES=openid email profile
ARG VITE_API_BASE_URL=https://api.n1.tachy.one
ARG VITE_DEFAULT_TENANT_ID=tn_01hjryxysgey07h5jz5wagqj0m

RUN npx vite build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
