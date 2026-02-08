#!/bin/bash

echo "Testing CORS configuration..."

# Start the server in the background
cd /home/buddy/Programming/nilsbohr/backend
cargo run > server.log 2>&1 &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 3

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "Server is running with PID $SERVER_PID"
    
    # Test CORS preflight request
    echo "Testing CORS preflight request..."
    curl -v -X OPTIONS \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: X-Requested-With,content-type" \
      -H "Origin: http://localhost:5173" \
      http://localhost:4000/parse
    
    echo -e "\nTesting actual POST request with origin..."
    curl -v -X POST \
      -H "Content-Type: application/json" \
      -H "Origin: http://localhost:5173" \
      -d '{"repo_url":"https://github.com/example/repo"}' \
      http://localhost:4000/parse
    
    # Stop the server
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null
else
    echo "Failed to start server"
fi

# Clean up
rm -f server.log

echo "CORS test completed."