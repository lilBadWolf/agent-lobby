import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = config.version;
const tag = `app-v${version}`;
const repo = process.env.GITHUB_REPOSITORY;

// Maps filename suffix patterns to tauri updater platform keys
const PLATFORM_MAP = [
  { pattern: /_aarch64\.app\.tar\.gz$/, platform: 'darwin-aarch64' },
  { pattern: /_amd64\.AppImage\.tar\.gz$/, platform: 'linux-x86_64' },
  { pattern: /_x64-setup\.nsis\.zip$/, platform: 'windows-x86_64' },
];

console.log(`Fetching release assets for ${tag}...`);
const { assets } = JSON.parse(
  execSync(`gh release view "${tag}" --repo "${repo}" --json assets`, { encoding: 'utf8' })
);

const tmpDir = mkdtempSync(join(tmpdir(), 'updater-'));
const platforms = {};

try {
  for (const { platform, pattern } of PLATFORM_MAP) {
    const archiveAsset = assets.find(a => pattern.test(a.name));
    if (!archiveAsset) {
      console.warn(`Warning: no archive asset found for platform ${platform} — skipping`);
      continue;
    }

    const sigName = `${archiveAsset.name}.sig`;
    const sigAsset = assets.find(a => a.name === sigName);
    if (!sigAsset) {
      console.warn(`Warning: no .sig asset found for ${archiveAsset.name} — skipping`);
      continue;
    }

    execSync(
      `gh release download "${tag}" --repo "${repo}" --pattern "${sigName}" --dir "${tmpDir}"`,
      { stdio: 'inherit' }
    );

    const signature = readFileSync(join(tmpDir, sigName), 'utf8').trim();
    platforms[platform] = { signature, url: archiveAsset.url };
    console.log(`  [ok] ${platform}: ${archiveAsset.name}`);
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('No platform entries resolved — aborting latest.json generation');
  }

  const latestJson = {
    version,
    notes: 'See the assets below to download.',
    pub_date: new Date().toISOString(),
    platforms,
  };

  writeFileSync('latest.json', JSON.stringify(latestJson, null, 2));
  console.log('\nGenerated latest.json:\n', JSON.stringify(latestJson, null, 2));

  // Sign latest.json and require a signature artifact.
  const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
  const keyPassword = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  if (!privateKey || !keyPassword) {
    throw new Error('TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD must be set');
  }

  const keyPath = join(tmpDir, 'updater.key');
  writeFileSync(keyPath, privateKey);

  console.log('\nSigning latest.json with minisign...');
  execSync(`minisign -S -s "${keyPath}" -m latest.json -x latest.json.sig`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      MINISIGN_PASSWORD: keyPassword,
    },
  });

  const latestSig = readFileSync('latest.json.sig', 'utf8').trim();
  if (!latestSig) {
    throw new Error('latest.json.sig was created but is empty');
  }
  console.log('Signed latest.json successfully');

  // Upload both latest.json and its signature.
  const files = ['latest.json', 'latest.json.sig'];

  execSync(`gh release upload "${tag}" ${files.join(' ')} --repo "${repo}" --clobber`, { stdio: 'inherit' });
  console.log(`\nUploaded ${files.join(', ')} to release ${tag}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
