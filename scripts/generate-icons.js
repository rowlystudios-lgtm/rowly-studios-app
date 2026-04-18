// Generates placeholder PWA icons (#0a0a0a background, white "RS" text).
// Pure-Node PNG encoder — no deps. Run with: node scripts/generate-icons.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function writePng(filePath, width, height, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const rowLen = width * 4
  const scan = Buffer.alloc((rowLen + 1) * height)
  for (let y = 0; y < height; y++) {
    scan[y * (rowLen + 1)] = 0
    pixels.copy(scan, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen)
  }
  const idat = zlib.deflateSync(scan, { level: 9 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
  fs.writeFileSync(filePath, png)
}

// Letter shapes defined as a list of rectangles in [0,1] x [0,1] space within the letter box.
// Block-style R and S — simple and legible at 192/512.
const R_RECTS = [
  [0.00, 0.00, 0.22, 1.00], // left vertical stem
  [0.00, 0.00, 0.85, 0.18], // top bar
  [0.00, 0.42, 0.85, 0.58], // middle bar
  [0.63, 0.00, 0.85, 0.50], // top-right vertical
]
// diagonal leg of R: drawn separately as a thick diagonal
const R_DIAG = {
  x1: 0.30,
  y1: 0.58,
  x2: 1.00,
  y2: 1.00,
  thick: 0.22,
}

const S_RECTS = [
  [0.00, 0.00, 1.00, 0.18], // top bar
  [0.00, 0.00, 0.22, 0.52], // left upper vertical
  [0.00, 0.41, 1.00, 0.59], // middle bar
  [0.78, 0.41, 1.00, 1.00], // right lower vertical
  [0.00, 0.82, 1.00, 1.00], // bottom bar
]

function inRect(px, py, r) {
  return px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3]
}

function inDiag(px, py, d) {
  const dx = d.x2 - d.x1
  const dy = d.y2 - d.y1
  const len2 = dx * dx + dy * dy
  const t = ((px - d.x1) * dx + (py - d.y1) * dy) / len2
  if (t < 0 || t > 1) return false
  const projx = d.x1 + t * dx
  const projy = d.y1 + t * dy
  const ddx = px - projx
  const ddy = py - projy
  return Math.sqrt(ddx * ddx + ddy * ddy) <= d.thick / 2
}

function inLetter(letter, px, py) {
  const rects = letter === 'R' ? R_RECTS : S_RECTS
  for (const r of rects) if (inRect(px, py, r)) return true
  if (letter === 'R' && inDiag(px, py, R_DIAG)) return true
  return false
}

function render(size) {
  const bgR = 0x0a,
    bgG = 0x0a,
    bgB = 0x0a
  const fgR = 0xff,
    fgG = 0xff,
    fgB = 0xff
  const buf = Buffer.alloc(size * size * 4)

  // Letter layout inside the canvas.
  // Use ~62% of canvas height, two letters separated by a small gap.
  const letterH = 0.58
  const letterW = 0.36
  const gap = 0.04
  const totalW = letterW * 2 + gap
  const xStart = (1 - totalW) / 2
  const yStart = (1 - letterH) / 2
  const boxes = [
    { letter: 'R', x: xStart, y: yStart, w: letterW, h: letterH },
    { letter: 'S', x: xStart + letterW + gap, y: yStart, w: letterW, h: letterH },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let isFg = false
      for (const b of boxes) {
        if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) {
          const lx = (u - b.x) / b.w
          const ly = (v - b.y) / b.h
          if (inLetter(b.letter, lx, ly)) {
            isFg = true
            break
          }
        }
      }
      const idx = (y * size + x) * 4
      if (isFg) {
        buf[idx] = fgR
        buf[idx + 1] = fgG
        buf[idx + 2] = fgB
      } else {
        buf[idx] = bgR
        buf[idx + 1] = bgG
        buf[idx + 2] = bgB
      }
      buf[idx + 3] = 0xff
    }
  }
  return buf
}

const outDir = path.resolve(__dirname, '..', 'public')
const sizes = [192, 512]
for (const s of sizes) {
  const pixels = render(s)
  const file = path.join(outDir, `icon-${s}.png`)
  writePng(file, s, s, pixels)
  console.log(`wrote ${file}`)
}
