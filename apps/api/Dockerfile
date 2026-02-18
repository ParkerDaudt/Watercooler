FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN echo "shamefully-hoist=true" > .npmrc && pnpm install --no-frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN chmod +x entrypoint.sh
EXPOSE 3001
CMD ["sh", "entrypoint.sh"]
