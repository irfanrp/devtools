package ai

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// CallGeminiSuggest contacts configured Gemini/Generative endpoints and
// attempts to extract a short YAML snippet suggestion. It returns nil when
// no suggestion could be obtained.
func CallGeminiSuggest(content string) []map[string]any {
	explicitEndpoint := strings.TrimSpace(getEnv("GEMINI_ENDPOINT", ""))
	apiKey := strings.TrimSpace(getEnv("GEMINI_API_KEY", getEnv("GOOGLE_API_KEY", "")))
	model := strings.TrimSpace(getEnv("GEMINI_MODEL", "gemini-2.5-flash"))

	prompt := fmt.Sprintf("Input YAML:\n---\n%s\n---\n\nPlease return a minimal YAML snippet (only the corrected block) that fixes the syntax/indentation issue. Include no extra commentary. Respond in YAML only.", content)

	tryRequest := func(url string, body []byte, useKeyQuery bool) (string, error) {
		reqURL := url
		if useKeyQuery && apiKey != "" {
			if strings.Contains(reqURL, "?") {
				reqURL = reqURL + "&key=" + apiKey
			} else {
				reqURL = reqURL + "?key=" + apiKey
			}
		}
		req, err := http.NewRequest("POST", reqURL, strings.NewReader(string(body)))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		if apiKey != "" && !useKeyQuery {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
		client := &http.Client{Timeout: 8 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			b, _ := io.ReadAll(resp.Body)
			return "", fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
		}
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}

	// If explicit endpoint and key present, try that first
	if explicitEndpoint != "" && apiKey != "" {
		payload := map[string]any{"model": model, "prompt": prompt, "max_tokens": 512}
		b, _ := json.Marshal(payload)
		body, err := tryRequest(explicitEndpoint, b, false)
		if err == nil && strings.TrimSpace(body) != "" {
			suggested := strings.TrimSpace(body)
			lines := strings.Split(preprocessYAML(content), "\n")
			first := 1
			firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
			for i, l := range lines {
				if strings.Contains(l, firstLineCandidate) {
					first = i + 1
					break
				}
			}
			return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
		}
	}

	if apiKey == "" {
		return nil
	}

	candidates := []string{
		fmt.Sprintf("https://generativelanguage.googleapis.com/v1/models/%s:generateText", model),
		fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta2/models/%s:generateText", model),
		fmt.Sprintf("https://api.generativeai.google/v1/models/%s:generateText", model),
		fmt.Sprintf("https://api.generativeai.google/v1beta2/models/%s:generateText", model),
		fmt.Sprintf("https://gemini.googleapis.com/v1/models/%s:generateText", model),
	}

	payloadVariants := [][]byte{}
	v1, _ := json.Marshal(map[string]any{"model": model, "prompt": prompt, "max_tokens": 512})
	payloadVariants = append(payloadVariants, v1)
	v2, _ := json.Marshal(map[string]any{"input": prompt, "maxOutputTokens": 512})
	payloadVariants = append(payloadVariants, v2)
	v3, _ := json.Marshal(map[string]any{"prompt": prompt, "maxOutputTokens": 512})
	payloadVariants = append(payloadVariants, v3)

	for _, ep := range candidates {
		for _, payload := range payloadVariants {
			body, err := tryRequest(ep, payload, false)
			if err != nil {
				body, err = tryRequest(ep, payload, true)
			}
			if err != nil {
				log.Printf("CallGeminiSuggest: endpoint %s failed: %v", ep, err)
				continue
			}
			if strings.TrimSpace(body) == "" {
				continue
			}

			var parsed any
			if jerr := json.Unmarshal([]byte(body), &parsed); jerr == nil {
				if m, ok := parsed.(map[string]any); ok {
					if cands, ok := m["candidates"].([]any); ok && len(cands) > 0 {
						first := cands[0]
						if fm, ok := first.(map[string]any); ok {
							for _, k := range []string{"content", "output", "text", "message"} {
								if v, ok := fm[k].(string); ok && strings.TrimSpace(v) != "" {
									suggested := strings.TrimSpace(v)
									lines := strings.Split(preprocessYAML(content), "\n")
									firstLine := 1
									firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
									for i, l := range lines {
										if strings.Contains(l, firstLineCandidate) {
											firstLine = i + 1
											break
										}
									}
									return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": firstLine, "endLine": firstLine + len(strings.Split(suggested, "\n")) - 1}}
								}
							}
						}
					}
					if txt, ok := m["output"].(string); ok && strings.TrimSpace(txt) != "" {
						suggested := strings.TrimSpace(txt)
						lines := strings.Split(preprocessYAML(content), "\n")
						first := 1
						firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
						for i, l := range lines {
							if strings.Contains(l, firstLineCandidate) {
								first = i + 1
								break
							}
						}
						return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
					}
					if txt, ok := m["text"].(string); ok && strings.TrimSpace(txt) != "" {
						suggested := strings.TrimSpace(txt)
						lines := strings.Split(preprocessYAML(content), "\n")
						first := 1
						firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
						for i, l := range lines {
							if strings.Contains(l, firstLineCandidate) {
								first = i + 1
								break
							}
						}
						return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
					}
				}
			}

			suggested := strings.TrimSpace(body)
			if suggested != "" {
				lines := strings.Split(preprocessYAML(content), "\n")
				first := 1
				firstLineCandidate := strings.SplitN(suggested, "\n", 2)[0]
				for i, l := range lines {
					if strings.Contains(l, firstLineCandidate) {
						first = i + 1
						break
					}
				}
				return []map[string]any{{"shortDescription": "AI suggested fix (Gemini)", "confidence": "high", "fixedSnippet": suggested, "startLine": first, "endLine": first + len(strings.Split(suggested, "\n")) - 1}}
			}
		}
	}

	return nil
}

// getEnv reads environment variable or returns default
func getEnv(k, def string) string {
	if v, ok := os.LookupEnv(k); ok {
		return v
	}
	return def
}

// preprocessYAML normalizes whitespace (internal helper)
func preprocessYAML(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", "  ")
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t")
	}
	return strings.Join(lines, "\n")
}
