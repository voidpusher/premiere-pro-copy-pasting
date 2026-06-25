#!/usr/bin/env bash
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "============================================"
echo "  Instant Paste - Build Script"
echo "============================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js not found. Install from https://nodejs.org"
    exit 1
fi

echo -e "${BLUE}[1/4]${NC} Installing CEP plugin dependencies..."
cd "$SCRIPT_DIR/../cep-plugin"
npm install

echo ""
echo -e "${BLUE}[2/4]${NC} Building CEP plugin (React + TypeScript)..."
npm run build

echo ""
echo -e "${BLUE}[3/4]${NC} Installing Electron helper dependencies..."
cd "$SCRIPT_DIR/../electron-helper"
npm install

echo ""
echo -e "${BLUE}[4/4]${NC} Building Electron helper..."
npm run build

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Build complete!${NC}"
echo "  Next: run scripts/install-mac.sh (Mac) or scripts/install.bat (Windows)"
echo -e "${GREEN}============================================${NC}"
echo ""
