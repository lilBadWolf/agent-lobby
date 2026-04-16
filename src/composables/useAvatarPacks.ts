export interface AvatarPack {
  id: string;
  label: string;
  src: string;
}

export interface AvatarUrlSelection {
  src: string;
  avatarIndex: number | null;
}

const packModules = import.meta.glob('../assets/avatars/*.png', { eager: true }) as Record<string, { default: string }>;

function formatPackLabel(fileName: string): string {
  return fileName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const avatarPacks: AvatarPack[] = Object.entries(packModules)
  .map(([importPath, module]) => {
    const fileName = importPath.split('/').pop()?.replace('.png', '') ?? importPath;
    return {
      id: fileName,
      label: formatPackLabel(fileName),
      src: module.default,
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export function getAvatarPacks(): AvatarPack[] {
  return avatarPacks;
}

export function buildPackAvatarUrl(packId: string, avatarIndex: number): string {
  return `pack://${encodeURIComponent(packId)}?avatarIndex=${avatarIndex}`;
}

export function parseAvatarUrl(value?: string): AvatarUrlSelection | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    const rawIndex = parsed.searchParams.get('avatarIndex');
    const avatarIndex = rawIndex !== null && rawIndex !== '' ? Number(rawIndex) : null;

    if (parsed.protocol === 'pack:') {
      const packId = decodeURIComponent(parsed.hostname || parsed.pathname.replace(/^\/?/, ''));
      if (!packId) {
        return undefined;
      }
      return { src: `pack://${packId}`, avatarIndex };
    }

    const sanitizedSrc = `${parsed.origin}${parsed.pathname}`;
    if (avatarIndex !== null && (!Number.isFinite(avatarIndex) || avatarIndex < 0 || avatarIndex > 8)) {
      return { src: sanitizedSrc, avatarIndex: null };
    }

    return { src: sanitizedSrc, avatarIndex };
  } catch {
    return undefined;
  }
}

export function resolveAvatarSrc(value?: string): string | undefined {
  const parsed = parseAvatarUrl(value);
  if (!parsed) {
    return undefined;
  }

  if (parsed.src.startsWith('pack://')) {
    const packId = parsed.src.slice('pack://'.length);
    const pack = avatarPacks.find((entry) => entry.id === packId);
    if (!pack) {
      return undefined;
    }

    try {
      const resolved = new URL(pack.src, window.location.origin);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        return resolved.pathname + resolved.search + resolved.hash;
      }
      return pack.src;
    } catch {
      return pack.src;
    }
  }

  return parsed.src;
}

export function findAvatarPackSelection(value?: string): { pack: AvatarPack; avatarIndex: number } | undefined {
  const parsed = parseAvatarUrl(value);
  if (!parsed || parsed.avatarIndex === null) {
    return undefined;
  }

  if (parsed.src.startsWith('pack://')) {
    const packId = parsed.src.slice('pack://'.length);
    const pack = avatarPacks.find((entry) => entry.id === packId);
    if (!pack) {
      return undefined;
    }
    return { pack, avatarIndex: parsed.avatarIndex };
  }

  const pack = avatarPacks.find((entry) => entry.src === parsed.src);
  if (!pack) {
    return undefined;
  }

  return { pack, avatarIndex: parsed.avatarIndex };
}

export function getAvatarObjectPosition(index: number): string {
  // We divide by 2 because there are 2 "intervals" between 3 items
  // (Index 0 = 0%, Index 1 = 50%, Index 2 = 100%)
  const col = index % 3;
  const row = Math.floor(index / 3);
  const xPercent = (col / 2) * 100;
  const yPercent = (row / 2) * 100;
  return `${xPercent}% ${yPercent}%`;
}
