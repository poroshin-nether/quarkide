const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');

function dos_time(date) {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
}

function dos_date(date) {
  return (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
}

async function walk(dir, base, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) await walk(abs, rel, out);
    else if (e.isFile()) out.push({ abs, rel });
  }
}

async function stream_zip(root_dir, root_name, res) {
  const files = [];
  await walk(root_dir, root_name, files);

  let offset = 0;
  const central = [];
  const write = (buf) => { res.write(buf); offset += buf.length; };

  for (const f of files) {
    const [data, stat] = await Promise.all([fs.readFile(f.abs), fs.stat(f.abs)]);
    const crc = zlib.crc32(data) >>> 0;
    const name = Buffer.from(f.rel, 'utf-8');
    const time = dos_time(stat.mtime);
    const date = dos_date(stat.mtime);
    const local_offset = offset;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    write(header);
    write(name);
    write(data);

    central.push({ name, crc, size: data.length, local_offset, time, date });
  }

  const cd_start = offset;
  for (const c of central) {
    const rec = Buffer.alloc(46);
    rec.writeUInt32LE(0x02014b50, 0);
    rec.writeUInt16LE(20, 4);
    rec.writeUInt16LE(20, 6);
    rec.writeUInt16LE(0x0800, 8);
    rec.writeUInt16LE(0, 10);
    rec.writeUInt16LE(c.time, 12);
    rec.writeUInt16LE(c.date, 14);
    rec.writeUInt32LE(c.crc, 16);
    rec.writeUInt32LE(c.size, 20);
    rec.writeUInt32LE(c.size, 24);
    rec.writeUInt16LE(c.name.length, 28);
    rec.writeUInt16LE(0, 30);
    rec.writeUInt16LE(0, 32);
    rec.writeUInt16LE(0, 34);
    rec.writeUInt16LE(0, 36);
    rec.writeUInt32LE(0, 38);
    rec.writeUInt32LE(c.local_offset, 42);
    write(rec);
    write(c.name);
  }
  const cd_size = offset - cd_start;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cd_size, 12);
  eocd.writeUInt32LE(cd_start, 16);
  eocd.writeUInt16LE(0, 20);
  write(eocd);

  res.end();
}

module.exports = { stream_zip };
