#!/bin/bash

# WoonVeilig Lokaal Installation Script for macOS
# Usage: bash install-for-other-users.sh

set -e

APP_ID='nl.community.woonveiliglocal'
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}WoonVeilig Lokaal installeren op jouw Homey${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is niet gevonden. Installeer eerst Node.js: https://nodejs.org/${NC}"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is niet gevonden. Installeer Node.js opnieuw.${NC}"
    exit 1
fi

# Check homey CLI
if ! command -v homey &> /dev/null; then
    echo -e "${RED}❌ Homey CLI is niet gevonden. Installeer met: npm install -g @homey/cli${NC}"
    exit 1
fi

# Install dependencies
echo -e "${CYAN}📦 Dependencies installeren...${NC}"
npm install

# Login to Homey
echo ""
echo -e "${CYAN}🔐 Homey login...${NC}"
homey login

# Get system configuration
echo ""
echo -e "${CYAN}🛠️ Configuratie${NC}"
echo ""

read -p "IP adres van je WoonVeilig systeem (bijv. 192.168.1.100): " -r WOONVEILIG_URL
if [[ -z "$WOONVEILIG_URL" ]]; then
    WOONVEILIG_URL="192.168.1.100"
fi
WOONVEILIG_URL="http://$WOONVEILIG_URL"

read -p "Gebruikersnaam [admin]: " -r WOONVEILIG_USERNAME
if [[ -z "$WOONVEILIG_USERNAME" ]]; then
    WOONVEILIG_USERNAME="admin"
fi

read -sp "Wachtwoord: " -r WOONVEILIG_PASSWORD
echo ""
if [[ -z "$WOONVEILIG_PASSWORD" ]]; then
    WOONVEILIG_PASSWORD="admin"
fi

read -p "Gebied [1]: " -r WOONVEILIG_AREA
if [[ -z "$WOONVEILIG_AREA" ]]; then
    WOONVEILIG_AREA="1"
fi

# Ask about legacy mode
echo ""
read -p "Heb je een legacy WV-1716 systeem? (j/n) [n]: " -r USE_LEGACY_MODE
if [[ "$USE_LEGACY_MODE" == "j" || "$USE_LEGACY_MODE" == "J" || "$USE_LEGACY_MODE" == "yes" || "$USE_LEGACY_MODE" == "Yes" ]]; then
    LEGACY_MODE="true"
    echo -e "${GREEN}✓ Legacy mode ingeschakeld${NC}"
else
    LEGACY_MODE="false"
    echo -e "${GREEN}✓ Modern mode geselecteerd${NC}"
fi

# Uninstall old version if it exists
echo ""
echo -e "${CYAN}📱 Oude versie verwijderen (indien aanwezig)...${NC}"
homey app uninstall 2>/dev/null || true
sleep 2

# Deploy app
echo ""
echo -e "${CYAN}📱 Nieuwe versie installeren op Homey...${NC}"
npm run run

# Set configuration via Homey API
echo ""
echo -e "${CYAN}⚙️ Instellingen configureren...${NC}"

# Function to set app setting
set_setting() {
    local name=$1
    local value=$2
    if homey api apps set-app-setting --json --id "$APP_ID" --name "$name" --value "$value" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $name ingesteld"
    else
        echo -e "${RED}✗${NC} Kon $name niet instellen"
    fi
}

# Set all settings
set_setting "url" "$WOONVEILIG_URL"
set_setting "username" "$WOONVEILIG_USERNAME"
set_setting "password" "$WOONVEILIG_PASSWORD"
set_setting "area" "$WOONVEILIG_AREA"
set_setting "legacy_mode" "$LEGACY_MODE"

echo ""
echo -e "${GREEN}✅ Installatie voltooid!${NC}"
echo ""
echo "Je kunt nu in Homey:"
echo "  • Apps → WoonVeilig Lokaal → Instellingen"
echo "  • Daar kun je de instellingen controleren"
echo ""
