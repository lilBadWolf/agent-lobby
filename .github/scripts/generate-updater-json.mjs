import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const repo = process.env.GITHUB_REPOSITORY;
const config = JSON.parse(fs.readFileSync('./src-tauri/tauri.conf.json', 'utf8'));
const version = config.version;
const tagName = `app-v${version}`;

if (!repo) {
  throw new Error('GITHUB_REPOSITORY is required.');
}

console.log(`Generating updater JSON for ${tagName}...`);

function runJson(command) {
  return JSON.parse(execSync(command, { encoding: 'utf-8', stdio: 'pipe' }));
}

function runText(command) {
  return execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
}

function getPlatformKey(assetName) {
  if (assetName.endsWith('.app.tar.gz')) {
    if (assetName.includes('aarch64') || assetName.includes('arm64')) {
      return 'darwin-aarch64';
    }
    if (assetName.includes('x86_64') || assetName.includes('x64')) {
      return 'darwin-x86_64';
    }
    // Default to arm build when arch is omitted in the artifact name.
    return 'darwin-aarch64';
  }

  if (assetName.endsWith('.AppImage.tar.gz')) {
    if (assetName.includes('aarch64') || assetName.includes('arm64')) {
      return 'linux-aarch64';
    }
    return 'linux-x86_64';
  }

  if (assetName.endsWith('.nsis.zip')) {
    return 'windows-x86_64';
  }

  // MSI isn't used by Tauri's updater protocol, so skip it to avoid overriding NSIS.
  return null;
}

function getSignature(tag, assetName) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-signature-'));
  try {
    runText(`gh release download ${tag} -p "${assetName}.sig" -D "${tempDir}" --repo ${repo}`);
    const sigPath = path.join(tempDir, `${assetName}.sig`);
    if (!fs.existsSync(sigPath)) {
      throw new Error(`Signature file not found for ${assetName}`);
    }
    return fs.readFileSync(sigPath, 'utf-8').trim();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 1. Get all assets for this release from GitHub
const release = runJson(`gh api repos/${repo}/releases/tags/${tagName}`);
const assets = release.assets ?? [];

// Start with existing manifest when present so repeated runs can merge safely.
let existingManifest = null;
try {
  existingManifest = runJson(`gh release download ${tagName} -p latest.json -O - --repo ${repo}`);
  console.log('Found existing latest.json on release; merging platform entries.');
} catch {
  console.log('No existing latest.json found on release; creating a new manifest.');
}

const updaterJson = {
  version: `v${version}`,
  notes: `Release ${version}`,
  pub_date: new Date().toISOString(),
  platforms: { ...(existingManifest?.platforms ?? {}) }
};

console.log(`Discovered ${assets.length} release assets.`);

for (const asset of assets) {
  // We only care about the actual bundles, not the .sig files directly
  if (asset.name.endsWith('.sig')) continue;

  const platformKey = getPlatformKey(asset.name);
  if (!platformKey) continue;

  console.log(`Found artifact for ${platformKey}: ${asset.name}`);

  const signature = getSignature(tagName, asset.name);
  updaterJson.platforms[platformKey] = {
    url: asset.browser_download_url,
    signature
  };
}

// 3. Save and Upload
fs.writeFileSync('latest.json', JSON.stringify(updaterJson, null, 2));
execSync(`gh release upload ${tagName} latest.json --repo ${repo} --clobber`);
console.log(`Successfully uploaded latest.json with ${Object.keys(updaterJson.platforms).length} platform entries.`);
