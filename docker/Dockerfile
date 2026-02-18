# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS workspace
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json firebase.json ./
COPY apps/web/package.json /app/apps/web/package.json
COPY functions/package.json /app/functions/package.json

RUN npm install
COPY . /app

FROM workspace AS web-build
ARG NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY=
ENV NEXT_PUBLIC_USE_FIREBASE_EMULATORS=${NEXT_PUBLIC_USE_FIREBASE_EMULATORS}
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
ENV NEXT_PUBLIC_FIREBASE_VAPID_KEY=${NEXT_PUBLIC_FIREBASE_VAPID_KEY}
RUN npm run build -w apps/web
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS web-prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=web-build /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM workspace AS web-local
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "apps/web", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM workspace AS firebase-local
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY docker/local-firebase-entrypoint.sh /usr/local/bin/local-firebase-entrypoint.sh
RUN chmod +x /usr/local/bin/local-firebase-entrypoint.sh
EXPOSE 4000 5001 8080 9099
CMD ["local-firebase-entrypoint.sh"]
