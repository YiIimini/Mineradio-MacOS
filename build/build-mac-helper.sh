#!/bin/bash
# Compile macOS Swift helper for desktop lyrics middle-click monitoring
# Run from project root: bash build/build-mac-helper.sh

set -e

SWIFT_FILE="desktop/macos-lyrics-helper.swift"
OUTPUT_DIR="desktop"
OUTPUT_NAME="macos-lyrics-helper"

echo "Compiling macOS lyrics helper..."

# Build for arm64
swiftc "$SWIFT_FILE" -o "$OUTPUT_DIR/${OUTPUT_NAME}-arm64" -target arm64-apple-macos11.0 -O

# Build for x64
swiftc "$SWIFT_FILE" -o "$OUTPUT_DIR/${OUTPUT_NAME}-x64" -target x86_64-apple-macos11.0 -O

# Create universal binary
lipo -create "$OUTPUT_DIR/${OUTPUT_NAME}-arm64" "$OUTPUT_DIR/${OUTPUT_NAME}-x64" -output "$OUTPUT_DIR/$OUTPUT_NAME"

# Clean up intermediates
rm -f "$OUTPUT_DIR/${OUTPUT_NAME}-arm64" "$OUTPUT_DIR/${OUTPUT_NAME}-x64"

echo "Done: $OUTPUT_DIR/$OUTPUT_NAME (universal)"
file "$OUTPUT_DIR/$OUTPUT_NAME"
