FROM node:20-alpine
WORKDIR /app

# Install deps (cache package.json separately)
# Use `npm install` instead of `npm ci` so the image build doesn't fail
# when a lockfile (package-lock.json) isn't present in the repo.
COPY package*.json ./
RUN npm install --silent

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
