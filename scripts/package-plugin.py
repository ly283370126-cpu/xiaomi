"""Build an ABP from the compiled WASI component. Contains no configuration."""
import struct
import zlib
import zipfile
import sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
size = 96
rows = bytearray()
for y in range(size):
    rows.append(0)
    for x in range(size):
        # Original blue badge, not an official OpenAI application icon.
        mark = (25 <= x <= 32 and 26 <= y <= 70) or (25 <= x <= 69 and (26 <= y <= 32 or 64 <= y <= 70))
        rows.extend((235, 247, 255, 255) if mark else (15, 96 + y, 210, 255))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
icon = root / 'watch/src/common/icon.png'
icon.parent.mkdir(parents=True, exist_ok=True)
icon.write_bytes(png)
if '--icon-only' in sys.argv:
    raise SystemExit(0)
dist = root / 'dist'
dist.mkdir(exist_ok=True)
wasm = root / 'plugin/target/wasm32-wasip2/release/codex_watch.wasm'
if not wasm.is_file():
    raise SystemExit('Compile plugin first')
with zipfile.ZipFile(dist / 'CodexWatch.abp', 'w', zipfile.ZIP_DEFLATED) as out:
    out.write(wasm, 'codex_watch.wasm')
    out.write(root / 'plugin/manifest.json', 'manifest.json')
    out.writestr('icon.png', png)
print('Built dist/CodexWatch.abp')
