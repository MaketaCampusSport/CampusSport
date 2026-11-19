# Build-ul de producție al PWA (fără serverul simulat), servit static de Caddy.
# În stiva din rădăcină (../docker-compose.yml), ../docker/caddy/Caddyfile înlocuiește configurarea de mai jos
# și adaugă proxy-ul /api spre server, HTTPS automat și Keycloak.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=build /app/dist /srv
# Implicit: fișiere statice + fallback SPA pe :80 (util pentru a testa imaginea singură).
RUN printf ':80 {\n\troot * /srv\n\ttry_files {path} /index.html\n\tfile_server\n}\n' > /etc/caddy/Caddyfile
EXPOSE 80 443
