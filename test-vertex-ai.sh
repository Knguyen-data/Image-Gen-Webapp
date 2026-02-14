#!/bin/bash
# Test Vertex AI Claude endpoint

# Get access token
TOKEN=$(gcloud auth print-access-token 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "Error: No gcloud token. Run 'gcloud auth application-default login' first"
    exit 1
fi

echo "Testing Vertex AI Claude endpoint..."
echo "Token: ${TOKEN:0:20}..."

# Test request
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "anthropic_version": "vertex-2023-10-16",
    "max_tokens": 512,
    "temperature": 1,
    "messages": [
      {
        "role": "user",
        "content": "Say exactly: Hello from Vertex AI!"
      }
    ]
  }' \
  "https://aiplatform.googleapis.com/v1/projects/higgfails/locations/global/publishers/anthropic/models/claude-opus-4-6:streamRawPredict" \
  --no-buffer
