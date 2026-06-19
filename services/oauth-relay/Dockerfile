# syntax=docker/dockerfile:1
# Dependency-free public OAuth callback relay — no pnpm, no build, builds in seconds.
FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3003 TZ=Europe/Amsterdam
RUN groupadd --system nodejs && useradd --system --gid nodejs relay
COPY server.js ./server.js
USER relay
EXPOSE 3003
CMD ["node", "server.js"]
