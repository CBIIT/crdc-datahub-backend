FROM node:22.21.1-alpine3.23 AS fnl_base_image
ENV PORT 8080
ENV NODE_ENV production
WORKDIR /usr/src/app
RUN npm install -g npm@11.7.0
RUN npm install -g glob@10.5.0
COPY package*.json ./
RUN npm ci
COPY  --chown=node:node . .
RUN npx prisma generate
EXPOSE 8080
CMD [ "node", "./bin/www" ]
