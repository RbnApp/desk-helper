// Hareketli fotoğraf (telefonla çekilen "Motion Photo" / "Hareketli fotoğraf"): JPEG'in sonuna gömülü kısa MP4.
// Fotoğraf görüntüleyici sorar; gömülü video varsa geçici klasöre çıkarılır ve yolu döner (yoksa null).
//  - Google / yeni Samsung: XMP'de GCamera:MotionPhoto="1" ve Container:Directory içinde video/mp4 öğesinin Item:Length'i
//    (video dosyanın son Length baytı). Eski Google: GCamera:MicroVideo="1" + MicroVideoOffset (sondan uzaklık).
//  - Eski Samsung: XMP yok; dosyanın sonundaki SEF bloğunda (…SEFH … <boyut>SEFT) "MotionPhoto_Data" kaydı.
// Her durumda videonun başında "ftyp" olup olmadığına bakılır.
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const cacheDir = () => path.join(os.tmpdir(), 'desk-helper-motion');

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return b.subarray(0, n);
}
const isMp4At = (fd, off) => off >= 0 && readAt(fd, off + 4, 4).toString('latin1') === 'ftyp';

// XMP'den videonun dosya içindeki başlangıcı (yoksa -1).
function fromXmp(head, size) {
  const s = head.toString('latin1');
  const attr = (name) => { const m = s.match(new RegExp(name + '\\s*=\\s*"(\\d+)"')) || s.match(new RegExp('<' + name + '>\\s*(\\d+)\\s*<')); return m ? Number(m[1]) : null; };
  if (attr('GCamera:MotionPhoto') === 1) {
    // Container:Item'lar sırayla; video/mp4 olanın Item:Length'i.
    for (const m of s.matchAll(/<Container:Item\b[^>]*>/g)) {
      if (!/Item:Mime\s*=\s*"video\/mp4"/.test(m[0])) continue;
      const len = Number((m[0].match(/Item:Length\s*=\s*"(\d+)"/) || [])[1]);
      if (len > 0 && len < size) return size - len;
    }
  }
  if (attr('GCamera:MicroVideo') === 1) {
    const off = attr('GCamera:MicroVideoOffset');
    if (off > 0 && off < size) return size - off;
  }
  return -1;
}

// Samsung SEF bloğundan "MotionPhoto_Data" verisinin başlangıcı ve uzunluğu (yoksa null).
function fromSef(fd, size) {
  if (size < 16) return null;
  const tail = readAt(fd, size - 8, 8);
  if (tail.toString('latin1', 4, 8) !== 'SEFT') return null;
  const dirLen = tail.readUInt32LE(0);
  const dirPos = size - 8 - dirLen;
  if (dirLen < 12 || dirPos < 0) return null;
  const dir = readAt(fd, dirPos, dirLen);
  if (dir.toString('latin1', 0, 4) !== 'SEFH') return null;
  const count = dir.readUInt32LE(8);
  for (let i = 0; i < count && 12 + i * 12 + 12 <= dir.length; i++) {
    const e = 12 + i * 12;
    const back = dir.readUInt32LE(e + 4), len = dir.readUInt32LE(e + 8);
    const pos = dirPos - back;
    if (pos < 0 || len < 8) continue;
    const hdr = readAt(fd, pos, 8);
    const nameLen = hdr.readUInt32LE(4);
    if (nameLen > 64) continue;
    const name = readAt(fd, pos + 8, nameLen).toString('latin1');
    if (name !== 'MotionPhoto_Data') continue;
    const start = pos + 8 + nameLen;
    return { start, len: len - 8 - nameLen };
  }
  return null;
}

function locate(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = readAt(fd, 0, Math.min(size, 256 * 1024));
    if (head[0] !== 0xff || head[1] !== 0xd8) return null; // JPEG değil
    let start = fromXmp(head, size);
    if (start >= 0 && isMp4At(fd, start)) return { start, len: size - start };
    const sef = fromSef(fd, size);
    if (sef && isMp4At(fd, sef.start)) return sef;
    return null;
  } finally { fs.closeSync(fd); }
}

async function extract(file) {
  const st = fs.statSync(file);
  const loc = locate(file);
  if (!loc) return null;
  fs.mkdirSync(cacheDir(), { recursive: true });
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
  const out = path.join(cacheDir(), key + '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size === loc.len) return out;
  await new Promise((res, rej) => {
    const ws = fs.createWriteStream(out);
    fs.createReadStream(file, { start: loc.start, end: loc.start + loc.len - 1 }).on('error', rej).pipe(ws).on('finish', res).on('error', rej);
  });
  return out;
}

ipcMain.handle('photo:motion', async (_e, file) => {
  try { return /\.(jpe?g)$/i.test(String(file)) ? await extract(String(file)) : null; } catch { return null; }
});
// Önceki oturumlardan kalan çıkarılmış videolar.
app.whenReady().then(() => { try { fs.rmSync(cacheDir(), { recursive: true, force: true }); } catch {} });

module.exports = { locate, extract };
