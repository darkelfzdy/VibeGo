#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

REPOSITORY_URL = "https://github.com/xxnuo/VibeGo"

PLATFORMS = {
    ("android", "arm64"): {
        "node_os": "android",
        "node_cpu": "arm64",
        "pkg_suffix": "android-arm64",
        "binary_name": "vibego",
    },
    ("linux", "amd64"): {
        "node_os": "linux",
        "node_cpu": "x64",
        "pkg_suffix": "linux-x64",
        "binary_name": "vibego",
    },
    ("linux", "arm64"): {
        "node_os": "linux",
        "node_cpu": "arm64",
        "pkg_suffix": "linux-arm64",
        "binary_name": "vibego",
    },
    ("darwin", "amd64"): {
        "node_os": "darwin",
        "node_cpu": "x64",
        "pkg_suffix": "darwin-x64",
        "binary_name": "vibego",
    },
    ("darwin", "arm64"): {
        "node_os": "darwin",
        "node_cpu": "arm64",
        "pkg_suffix": "darwin-arm64",
        "binary_name": "vibego",
    },
    ("windows", "amd64"): {
        "node_os": "win32",
        "node_cpu": "x64",
        "pkg_suffix": "win32-x64",
        "binary_name": "vibego.exe",
    },
    ("windows", "arm64"): {
        "node_os": "win32",
        "node_cpu": "arm64",
        "pkg_suffix": "win32-arm64",
        "binary_name": "vibego.exe",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", required=True)
    parser.add_argument("--artifacts-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--launcher", type=Path, default=Path("scripts/npm/vibego.js"))
    return parser.parse_args()


def run(cmd: list[str], cwd: Path | None = None) -> str:
    res = subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)
    return res.stdout


def npm_pack(staging_dir: Path, output_path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="vibego-npm-pack-") as tmp:
        pack_dir = Path(tmp)
        out = run(["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", str(pack_dir)], cwd=staging_dir)
        data = json.loads(out)
        if not data:
            raise RuntimeError("npm pack did not return any output")
        filename = data[0].get("filename")
        if not filename:
            raise RuntimeError("npm pack output missing filename")
        src = pack_dir / filename
        if not src.exists():
            raise RuntimeError(f"npm pack output not found: {src}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), output_path)


def extract_binary(archive: Path, binary_name: str, dest: Path) -> None:
    with tarfile.open(archive, "r:gz") as tf:
        members = [m for m in tf.getmembers() if m.isfile()]
        if not members:
            raise RuntimeError(f"archive has no files: {archive}")
        target = None
        for m in members:
            if Path(m.name).name == binary_name:
                target = m
                break
        if target is None:
            target = members[0]
        f = tf.extractfile(target)
        if f is None:
            raise RuntimeError(f"cannot extract file from archive: {archive}")
        data = f.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    dest.chmod(0o755)


def stage_platform_package(
    version: str,
    artifacts_dir: Path,
    output_dir: Path,
    tag: str,
    goos: str,
    goarch: str,
    platform: dict[str, str],
) -> Path:
    archive = artifacts_dir / f"vibego_{tag}_{goos}_{goarch}.tar.gz"
    if not archive.exists():
        raise RuntimeError(f"missing artifact: {archive}")

    pkg_name = f"@vibego/vibego-{platform['pkg_suffix']}"

    with tempfile.TemporaryDirectory(prefix=f"vibego-npm-{platform['pkg_suffix']}-") as tmp:
        root = Path(tmp)
        package_json = {
            "name": pkg_name,
            "version": version,
            "os": [platform["node_os"]],
            "cpu": [platform["node_cpu"]],
            "files": ["vendor"],
            "repository": {
                "type": "git",
                "url": REPOSITORY_URL,
            },
        }
        (root / "package.json").write_text(json.dumps(package_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        extract_binary(archive, platform["binary_name"], root / "vendor" / platform["binary_name"])

        tarball = output_dir / f"vibego-npm-{platform['pkg_suffix']}-{version}.tgz"
        npm_pack(root, tarball)
        return tarball


def stage_main_package(version: str, output_dir: Path, launcher: Path, platform_versions: dict[str, str]) -> Path:
    if not launcher.exists():
        raise RuntimeError(f"launcher not found: {launcher}")

    optional_dependencies = {
        f"@vibego/vibego-{suffix}": version
        for suffix in sorted(platform_versions.keys())
    }

    with tempfile.TemporaryDirectory(prefix="vibego-npm-main-") as tmp:
        root = Path(tmp)
        (root / "bin").mkdir(parents=True, exist_ok=True)
        shutil.copy2(launcher, root / "bin" / "vibego.js")
        (root / "bin" / "vibego.js").chmod(0o755)

        package_json = {
            "name": "vibego",
            "version": version,
            "type": "module",
            "bin": {
                "vibego": "bin/vibego.js"
            },
            "files": ["bin"],
            "engines": {
                "node": ">=16"
            },
            "optionalDependencies": optional_dependencies,
            "repository": {
                "type": "git",
                "url": REPOSITORY_URL,
            },
        }
        (root / "package.json").write_text(json.dumps(package_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        tarball = output_dir / f"vibego-npm-{version}.tgz"
        npm_pack(root, tarball)
        return tarball


def validate_tag(tag: str) -> str:
    if not tag.startswith("v"):
        raise RuntimeError(f"tag must start with v: {tag}")
    version = tag[1:]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise RuntimeError(f"invalid semver tag: {tag}")
    return version


def main() -> int:
    args = parse_args()
    tag = args.tag.strip()
    version = validate_tag(tag)

    artifacts_dir = args.artifacts_dir.resolve()
    output_dir = args.output_dir.resolve()
    launcher = args.launcher.resolve()

    if not artifacts_dir.exists():
        raise RuntimeError(f"artifacts directory not found: {artifacts_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)

    platform_versions: dict[str, str] = {}

    for (goos, goarch), platform in PLATFORMS.items():
        stage_platform_package(version, artifacts_dir, output_dir, tag, goos, goarch, platform)
        platform_versions[platform["pkg_suffix"]] = version

    stage_main_package(version, output_dir, launcher, platform_versions)

    files = sorted(p.name for p in output_dir.glob("*.tgz"))
    print(json.dumps({"version": version, "files": files}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
