FROM golang:1.20-alpine
WORKDIR /app
COPY go.mod go.sum ./
RUN apk add --no-cache git && go mod download
COPY . .
RUN go build -o /usr/local/bin/devformat-backend .
EXPOSE 8080
CMD ["/usr/local/bin/devformat-backend"]
