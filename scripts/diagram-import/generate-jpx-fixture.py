#!/usr/bin/env python3
"""Writes e2e/fixtures/diagram-import/scanned-jpeg2000.pdf.

The same page as scanned-page.pdf (pdfjs-scan.pgm.gz, position in expected.json)
stored the way archive and many scanner PDFs store a page: one JPEG2000 image and
no text layer. pdf.js needs its OpenJPEG decoder for this, which the other
fixtures never exercise, and without it the page renders blank.

generate-fixtures.mjs can't produce this (a browser-printed PDF never embeds
JPEG2000), hence the separate script. Needs Pillow:

    python3 -m venv /tmp/fixture-venv && /tmp/fixture-venv/bin/pip install pillow
    /tmp/fixture-venv/bin/python scripts/diagram-import/generate-jpx-fixture.py
"""

import gzip
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/api/src/common/chess/__fixtures__/diagram/pdfjs-scan.pgm.gz"
OUT = ROOT / "e2e/fixtures/diagram-import/scanned-jpeg2000.pdf"
# A4 width in points, like the page the source was rendered from.
PAGE_WIDTH = 595


def encode_jp2(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG2000", irreversible=True, quality_mode="rates", quality_layers=[24])
    return buffer.getvalue()


def build_pdf(jp2: bytes, width: int, height: int) -> bytes:
    page_height = round(PAGE_WIDTH * height / width)
    content = f"q {PAGE_WIDTH} 0 0 {page_height} 0 0 cm /Scan Do Q".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {page_height}] "
            "/Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>"
        ).encode(),
        (
            f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} "
            f"/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /JPXDecode /Length {len(jp2)} >>\n"
            "stream\n"
        ).encode()
        + jp2
        + b"\nendstream",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.5\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode()
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(pdf)


def main() -> None:
    image = Image.open(io.BytesIO(gzip.decompress(SOURCE.read_bytes()))).convert("L")
    OUT.write_bytes(build_pdf(encode_jp2(image), image.width, image.height))
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
