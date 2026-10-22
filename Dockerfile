FROM node:24-alpine
WORKDIR /app
COPY package.json bot.mjs core.mjs schedule.mjs testing.mjs billing.mjs forecast.mjs outlook-ai.mjs ./
COPY fixtures/ ./fixtures/
RUN mkdir -p /app/data
CMD ["node", "bot.mjs"]
