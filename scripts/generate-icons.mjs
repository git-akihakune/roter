import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const appIconDir = path.join(root, "roter/roter/Assets.xcassets/AppIcon.appiconset");
const extensionImageDir = path.join(root, "roter/roter Extension/Resources/images");

const appIcons = [
    { filename: "app-icon-16.png", size: 16 },
    { filename: "app-icon-16@2x.png", size: 32 },
    { filename: "app-icon-32.png", size: 32 },
    { filename: "app-icon-32@2x.png", size: 64 },
    { filename: "app-icon-128.png", size: 128 },
    { filename: "app-icon-128@2x.png", size: 256 },
    { filename: "app-icon-256.png", size: 256 },
    { filename: "app-icon-256@2x.png", size: 512 },
    { filename: "app-icon-512.png", size: 512 },
    { filename: "app-icon-512@2x.png", size: 1024 }
];

const extensionIcons = [48, 64, 96, 128, 256, 512].map((size) => {
    return { filename: `icon-${size}.png`, size };
});

function crc32(buffer) {
    let crc = 0xffffffff;

    for (const byte of buffer) {
        crc ^= byte;

        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    const checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pngFromPixels(width, height, pixels) {
    const scanlines = Buffer.alloc((width * 4 + 1) * height);

    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width * 4 + 1);
        scanlines[rowOffset] = 0;
        pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

function blendPixel(pixels, width, x, y, color, alpha = 1) {
    if (x < 0 || y < 0 || x >= width || y >= width || alpha <= 0) {
        return;
    }

    const offset = (y * width + x) * 4;
    const sourceAlpha = Math.min(1, alpha) * (color[3] / 255);
    const targetAlpha = pixels[offset + 3] / 255;
    const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

    if (outAlpha === 0) {
        return;
    }

    for (let channel = 0; channel < 3; channel += 1) {
        const source = color[channel] / 255;
        const target = pixels[offset + channel] / 255;
        pixels[offset + channel] = Math.round(((source * sourceAlpha) + (target * targetAlpha * (1 - sourceAlpha))) / outAlpha * 255);
    }

    pixels[offset + 3] = Math.round(outAlpha * 255);
}

function drawSupersampled(size, draw) {
    const scale = 3;
    const highSize = size * scale;
    const highPixels = Buffer.alloc(highSize * highSize * 4);

    draw({
        point: (x, y, color, alpha = 1) => blendPixel(highPixels, highSize, Math.round(x * scale), Math.round(y * scale), color, alpha),
        scale,
        size
    });

    const pixels = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const sums = [0, 0, 0, 0];

            for (let yy = 0; yy < scale; yy += 1) {
                for (let xx = 0; xx < scale; xx += 1) {
                    const offset = (((y * scale + yy) * highSize) + (x * scale + xx)) * 4;
                    sums[0] += highPixels[offset];
                    sums[1] += highPixels[offset + 1];
                    sums[2] += highPixels[offset + 2];
                    sums[3] += highPixels[offset + 3];
                }
            }

            const targetOffset = (y * size + x) * 4;
            pixels[targetOffset] = Math.round(sums[0] / 9);
            pixels[targetOffset + 1] = Math.round(sums[1] / 9);
            pixels[targetOffset + 2] = Math.round(sums[2] / 9);
            pixels[targetOffset + 3] = Math.round(sums[3] / 9);
        }
    }

    return pngFromPixels(size, size, pixels);
}

function roundedRect(drawer, x, y, width, height, radius, color) {
    const scale = drawer.scale;

    for (let py = Math.floor(y * scale); py <= Math.ceil((y + height) * scale); py += 1) {
        for (let px = Math.floor(x * scale); px <= Math.ceil((x + width) * scale); px += 1) {
            const pointX = px / scale;
            const pointY = py / scale;
            const closestX = Math.max(x + radius, Math.min(pointX, x + width - radius));
            const closestY = Math.max(y + radius, Math.min(pointY, y + height - radius));
            const distance = Math.hypot(pointX - closestX, pointY - closestY);

            if (distance <= radius) {
                drawer.point(pointX, pointY, color);
            }
        }
    }
}

