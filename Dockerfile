FROM node:24.15.0-alpine3.22 AS fnl_base_image
ENV PORT=8080
ENV NODE_ENV=production
WORKDIR /usr/src/app
RUN npm install -g npm@11.13.0
COPY package*.json ./
RUN npm ci
COPY  --chown=node:node . .
RUN npx prisma generate
EXPOSE 8080
CMD [ "node", "./bin/www" ]
