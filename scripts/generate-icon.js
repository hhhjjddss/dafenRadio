const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 图标源图（PNG，来自 MyDiary 的 dF 字形）
const sourceIcon = path.join(__dirname, '../resources/icon-source.png');
// Windows 11 风格圆角：成品图标裁成圆角方块，四角透明
const SOURCE_SIZE = 1536;
const CORNER_RADIUS = Math.round(SOURCE_SIZE * 0.225);

async function roundedSource() {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_SIZE}" height="${SOURCE_SIZE}">` +
      `<rect width="${SOURCE_SIZE}" height="${SOURCE_SIZE}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="#fff"/>` +
      `</svg>`
  );
  return sharp(sourceIcon).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function generateIcons() {
  const resourcesDir = path.join(__dirname, '../resources');
  const source = await roundedSource();

  // 确保目录存在
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // 生成各种尺寸的 PNG
  const sizes = [16, 32, 48, 64, 128, 256, 512];

  for (const size of sizes) {
    await sharp(source)
      .resize(size, size)
      .png()
      .toFile(path.join(resourcesDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }

  // 生成主图标 (256x256)
  await sharp(source)
    .resize(256, 256)
    .png()
    .toFile(path.join(resourcesDir, 'icon.png'));
  console.log('Generated icon.png');

  // 生成 ICO 文件
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = [];

  for (const size of icoSizes) {
    const buffer = await sharp(source).resize(size, size).png().toBuffer();
    icoBuffers.push({ size, buffer });
  }

  // 创建 ICO 文件
  const icoFile = createIcoFile(icoBuffers);
  fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), icoFile);
  console.log('Generated icon.ico');

  console.log('\nAll icons generated successfully!');
}

function createIcoFile(images) {
  // ICO 文件格式
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 保留
  header.writeUInt16LE(1, 2); // 类型: ICO
  header.writeUInt16LE(images.length, 4); // 图像数量

  // 计算偏移量
  let offset = 6 + images.length * 16;

  const entries = [];
  const imageBuffers = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size > 255 ? 0 : img.size, 0); // 宽度
    entry.writeUInt8(img.size > 255 ? 0 : img.size, 1); // 高度
    entry.writeUInt8(0, 2); // 颜色表
    entry.writeUInt8(0, 3); // 保留
    entry.writeUInt16LE(1, 4); // 颜色平面
    entry.writeUInt16LE(32, 6); // 位深度
    entry.writeUInt32LE(img.buffer.length, 8); // 图像大小
    entry.writeUInt32LE(offset, 12); // 偏移量

    entries.push(entry);
    imageBuffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...imageBuffers]);
}

generateIcons().catch(console.error);
