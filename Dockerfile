FROM node:20.18.0-alpine3.20 AS fnl_base_image
ENV PORT 8080
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY  --chown=node:node . .
EXPOSE 8080
CMD [ "node", "./bin/www" ]
