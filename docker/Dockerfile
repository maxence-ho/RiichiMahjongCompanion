FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json firebase.json .firebaserc ./
COPY apps/web/package.json /app/apps/web/package.json
COPY functions/package.json /app/functions/package.json

RUN npm ci

COPY . /app

RUN npm run build:functions && npm run build -w apps/web

EXPOSE 3000 4000 5001 8080 9099
