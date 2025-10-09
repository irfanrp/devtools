package main

import (
	"net/http"
	"os"

	"devformat/backend/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// CORS middleware - handle all CORS including OPTIONS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Register routes directly instead of using groups
	r.POST("/api/validate", handlers.ValidateHandler)
	r.POST("/api/fix", handlers.FixHandler)
	r.POST("/api/format-zip", handlers.FormatAndZipHandler)
	r.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	_ = r.Run(":" + port)
}
