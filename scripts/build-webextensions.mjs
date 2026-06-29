import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const resourcesRoot = path.join(repoRoot, "roter/roter Extension/Resources");
const distRoot = path.join(repoRoot, "dist/webextensions");
const releaseRoot = path.join(repoRoot, "dist/releases");
const browsers = ["safari", "chromium", "firefox"];

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

function dosDateTime() {
    return {
        date: ((2024 - 1980) << 9) | (1 << 5) | 1,
        time: 0
    };
}

function localFileHeader(fileName, data) {
    const fileNameBuffer = Buffer.from(fileName);
    const header = Buffer.alloc(30);
    const { date, time } = dosDateTime();

    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(fileNameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    return Buffer.concat([header, fileNameBuffer, data]);
}

function centralDirectoryHeader(fileName, data, offset) {
    const fileNameBuffer = Buffer.from(fileName);
    const header = Buffer.alloc(46);
    const { date, time } = dosDateTime();

    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(fileNameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);

    return Buffer.concat([header, fileNameBuffer]);
}

function endOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
    const header = Buffer.alloc(22);

    header.writeUInt32LE(0x06054b50, 0);
    header.writeUInt16LE(0, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(entryCount, 8);
    header.writeUInt16LE(entryCount, 10);
    header.writeUInt32LE(centralDirectorySize, 12);
    header.writeUInt32LE(centralDirectoryOffset, 16);
    header.writeUInt16LE(0, 20);

    return header;
}

async function listFiles(root, directory = root) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await listFiles(root, absolutePath));
            continue;
        }

        if (entry.isFile()) {
            files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
        }
    }

    return files.sort();
}

function manifestForBrowser(baseManifest, browser) {
    const manifest = structuredClone(baseManifest);

    if (browser === "chromium") {
        manifest.background = {
            service_worker: "background.js",
            type: "module"
        };
        manifest.action.default_icon = {
            48: "images/icon-48.png",
            96: "images/icon-96.png"
        };
        return manifest;
    }

    manifest.background = {
        scripts: ["background.js"],
        type: "module"
    };

    if (browser === "firefox") {
        manifest.action.default_icon = {
            48: "images/icon-48.png",
            96: "images/icon-96.png"
        };
        manifest.browser_specific_settings = {
            gecko: {
                id: "{8262c48d-51c6-48ec-92de-0db6dc521a8f}",
                strict_min_version: "128.0",
                data_collection_permissions: {
                    required: ["none"]
                }
            }
        };
    }

    return manifest;
}

async function writeManifest(browser) {
    const manifestPath = path.join(resourcesRoot, "manifest.json");
    const manifest = manifestForBrowser(JSON.parse(await fs.readFile(manifestPath, "utf8")), browser);
    await fs.writeFile(
        path.join(distRoot, browser, "manifest.json"),
        `${JSON.stringify(manifest, null, 4)}\n`
    );
}

async function writeZip(sourceDirectory, outputPath) {
    const files = await listFiles(sourceDirectory);
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const data = await fs.readFile(path.join(sourceDirectory, file));
        const localPart = localFileHeader(file, data);

        localParts.push(localPart);
        centralParts.push(centralDirectoryHeader(file, data, offset));
        offset += localPart.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = endOfCentralDirectory(files.length, centralDirectory.length, offset);
    await fs.writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
}

async function buildBrowser(browser) {
    const outputDirectory = path.join(distRoot, browser);
    await fs.cp(resourcesRoot, outputDirectory, { recursive: true });
    await writeManifest(browser);
    await writeZip(outputDirectory, path.join(releaseRoot, `roter-${browser}.zip`));
}

async function main() {
    await fs.rm(distRoot, { force: true, recursive: true });
    await fs.rm(releaseRoot, { force: true, recursive: true });
    await fs.mkdir(distRoot, { recursive: true });
    await fs.mkdir(releaseRoot, { recursive: true });

    for (const browser of browsers) {
        await buildBrowser(browser);
        console.log(`Built ${browser} web extension`);
    }
}

await main();
