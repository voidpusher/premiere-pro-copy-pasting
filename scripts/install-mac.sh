#!/usr/bin/env bash
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "============================================"
echo "  Instant Paste - Install to Premiere Pro"
echo "  (macOS)"
echo "============================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_DIR="$SCRIPT_DIR/../cep-plugin"
EXTENSION_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.instantpaste.plugin"

# Enable unsigned extensions
echo -e "${BLUE}[1/4]${NC} Enabling unsigned CEP extensions..."
defaults write com.adobe.CSXS.11 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.10 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.9  PlayerDebugMode 1 2>/dev/null || true
echo "Done."

# Create extension folder
echo ""
echo -e "${BLUE}[2/4]${NC} Creating extension folder..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"

# Check build output
if [ ! -f "$SOURCE_DIR/dist/index.html" ]; then
    echo -e "${RED}[ERROR]${NC} Build output not found. Run scripts/build.sh first."
    exit 1
fi

# Copy files
echo ""
echo -e "${BLUE}[3/4]${NC} Copying plugin files..."
cp -r "$SOURCE_DIR/CSXS" "$EXTENSION_DIR/"
cp -r "$SOURCE_DIR/dist/"* "$EXTENSION_DIR/"
cp -r "$SOURCE_DIR/jsx" "$EXTENSION_DIR/"
[ -d "$SOURCE_DIR/icons" ] && cp -r "$SOURCE_DIR/icons" "$EXTENSION_DIR/"
echo "Files copied."

# Electron helper
echo ""
echo -e "${BLUE}[4/4]${NC} Setting up Electron helper..."
HELPER_DIR="$SCRIPT_DIR/../electron-helper"
if [ ! -f "$HELPER_DIR/dist/main.js" ]; then
    echo "WARNING: Electron helper not built. Run scripts/build.sh first."
else
    HELPER_DEST="$HOME/InstantPasteHelper"
    mkdir -p "$HELPER_DEST"
    cp -r "$HELPER_DIR/"* "$HELPER_DEST/"
    echo "Helper installed to: $HELPER_DEST"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo ""
echo "  NEXT STEPS:"
echo "  1. Restart Adobe Premiere Pro"
echo "  2. Go to Window > Extensions > Instant Paste"
echo "  3. Start the helper:"
echo "     cd ~/InstantPasteHelper && npm start"
echo -e "${GREEN}============================================${NC}"
echo ""
