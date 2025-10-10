#!/bin/bash

# Test script for Gemini AI integration
# Make sure the backend server is running first: make run

echo "🧪 Testing Gemini AI Integration"
echo "================================"

# Check if API key is set
if [ -z "$GEMINI_API_KEY" ] && [ -z "$GOOGLE_API_KEY" ]; then
    echo "❌ Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set"
    echo "📝 Get your API key from: https://aistudio.google.com/app/apikey"
    echo "💡 Then export GEMINI_API_KEY=your-api-key-here"
    exit 1
fi

# Test invalid YAML that should trigger AI suggestions
INVALID_YAML='apiVersion: v1
kind: Service
  name: my-service
  namespace: default
spec:
  selector:
app: my-app
  ports:
  - port: 80
    targetPort: 8080'

echo "🔍 Testing validation with AI suggestions..."
echo "📄 Input YAML (intentionally malformed):"
echo "$INVALID_YAML"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:8080/api/validate \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"$INVALID_YAML\",
    \"useAI\": true,
    \"schema\": \"kubernetes\"
  }")

echo "📊 Server Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if we got suggestions
HAS_SUGGESTIONS=$(echo "$RESPONSE" | jq '.suggestedFixes | length' 2>/dev/null)
if [ "$HAS_SUGGESTIONS" != "null" ] && [ "$HAS_SUGGESTIONS" != "0" ]; then
    echo "✅ Success! AI suggestions received"
    echo "💡 Suggestion count: $HAS_SUGGESTIONS"
else
    echo "⚠️  No AI suggestions received - check server logs for details"
    echo "🔧 Troubleshooting:"
    echo "   • Verify API key is valid"
    echo "   • Check server logs for Gemini API errors"
    echo "   • Ensure backend server is running"
fi

echo ""
echo "🏁 Test completed"