const sharp = require('sharp');
const JSZip = require('jszip');

const SUPPORTED_TARGETS = new Set([
  'png',
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'webp',
  'avif',
  'tiff',
  'gif',
  'bmp',
  'ico',
  'cur',
  'svg',
  'pdf',
  'doc',
  'docx',
  'ppm',
  'pgm',
  'pbm',
  'pnm',
  'rgb',
  'rgba',
  'xbm',
  'xpm'
]);

const MIME_BY_TARGET = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  gif: 'image/gif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  cur: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppm: 'image/x-portable-pixmap',
  pgm: 'image/x-portable-graymap',
  pbm: 'image/x-portable-bitmap',
  pnm: 'image/x-portable-anymap',
  rgb: 'application/octet-stream',
  rgba: 'application/octet-stream',
  xbm: 'image/x-xbitmap',
  xpm: 'image/x-xpixmap'
};

async function convertImageBuffer(inputBuffer, targetFormat) {
  const target = String(targetFormat ?? '').toLowerCase();
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`暂不支持转换为 ${targetFormat}。这类格式通常需要 ImageMagick、LibreOffice 或专用图形引擎。`);
  }

  const baseImage = sharp(inputBuffer, { limitInputPixels: 12000 * 12000 }).rotate();
  const metadata = await baseImage.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  let buffer;
  if (target === 'png') {
    buffer = await baseImage.png().toBuffer();
  } else if (['jpg', 'jpeg', 'jpe', 'jfif'].includes(target)) {
    buffer = await baseImage.flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } else if (target === 'webp') {
    buffer = await baseImage.webp({ quality: 90 }).toBuffer();
  } else if (target === 'avif') {
    buffer = await baseImage.avif({ quality: 58 }).toBuffer();
  } else if (target === 'tiff') {
    buffer = await baseImage.tiff({ quality: 90 }).toBuffer();
  } else if (target === 'gif') {
    buffer = await baseImage.gif().toBuffer();
  } else if (target === 'bmp') {
    buffer = await buildBmp(inputBuffer);
  } else if (target === 'ico') {
    buffer = await buildIcon(inputBuffer, false);
  } else if (target === 'cur') {
    buffer = await buildIcon(inputBuffer, true);
  } else if (target === 'svg') {
    buffer = await buildSvg(inputBuffer, width, height);
  } else if (target === 'pdf') {
    buffer = await buildPdf(inputBuffer, width, height);
  } else if (target === 'doc') {
    buffer = await buildDoc(inputBuffer);
  } else if (target === 'docx') {
    buffer = await buildDocx(inputBuffer, width, height);
  } else if (target === 'ppm' || target === 'pnm') {
    buffer = await buildPpm(inputBuffer);
  } else if (target === 'pgm') {
    buffer = await buildPgm(inputBuffer);
  } else if (target === 'pbm') {
    buffer = await buildPbm(inputBuffer);
  } else if (target === 'rgb') {
    buffer = await rawChannels(inputBuffer, 3);
  } else if (target === 'rgba') {
    buffer = await rawChannels(inputBuffer, 4);
  } else if (target === 'xbm') {
    buffer = await buildXbm(inputBuffer);
  } else if (target === 'xpm') {
    buffer = await buildXpm(inputBuffer);
  }

  return {
    buffer,
    mimeType: MIME_BY_TARGET[target] ?? 'application/octet-stream',
    extension: target,
    width,
    height
  };
}

