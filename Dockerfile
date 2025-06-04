FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN echo "PORT=5000\nDATABASE_URL=postgresql://postgres:Manoj8056%26@postgres:5432/bizsuite" > .env

# Add this after the COPY . . line in your backend Dockerfile
RUN sed -i 's/module.exports = pool/module.exports = { pool }/g' /app/utils/config/connectDB.js

EXPOSE 5000

CMD ["npm", "run", "dev"]