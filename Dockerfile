FROM node:24-alpine
WORKDIR /app
COPY package.json bot.mjs core.mjs schedule.mjs testing.mjs ./
RUN mkdir -p /app/data
CMD ["node", "bot.mjs"]
