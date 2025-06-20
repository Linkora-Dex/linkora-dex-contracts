FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache git python3 make g++ cairo-dev

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN chmod +x scripts/*.js

EXPOSE 8545 8546

CMD ["npm", "run", "node"]