function rotatedRect(drawer, centerX, centerY, width, height, radius, angle, color) {
    const scale = drawer.scale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let py = 0; py < drawer.size * scale; py += 1) {
        for (let px = 0; px < drawer.size * scale; px += 1) {
            const pointX = px / scale;
            const pointY = py / scale;
            const localX = (pointX - centerX) * cos + (pointY - centerY) * sin;
            const localY = -(pointX - centerX) * sin + (pointY - centerY) * cos;
            const dx = Math.abs(localX) - width / 2 + radius;
            const dy = Math.abs(localY) - height / 2 + radius;
            const outsideX = Math.max(dx, 0);
            const outsideY = Math.max(dy, 0);

            if (Math.hypot(outsideX, outsideY) <= radius && dx <= radius && dy <= radius) {
                drawer.point(pointX, pointY, color);
            }
        }
    }
}

function thickLine(drawer, startX, startY, endX, endY, width, color) {
    const scale = drawer.scale;
    const minX = Math.floor((Math.min(startX, endX) - width) * scale);
    const maxX = Math.ceil((Math.max(startX, endX) + width) * scale);
    const minY = Math.floor((Math.min(startY, endY) - width) * scale);
    const maxY = Math.ceil((Math.max(startY, endY) + width) * scale);
    const lengthSquared = (endX - startX) ** 2 + (endY - startY) ** 2;

    for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
            const pointX = px / scale;
            const pointY = py / scale;
            const t = Math.max(0, Math.min(1, (((pointX - startX) * (endX - startX)) + ((pointY - startY) * (endY - startY))) / lengthSquared));
            const projectionX = startX + (endX - startX) * t;
            const projectionY = startY + (endY - startY) * t;

            if (Math.hypot(pointX - projectionX, pointY - projectionY) <= width / 2) {
                drawer.point(pointX, pointY, color);
            }
        }
    }
}

function triangle(drawer, points, color) {
    const scale = drawer.scale;
    const minX = Math.floor(Math.min(...points.map((point) => point[0])) * scale);
    const maxX = Math.ceil(Math.max(...points.map((point) => point[0])) * scale);
    const minY = Math.floor(Math.min(...points.map((point) => point[1])) * scale);
    const maxY = Math.ceil(Math.max(...points.map((point) => point[1])) * scale);
    const area = edge(points[0], points[1], points[2]);

    function edge(a, b, c) {
        return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
    }

    for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
            const point = [px / scale, py / scale];
            const w0 = edge(points[1], points[2], point);
            const w1 = edge(points[2], points[0], point);
            const w2 = edge(points[0], points[1], point);

            if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
                drawer.point(point[0], point[1], color, Math.sign(area) === 0 ? 0 : 1);
            }
        }
    }
}

function drawIcon(size) {
    const teal = [31, 111, 104, 255];
    const mint = [95, 206, 190, 255];
    const paper = [250, 247, 239, 255];
    const ink = [12, 38, 36, 255];
    const scale = size / 1024;

    return drawSupersampled(size, (drawer) => {
        roundedRect(drawer, 70 * scale, 70 * scale, 884 * scale, 884 * scale, 210 * scale, teal);
        roundedRect(drawer, 124 * scale, 124 * scale, 776 * scale, 776 * scale, 160 * scale, mint);
        roundedRect(drawer, 166 * scale, 166 * scale, 692 * scale, 692 * scale, 134 * scale, teal);
        rotatedRect(drawer, 512 * scale, 528 * scale, 360 * scale, 500 * scale, 62 * scale, -0.16, paper);
        thickLine(drawer, 650 * scale, 296 * scale, 746 * scale, 392 * scale, 54 * scale, ink);
        thickLine(drawer, 746 * scale, 392 * scale, 650 * scale, 488 * scale, 54 * scale, ink);
        thickLine(drawer, 324 * scale, 696 * scale, 248 * scale, 620 * scale, 54 * scale, paper);
        thickLine(drawer, 248 * scale, 620 * scale, 324 * scale, 544 * scale, 54 * scale, paper);
        triangle(drawer, [
            [724 * scale, 300 * scale],
            [812 * scale, 402 * scale],
            [672 * scale, 428 * scale]
        ], ink);
        triangle(drawer, [
            [256 * scale, 716 * scale],
            [172 * scale, 610 * scale],
            [312 * scale, 588 * scale]
        ], paper);
    });
}

fs.mkdirSync(appIconDir, { recursive: true });
fs.mkdirSync(extensionImageDir, { recursive: true });

for (const icon of appIcons) {
    fs.writeFileSync(path.join(appIconDir, icon.filename), drawIcon(icon.size));
}

for (const icon of extensionIcons) {
    fs.writeFileSync(path.join(extensionImageDir, icon.filename), drawIcon(icon.size));
}
