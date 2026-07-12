FROM node:22-slim AS build
WORKDIR /app

# Corporate TLS-inspection proxies: drop your proxy's CA certificate(s) as
# .crt files into apps/web/build-cas/ before building (kept out of git).
# The directory ships empty; node ignores an empty extra-CA file.
COPY build-cas/ /tmp/build-cas/
RUN cat /tmp/build-cas/*.crt > /tmp/extra-cas.pem 2>/dev/null || touch /tmp/extra-cas.pem
ENV NODE_EXTRA_CA_CERTS=/tmp/extra-cas.pem

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
