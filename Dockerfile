FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY content ./content
COPY dist ./dist
COPY build-data.mjs build-solutions.mjs build-diagrams.mjs verify-site.mjs ./
RUN npm run build && npm run check

FROM node:24-alpine AS runtime
ARG VCS_REF=local
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/PaiMonCai/study-econ" \
      org.opencontainers.image.title="Study Econ - RUC 802" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.version="$VERSION"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --chown=node:node serve.mjs access.mjs http-utils.mjs server-data.mjs ./
COPY --from=build --chown=node:node /src/content ./content
COPY --from=build --chown=node:node /src/dist ./dist
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "serve.mjs"]
