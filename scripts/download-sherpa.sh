#!/bin/bash
set -e

SHERPA_VERSION="${SHERPA_VERSION:-1.12.36}"
SHERPA_REVISION="${SHERPA_REVISION:-946a732f862b70f4cd1ab094abd907c01f1ccff8}"
SHERPA_SOURCE="${SHERPA_SOURCE:-auto}"
SHERPA_ARCHIVE="sherpa-onnx-wasm-simd-${SHERPA_VERSION}-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2"
SHERPA_DIR="assets/sherpa"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [ -f "$SHERPA_DIR/sherpa-onnx-wasm-main-vad-asr.wasm" ]; then
    echo "Sherpa WASM files already exist in $SHERPA_DIR, skipping download."
    exit 0
fi

official_archive="archive|official|https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/${SHERPA_ARCHIVE}"
official_files="files|official-hf|https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-ja-ko-cantonese-sense-voice/resolve/${SHERPA_REVISION}/"
china_files="files|china|https://hf-mirror.com/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-ja-ko-cantonese-sense-voice/resolve/${SHERPA_REVISION}/"

sources=()
case "$SHERPA_SOURCE" in
    auto)
        sources=("$china_files" "$official_archive" "$official_files")
        ;;
    official)
        sources=("$official_archive" "$official_files" "$china_files")
        ;;
    china)
        sources=("$china_files" "$official_archive" "$official_files")
        ;;
    http://*|https://*)
        if [[ "$SHERPA_SOURCE" == */ ]]; then
            sources=("files|custom|$SHERPA_SOURCE")
        else
            sources=("archive|custom|$SHERPA_SOURCE")
        fi
        ;;
    *)
        echo "Unknown SHERPA_SOURCE: $SHERPA_SOURCE"
        exit 1
        ;;
esac

if [ -n "${SHERPA_EXTRA_URLS:-}" ]; then
    IFS=',' read -ra extra_urls <<< "$SHERPA_EXTRA_URLS"
    for raw_url in "${extra_urls[@]}"; do
        url="$(echo "$raw_url" | xargs)"
        if [ -z "$url" ]; then
            continue
        fi
        if [[ "$url" == */ ]]; then
            sources+=("files|extra|$url")
        else
            sources+=("archive|extra|$url")
        fi
    done
fi

probe_url() {
    curl -fsIL --max-time 8 "$1" >/dev/null 2>&1
}

download_archive() {
    local name="$1"
    local url="$2"
    local archive_path="$TMP_DIR/$SHERPA_ARCHIVE"
    local extract_dir="$TMP_DIR/extract"

    echo "Downloading sherpa-onnx archive from $name..."
    curl -fL "$url" -o "$archive_path"
    mkdir -p "$extract_dir"
    tar xf "$archive_path" -C "$extract_dir"
    found_dir="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [ -z "$found_dir" ]; then
        return 1
    fi
    cp "$found_dir"/*.js "$TMP_DIR/"
    cp "$found_dir"/*.wasm "$TMP_DIR/"
    cp "$found_dir"/*.data "$TMP_DIR/"
}

download_files() {
    local name="$1"
    local base_url="$2"
    base_url="${base_url%/}/"

    echo "Downloading sherpa-onnx files from $name..."
    for file in sherpa-onnx-vad.js sherpa-onnx-asr.js sherpa-onnx-wasm-main-vad-asr.js sherpa-onnx-wasm-main-vad-asr.wasm sherpa-onnx-wasm-main-vad-asr.data; do
        curl -fL "${base_url}${file}" -o "$TMP_DIR/$file"
    done
}

for entry in "${sources[@]}"; do
    IFS='|' read -r kind name url <<< "$entry"
    rm -rf "$TMP_DIR/extract" "$TMP_DIR/$SHERPA_ARCHIVE" "$TMP_DIR"/*.js "$TMP_DIR"/*.wasm "$TMP_DIR"/*.data
    if [ "$kind" = "archive" ]; then
        probe="$url"
    else
        probe="${url%/}/sherpa-onnx-wasm-main-vad-asr.wasm"
    fi
    if ! probe_url "$probe"; then
        echo "Skipping unavailable sherpa source $name."
        continue
    fi
    if [ "$kind" = "archive" ]; then
        if download_archive "$name" "$url"; then
            break
        fi
    else
        if download_files "$name" "$url"; then
            break
        fi
    fi
done

if [ ! -f "$TMP_DIR/sherpa-onnx-wasm-main-vad-asr.wasm" ] || [ ! -f "$TMP_DIR/sherpa-onnx-wasm-main-vad-asr.data" ]; then
    echo "Failed to download sherpa-onnx WASM files."
    exit 1
fi

mkdir -p "$SHERPA_DIR"
cp "$TMP_DIR"/*.js "$SHERPA_DIR/"
cp "$TMP_DIR"/*.wasm "$SHERPA_DIR/"
cp "$TMP_DIR"/*.data "$SHERPA_DIR/"

echo "Sherpa WASM files downloaded and extracted successfully to $SHERPA_DIR."
