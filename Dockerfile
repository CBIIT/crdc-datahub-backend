FROM node:16.17.0
ENV PORT 8080
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY  --chown=node:node . .
EXPOSE 8080
CMD [ "node", "./bin/www" ]
