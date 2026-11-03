FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY web ./web
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/server.mjs"]
