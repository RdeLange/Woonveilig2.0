#!/bin/bash

# Load environment variables from .env.local for testing
# Usage: source scripts/load-env.sh

if [ -f .env.local ]; then
    echo "📦 Loading environment variables from .env.local..."
    set -a  # Mark all new variables for export
    source .env.local
    set +a  # Unset the -a flag

    echo "✓ Environment variables loaded:"
    echo "  WOONVEILIG_URL: $WOONVEILIG_URL"
    echo "  WOONVEILIG_USERNAME: $WOONVEILIG_USERNAME"
    echo "  WOONVEILIG_AREA: $WOONVEILIG_AREA"
    echo ""
    echo "You can now run: npm run test:integration"
else
    echo "❌ Error: .env.local file not found"
    echo "Please create .env.local with your system details:"
    echo ""
    echo "  cp .env.local.example .env.local"
    echo "  # Then edit .env.local with your credentials"
    exit 1
fi
