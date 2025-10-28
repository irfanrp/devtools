package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
)

type FormatRequest struct {
	Main   string `json:"main" binding:"required"`
	Vars   string `json:"variables"`
	Outs   string `json:"outputs"`
	Tfvars string `json:"tfvars"`
	Name   string `json:"name"`
}

func FormatAndZipHandler(c *gin.Context) {
	var req FormatRequest
	// Enforce maximum payload size to avoid resource exhaustion
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, getMaxPayloadBytes())
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "details": err.Error()})
		return
	}

	tmpDir, err := os.MkdirTemp("", "tfgen-")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create temp dir"})
		return
	}
	defer os.RemoveAll(tmpDir)

	// write files
	files := map[string]string{
		"main.tf":          req.Main,
		"variables.tf":     req.Vars,
		"outputs.tf":       req.Outs,
		"terraform.tfvars": req.Tfvars,
	}
	for name, content := range files {
		if content == "" {
			continue
		}
		if err := os.WriteFile(filepath.Join(tmpDir, name), []byte(content), 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write files"})
			return
		}
	}

	// run terraform fmt if terraform binary exists
	if _, err := exec.LookPath("terraform"); err == nil {
		fmt.Printf("Running terraform fmt in directory: %s\n", tmpDir)
		// run with a timeout context to avoid hanging processes
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "terraform", "fmt", "-recursive", "-list=true")
		cmd.Dir = tmpDir

		// Capture output for debugging
		output, err := cmd.CombinedOutput()
		fmt.Printf("Terraform fmt output: %s\n", string(output))

		if err != nil {
			// If context deadline exceeded, return a clear error
			if ctx.Err() == context.DeadlineExceeded {
				c.JSON(http.StatusGatewayTimeout, gin.H{"error": "terraform fmt timed out"})
				return
			}
			fmt.Printf("Terraform fmt error: %v\n", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("terraform fmt failed: %v - %s", err, string(output))})
			return
		}
		fmt.Println("Terraform fmt completed successfully")
	} else {
		// terraform not present; include a NOTICE file in the zip to inform user
		notice := "NOTICE: terraform binary not found in backend container; files are included unformatted. Install terraform in the backend image to enable formatting.\n"
		if err := os.WriteFile(filepath.Join(tmpDir, "README_FORMATTING.txt"), []byte(notice), 0644); err != nil {
			// non-fatal — continue
		}
	}

	// create zip
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	err = filepath.WalkDir(tmpDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(tmpDir, path)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		fw, err := zw.Create(rel)
		if err != nil {
			return err
		}
		if _, err := io.Copy(fw, f); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to zip files", "details": err.Error()})
		return
	}
	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize zip"})
		return
	}

	// Sanitize requested name to avoid header injection or path issues.
	zipName := "module.zip"
	if req.Name != "" {
		// allow letters, numbers, '-', '_' and '.' only; replace others with '-'
		re := regexp.MustCompile(`[^A-Za-z0-9._-]`)
		safe := re.ReplaceAllString(req.Name, "-")
		if safe == "" {
			safe = "module"
		}
		zipName = fmt.Sprintf("%s.zip", safe)
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", zipName))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
