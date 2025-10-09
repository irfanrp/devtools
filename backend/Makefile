.PHONY: build run tidy test

build:
	go build -o bin/devformat .

run: build
	./bin/devformat

tidy:
	go mod tidy

test:
	go test ./...
