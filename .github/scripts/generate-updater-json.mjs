import { execSync } from 'child_process';
import fs from 'fs';

const repo = process.env.GITHUB_REPOSITORY;
const config = JSON.parse(fs.readFileSync('./src-tauri/tauri.conf.json', 'utf8'));
const version = config.version;
const tagName = `app-v${version}`;

console.log(`Generating updater JSON for ${tagName}...`);

// 1. Get all assets for this release from GitHub
const assetsJson = execSync(`gh release view ${tagName} --repo ${repo} --json assets`, { encoding: 'utf-8' });
const { assets } = JSON.parse(assetsJson);

const updaterJson = {
  version: `v${version}`,
  notes: `Release ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

// 2. Define how to map extensions to Tauri platform keys
const platformMap = [
  { key: 'darwin-aarch64', ext: '.app.tar.gz' },
  { key: 'darwin-x86_64',  ext: '.app.tar.gz' }, // Note: You'll need separate build if supporting both
  { key: 'linux-x86_64',   ext: '.AppImage.tar.gz' },
  { key: 'windows-x86_64', ext: '.nsis.zip' },
  { key: 'windows-x86_64', ext: '.msi.zip' }
];

for (const asset of assets) {
  // We only care about the actual bundles, not the .sig files directly
  if (asset.name.endsWith('.sig')) continue;

  const match = platformMap.find(p => asset.name.endsWith(p.ext));
  if (match) {
    console.log(`Found artifact for ${match.key}: ${asset.name}`);
    
    // Download the signature content directly from the release asset
    const signature = execSync(
      `gh release download ${tagName} -p "${asset.name}.sig" -O - --repo ${repo}`,
      { encoding: 'utf-8' }
    ).trim();

    updaterJson.platforms[match.key] = {
      url: asset.url,
      signature: signature
    };
  }
}

// 3. Save and Upload
fs.writeFileSync('latest.json', JSON.stringify(updaterJson, null, 2));
execSync(`gh release upload ${tagName} latest.json --repo ${repo} --clobber`);
console.log('Successfully uploaded latest.json');
