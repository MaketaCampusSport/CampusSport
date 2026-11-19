# One image, three uses: API (default), worker (`node dist/worker.js`) and the database CLIs
# (`node dist/database/cli/migrate.js up`, `seed.js`, `enroll-totp.js <email>`).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# The worker overrides the command; its healthcheck is set in docker-compose.yml.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
