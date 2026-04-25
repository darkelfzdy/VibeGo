#!/bin/bash
set -e

SHERPA_VERSION="${SHERPA_VERSION:-1.12.36}"
SHERPA_ARCHIVE="sherpa-onnx-wasm-simd-${SHERPA_VERSION}-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2"
SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/${SHERPA_ARCHIVE}"
SHERPA_DIR="assets/sherpa"

if [ -f "$SHERPA_DIR/sherpa-onnx-wasm-main-vad-asr.wasm" ]; then
    echo "Sherpa WASM files already exist in $SHERPA_DIR, skipping download."
    exit 0
fi

echo "Downloading sherpa-onnx WASM VAD+ASR (SenseVoice) v${SHERPA_VERSION}..."
mkdir -p "$SHERPA_DIR"
curl -L "$SHERPA_URL" -o "/tmp/$SHERPA_ARCHIVE"
tar xf "/tmp/$SHERPA_ARCHIVE" -C /tmp

EXTRACT_DIR="/tmp/sherpa-onnx-wasm-simd-${SHERPA_VERSION}-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small"
cp $EXTRACT_DIR/*.js "$SHERPA_DIR/"
cp $EXTRACT_DIR/*.wasm "$SHERPA_DIR/"
cp $EXTRACT_DIR/*.data "$SHERPA_DIR/"

rm -rf "/tmp/$SHERPA_ARCHIVE" "$EXTRACT_DIR"

echo "Sherpa WASM files downloaded and extracted successfully to $SHERPA_DIR."
