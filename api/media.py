"""Product media on disk: the local/Python implementation of the media seam.

The hosted Edge API stores the same objects in Supabase Storage and returns the
same ``/media/<key>`` URLs. Validation rules are duplicated deliberately so the
catalog behaves identically in both runtimes (decision 0012).
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

MAX_BYTES = 5 * 1024 * 1024
KEY_PATTERN = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp)$")
CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
EXTENSIONS = {extension: content_type
              for content_type, extension in CONTENT_TYPES.items()}


class MediaError(Exception):
    """A rejected upload; the API maps it to a 400 response."""


def sniff(data: bytes) -> str:
    """Return the raster type from its magic bytes, or an empty string."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return ""


class MediaStore:
    def __init__(self, directory: str | os.PathLike[str]) -> None:
        self.directory = Path(directory)

    def available(self) -> bool:
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            return os.access(self.directory, os.W_OK)
        except OSError:
            return False

    def save(self, data: bytes, content_type: str) -> dict:
        if not data:
            raise MediaError("envie uma imagem")
        if len(data) > MAX_BYTES:
            raise MediaError("a imagem deve ter no máximo 5 MB")
        declared = str(content_type or "").split(";")[0].strip().lower()
        detected = sniff(data)
        if detected not in CONTENT_TYPES or declared != detected:
            raise MediaError("envie uma imagem JPEG, PNG ou WebP")
        if not self.available():
            raise MediaError("o armazenamento de imagens não está disponível")
        key = f"{uuid.uuid4().hex}.{CONTENT_TYPES[detected]}"
        (self.directory / key).write_bytes(data)
        return {"url": f"/media/{key}", "key": key,
                "content_type": detected, "size": len(data)}

    def open(self, key: str) -> tuple[Path, str] | None:
        if not KEY_PATTERN.fullmatch(key):
            return None
        path = self.directory / key
        if not path.is_file():
            return None
        return path, EXTENSIONS[path.suffix.lstrip(".")]
