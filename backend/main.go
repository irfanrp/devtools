package main

import (
	"net/http"
	"os"

	"devformat/backend/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
	})

	api := r.Group("/api")
	{
		api.POST("/validate", handlers.ValidateHandler)
		api.POST("/fix", handlers.FixHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })

	_ = r.Run(":" + port)
}