async function rgbaPixels(inputBuffer, options = {}) {
  return sharp(inputBuffer, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .resize(options.resize ?? null)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function rgbPixels(inputBuffer) {
  return sharp(inputBuffer, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function buildBmp(inputBuffer) {
  const { data, info } = await rgbaPixels(inputBuffer);
  const rowSize = Math.ceil((info.width * 3) / 4) * 4;
  const pixelSize = rowSize * info.height;
  const fileSize = 54 + pixelSize;
  const output = Buffer.alloc(fileSize);

  output.write('BM', 0, 'ascii');
  output.writeUInt32LE(fileSize, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(info.width, 18);
  output.writeInt32LE(info.height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(pixelSize, 34);

  for (let y = 0; y < info.height; y += 1) {
    const sourceY = info.height - 1 - y;
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < info.width; x += 1) {
      const sourceOffset = (sourceY * info.width + x) * 4;
      const targetOffset = rowOffset + x * 3;
      output[targetOffset] = data[sourceOffset + 2];
      output[targetOffset + 1] = data[sourceOffset + 1];
      output[targetOffset + 2] = data[sourceOffset];
    }
  }

  return output;
}

async function buildIcon(inputBuffer, cursor) {
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(
    sizes.map((size) =>
      sharp(inputBuffer, { limitInputPixels: 12000 * 12000 })
        .rotate()
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const headerSize = 6 + pngs.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(cursor ? 2 : 1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = headerSize;
  pngs.forEach((png, index) => {
    const size = sizes[index];
    const entryOffset = 6 + index * 16;
    header[entryOffset] = size === 256 ? 0 : size;
    header[entryOffset + 1] = size === 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(cursor ? Math.floor(size / 2) : 1, entryOffset + 4);
    header.writeUInt16LE(cursor ? Math.floor(size / 2) : 32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...pngs]);
}

async function buildSvg(inputBuffer, width, height) {
  const png = await sharp(inputBuffer, { limitInputPixels: 12000 * 12000 }).rotate().png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
  return Buffer.from(svg, 'utf8');
}

async function buildPdf(inputBuffer, width, height) {
  const jpeg = await sharp(inputBuffer, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92 })
    .toBuffer();
  const content = Buffer.from(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`, 'ascii');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'ascii'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`, 'ascii'),
    streamObject(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg),
    streamObject(`<< /Length ${content.length} >>`, content)
  ];
  return buildPdfFile(objects);
}

function streamObject(dictionary, stream) {
  return Buffer.concat([Buffer.from(`${dictionary}\nstream\n`, 'ascii'), stream, Buffer.from('\nendstream', 'ascii')]);
}

function buildPdfFile(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), object, Buffer.from('\nendobj\n', 'ascii'));
  });
  const xrefOffset = Buffer.concat(chunks).length;
  const xrefRows = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  offsets.slice(1).forEach((offset) => xrefRows.push(`${String(offset).padStart(10, '0')} 00000 n `));
  chunks.push(
    Buffer.from(
      `${xrefRows.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'ascii'
    )
  );
  return Buffer.concat(chunks);
}

async function buildDoc(inputBuffer) {
  const png = await sharp(inputBuffer, { limitInputPixels: 12000 * 12000 }).rotate().png().toBuffer();
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><img src="data:image/png;base64,${png.toString('base64')}" /></body></html>`;
  return Buffer.from(html, 'utf8');
}

async function buildDocx(inputBuffer, width, height) {
  const png = await sharp(inputBuffer, { limitInputPixels: 12000 * 12000 }).rotate().png().toBuffer();
  const zip = new JSZip();
  const displayWidth = Math.min(width, 640);
  const displayHeight = Math.round((height / width) * displayWidth) || height;
  const cx = displayWidth * 9525;
  const cy = displayHeight * 9525;

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.folder('_rels').file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  const word = zip.folder('word');
  word.folder('_rels').file(
    'document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'
  );
  word.folder('media').file('image1.png', png);
  word.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function buildPpm(inputBuffer) {
  const { data, info } = await rgbPixels(inputBuffer);
  return Buffer.concat([Buffer.from(`P6\n${info.width} ${info.height}\n255\n`, 'ascii'), data]);
}

async function buildPgm(inputBuffer) {
  const { data, info } = await sharp(inputBuffer, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.concat([Buffer.from(`P5\n${info.width} ${info.height}\n255\n`, 'ascii'), data]);
}

async function buildPbm(inputBuffer) {
  const { data, info } = await rgbPixels(inputBuffer);
  const rowSize = Math.ceil(info.width / 8);
  const bitmap = Buffer.alloc(rowSize * info.height);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 3;
      const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (luminance < 128) bitmap[y * rowSize + Math.floor(x / 8)] |= 0x80 >> (x % 8);
    }
  }
  return Buffer.concat([Buffer.from(`P4\n${info.width} ${info.height}\n`, 'ascii'), bitmap]);
}

async function rawChannels(inputBuffer, channels) {
  if (channels === 3) {
    return (await rgbPixels(inputBuffer)).data;
  }
  return (await rgbaPixels(inputBuffer)).data;
}

async function buildXbm(inputBuffer) {
  const { data, info } = await rgbPixels(inputBuffer);
  const bytes = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let byteX = 0; byteX < Math.ceil(info.width / 8); byteX += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteX * 8 + bit;
        if (x >= info.width) continue;
        const offset = (y * info.width + x) * 3;
        const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
        if (luminance < 128) value |= 1 << bit;
      }
      bytes.push(`0x${value.toString(16).padStart(2, '0')}`);
    }
  }
  return Buffer.from(
    `#define image_width ${info.width}\n#define image_height ${info.height}\nstatic unsigned char image_bits[] = {\n${bytes.join(', ')}\n};\n`,
    'ascii'
  );
}

async function buildXpm(inputBuffer) {
  const { data, info } = await rgbaPixels(inputBuffer, { resize: { width: 128, height: 128, fit: 'inside' } });
  const colors = new Map();
  const rows = [];
  for (let y = 0; y < info.height; y += 1) {
    let row = '';
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const alpha = data[offset + 3];
      const color = alpha < 128 ? 'None' : `#${toHex(data[offset])}${toHex(data[offset + 1])}${toHex(data[offset + 2])}`;
      if (!colors.has(color)) colors.set(color, String.fromCharCode(33 + colors.size));
      row += colors.get(color);
    }
    rows.push(row);
  }
  const colorRows = Array.from(colors.entries()).map(([color, symbol]) => `"${symbol} c ${color}"`);
  return Buffer.from(
    `/* XPM */\nstatic char * image_xpm[] = {\n"${info.width} ${info.height} ${colors.size} 1",\n${colorRows.join(',\n')},\n${rows.map((row) => `"${row}"`).join(',\n')}\n};\n`,
    'ascii'
  );
}

function toHex(value) {
  return Number(value).toString(16).padStart(2, '0').toUpperCase();
}

module.exports = {
  SUPPORTED_TARGETS,
  convertImageBuffer
};
