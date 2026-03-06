#!/bin/bash

# You can pass the API URL as the first argument, or it defaults to localhost:3000
API_URL=${1:-"http://localhost:5000"}

echo "Testing OAuth flow against $API_URL..."
echo "--------------------------------------------------------"

# ---------------------------------------------------------
# Test 1: Verify /auth/login redirects to GitHub
# ---------------------------------------------------------
echo "[1] Testing /auth/login redirect..."

# Fetch headers (-I) or full response with headers (-i). We use -i -s to parse it quietly.
LOGIN_RES=$(curl -s -i "$API_URL/auth/login")

# Extract HTTP status and Location header
HTTP_STATUS=$(echo "$LOGIN_RES" | head -n 1 | awk '{print $2}')
LOCATION=$(echo "$LOGIN_RES" | grep -i "^location:" | awk '{print $2}' | tr -d '\r')

if [[ "$HTTP_STATUS" == "307" || "$HTTP_STATUS" == "302" || "$HTTP_STATUS" == "303" ]]; then
    echo "✅ Success: Received redirect status ($HTTP_STATUS)"
    if [[ "$LOCATION" == *"github.com/login/oauth/authorize"* ]]; then
        echo "✅ Success: Redirects to GitHub OAuth."
        echo "   -> Redirect URL: $LOCATION"
    else
        echo "❌ Failed: Location header does not point to GitHub."
        echo "   -> Got Location: $LOCATION"
    fi
else
    echo "❌ Failed: Expected redirect status, got $HTTP_STATUS"
fi

echo "--------------------------------------------------------"

# ---------------------------------------------------------
# Test 2: Verify /auth/callback rejects invalid codes
# ---------------------------------------------------------
echo "[2] Testing /auth/callback with invalid code..."

# We only care about the HTTP status code here
CALLBACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/auth/callback?code=invalid_test_code")

if [[ "$CALLBACK_STATUS" == "400" || "$CALLBACK_STATUS" == "500" || "$CALLBACK_STATUS" == "401" ]]; then
    echo "✅ Success: Invalid code correctly rejected with status $CALLBACK_STATUS."
else
    echo "❌ Failed: Expected error status (400/500), got $CALLBACK_STATUS."
fi

echo "--------------------------------------------------------"
echo "Tests completed."
