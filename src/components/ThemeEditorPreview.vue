<template>
  <div class="theme-editor-shell">
    <div class="theme-editor-grid">
      <div class="theme-editor-controls">
        <div v-for="category in tokenCategories" :key="category.label" class="theme-editor-category">
          <button
            type="button"
            class="theme-editor-category-toggle"
            @click="toggleCategory(category.label)"
            :aria-expanded="isCategoryExpanded(category.label)"
          >
            <span class="theme-editor-category-toggle-icon" aria-hidden="true">
              {{ isCategoryExpanded(category.label) ? '▾' : '▸' }}
            </span>
            <span class="theme-editor-category-title">{{ category.label }}</span>
          </button>
          <div v-show="isCategoryExpanded(category.label)">
            <div
              v-for="token in category.tokens"
              :key="token.name"
              :class="['theme-editor-control-row', { 'no-label': !token.label }]"
            >
              <component
                v-if="token.label"
                :is="isColorToken(values[token.name]) ? 'div' : 'label'"
                :for="isColorToken(values[token.name]) ? undefined : `${tokenId(token)}-text`"
                class="theme-editor-control-label"
              >
                {{ token.label }}
              </component>
              <div class="theme-editor-control-inputs">
              <template v-if="isGradientToken(values[token.name])">
                <div class="theme-editor-gradient-editor">
                  <div class="theme-editor-gradient-preview" :style="{ background: values[token.name] }"></div>
                  <div class="theme-editor-gradient-stop-grid">
                    <template v-for="(stop, stopIndex) in parseGradientValue(values[token.name])?.stops || []" :key="stopIndex">
                      <label :for="`${tokenId(token)}-stop-${stopIndex}`">Stop {{ stopIndex + 1 }}</label>
                      <input
                        :id="`${tokenId(token)}-stop-${stopIndex}`"
                        type="color"
                        :value="colorControlValue(getGradientStopColor(stop))"
                        @input="updateGradientStopColor(token.name, stopIndex, ($event.target as HTMLInputElement).value)"
                        class="theme-editor-color-input"
                      />
                    </template>
                  </div>
                  <input
                    :id="`${tokenId(token)}-text`"
                    type="text"
                    :value="values[token.name]"
                    @input="updateTokenValue(token.name, ($event.target as HTMLInputElement).value)"
                    class="theme-editor-text-input"
                  />
                </div>
              </template>
              <template v-else-if="token.name === '--theme-user-colors'">
                <div class="theme-editor-user-colors">
                  <div
                    v-for="(color, index) in previewPalette"
                    :key="index"
                    class="theme-editor-user-color-row"
                  >
                    <label :for="`${tokenId(token)}-color-${index}`">Color {{ index + 1 }}</label>
                    <input
                      :id="`${tokenId(token)}-color-${index}`"
                      type="color"
                      :value="color"
                      @input="updateUserColorPalette(index, ($event.target as HTMLInputElement).value)"
                      class="theme-editor-color-input"
                    />
                  </div>
                </div>
              </template>
              <template v-else-if="isColorToken(values[token.name])">
                <input
                  :id="tokenId(token)"
                  type="color"
                  :value="colorControlValue(values[token.name])"
                  @input="updateTokenColor(token.name, ($event.target as HTMLInputElement).value)"
                  class="theme-editor-color-input"
                />
                <div class="theme-editor-color-meta">
                  <input
                    v-if="hasAlphaControl(values[token.name])"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    :value="alphaControlValue(values[token.name])"
                    @input="updateTokenAlpha(token.name, parseFloat(($event.target as HTMLInputElement).value))"
                    class="theme-editor-alpha-input"
                  />
                </div>
              </template>
              <template v-else>
                <input
                  :id="`${tokenId(token)}-text`"
                  type="text"
                  :value="values[token.name]"
                  @input="updateTokenValue(token.name, ($event.target as HTMLInputElement).value)"
                  class="theme-editor-text-input"
                />
              </template>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div class="theme-editor-preview" :class="{ 'scanlines-enabled': showScanlines }" :style="previewStyle">
        <div class="theme-preview-shell">
          <div class="theme-preview-title">THEME PREVIEW</div>
          <div class="theme-preview-topbar">
            <span class="theme-preview-badge">LIVE</span>
            <span class="theme-preview-label">{{ themeName }}</span>
          </div>
          <div class="theme-preview-content">
            <section class="theme-preview-main-view">
              <div class="theme-preview-chat-panel">
                <div class="theme-preview-lobby-tabs">
                  <button class="theme-preview-lobby-tab active" type="button">
                    <span class="theme-preview-lobby-label">#lobby</span>
                  </button>
                </div>
                <div class="theme-preview-message-list">
                  <div class="system-msg">
                    <span class="text">[Theme editor changes now affect this preview.]</span>
                  </div>
                  <div class="msg self-msg">
                    <div class="sender-avatar-wrap">
                      <div
                        class="sender-avatar-sprite"
                        :style="{
                          backgroundImage: previewAvatars[0] ? `url(${previewAvatars[0].src})` : undefined,
                          backgroundPosition: previewAvatars[0]?.position,
                          backgroundSize: '300% 300%',
                        }"
                      ></div>
                    </div>
                    <div class="message-body">
                      <span class="sender" style="color: var(--color-accent)">ME:</span>
                      <span class="text" style="color: var(--color-accent)">Looks good — this feels closer to the real UI.</span>
                    </div>
                  </div>
                  <div class="msg">
                    <div class="sender-avatar-wrap">
                      <div
                        class="sender-avatar-sprite"
                        :style="{
                          backgroundImage: previewAvatars[1] ? `url(${previewAvatars[1].src})` : undefined,
                          backgroundPosition: previewAvatars[1]?.position,
                          backgroundSize: '300% 300%',
                        }"
                      ></div>
                    </div>
                    <div class="message-body">
                      <span class="sender" :style="{ color: getPreviewUserColor('otter') }">otter:</span>
                      <span class="text" style="color: var(--color-text-primary)">Nice. The sidebar should reflect presence colors too.</span>
                    </div>
                  </div>
                </div>
                <div class="input-bar">
                  <input id="chat-msg" type="text" placeholder="READY TO TRANSMIT..." />
                  <button class="send-btn">SEND</button>
                </div>
              </div>
              <aside class="theme-preview-sidebar">
                <div class="theme-preview-sidebar-header">
                  <div class="agent-header-title">
                    <span>[4] AGENTS</span>
                    <button class="theme-preview-away-toggle-btn" type="button" aria-label="Status">
                      <span class="theme-preview-status-dot" aria-hidden="true"></span>
                    </button>
                  </div>
                  <div class="theme-preview-sidebar-actions">
                    <button class="theme-preview-profile-btn" type="button" aria-label="Profile">&#x1F464;&#xFE0E;</button>
                    <button class="theme-preview-gear-btn" type="button" aria-label="Settings">⚙</button>
                  </div>
                </div>
                <div class="theme-preview-sidebar-list">
                  <div class="theme-preview-user-node">
                    <button class="user-bullet-btn" type="button" aria-label="Online status">
                      <span class="theme-preview-status-dot"></span>
                    </button>
                    <button class="user-handle-btn" type="button" :style="{ color: getPreviewUserColor('fox') }">
                      fox
                    </button>
                  </div>
                  <div class="theme-preview-user-node">
                    <button class="user-bullet-btn" type="button" aria-label="Away">
                      <span aria-hidden="true">💤</span>
                    </button>
                    <button class="user-handle-btn" type="button" :style="{ color: getPreviewUserColor('sunbird') }">
                      sunbird
                    </button>
                  </div>
                  <div class="theme-preview-user-node">
                    <button class="user-bullet-btn" type="button" aria-label="Media active">
                      <span aria-hidden="true">⚡</span>
                    </button>
                    <button class="user-handle-btn" type="button" :style="{ color: getPreviewUserColor('otter') }">
                      otter
                    </button>
                  </div>
                  <div class="theme-preview-user-node">
                    <button class="user-bullet-btn" type="button" aria-label="Offline">
                      <span aria-hidden="true">•</span>
                    </button>
                    <button class="user-handle-btn" type="button" :style="{ color: getPreviewUserColor('raven') }">
                      raven
                    </button>
                  </div>
                </div>

                <div class="theme-preview-profile-popup">
                  <div class="theme-preview-popup-header">PROFILE HOVER PREVIEW</div>
                  <div class="user-details-card theme-preview-profile-card">
                    <div class="user-details-username-row">
                      <div class="user-details-name">FOX</div>
                    </div>
                    <div class="user-details-avatar-col">
                      <div class="user-details-avatar-wrap">
                        <div
                          v-if="profileAvatarStyle.backgroundImage"
                          class="sender-avatar-sprite"
                          :style="profileAvatarStyle"
                        ></div>
                        <div v-else class="user-details-avatar-placeholder">F</div>
                      </div>
                    </div>
                    <div class="user-details-main">
                      <div class="user-details-tagline-row">
                        <div class="user-details-tagline">Light theme lover • Always online</div>
                      </div>
                    </div>
                    <div class="user-details-action-row">
                      <button type="button" class="request-tunnel-btn">REQUEST TUNNEL</button>
                    </div>
                  </div>
                </div>
              </aside>
            </section>
          </div>
        </div>

        <div class="theme-preview-agentamp">
          <section class="agentamp-dock" :style="agentAmpStyle">
            <div class="agentamp-now-playing">
              <div class="agentamp-now-meta">
                <div class="agentamp-now-copy">
                  <span class="agentamp-label label-now">NOW</span>
                  <span class="agentamp-track-name">Bright Signal / preview mix</span>
                </div>
              </div>
              <div class="agentamp-now-pinned-controls compact-toggle-pinned">
                <button class="agentamp-btn compact-toggle-btn agentamp-detached-toggle" type="button" data-tooltip="DOCK AGENTAMP">⇄</button>
                <button class="agentamp-btn compact-toggle-btn agentamp-library-toggle" type="button" data-tooltip="SHOW LIBRARY">🕮</button>
                <button class="agentamp-btn compact-toggle-btn agentamp-compact-toggle-spaced" type="button" data-tooltip="COMPACT">⇋</button>
              </div>
            </div>
            <div class="agentamp-spectrogram" aria-hidden="true">
              <span class="agentamp-spectrum-bar low" style="height: 18%;"></span>
              <span class="agentamp-spectrum-bar low" style="height: 34%;"></span>
              <span class="agentamp-spectrum-bar medium" style="height: 48%;"></span>
              <span class="agentamp-spectrum-bar medium" style="height: 60%;"></span>
              <span class="agentamp-spectrum-bar high" style="height: 84%;"></span>
              <span class="agentamp-spectrum-bar high" style="height: 100%;"></span>
              <span class="agentamp-spectrum-bar medium" style="height: 54%;"></span>
              <span class="agentamp-spectrum-bar low" style="height: 28%;"></span>
            </div>
            <div class="agentamp-controls">
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="PREVIOUS">&lt;&lt;</button>
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="PLAY">&gt;</button>
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="STOP">[]</button>
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="NEXT">&gt;&gt;</button>
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="CLEAR PLAYLIST">X</button>
              <button class="agentamp-btn transport-btn" type="button" data-tooltip="SAVE PLAYLIST">⤓</button>
              <div class="agentamp-seek-wrap">
                <span class="agentamp-timecode">0:25</span>
                <input class="agentamp-range agentamp-seek-range" type="range" min="0" max="180" value="25" />
                <span class="agentamp-timecode">3:00</span>
              </div>
              <label class="agentamp-volume-wrap">
                VOL
                <input class="agentamp-range" type="range" min="0" max="1" step="0.01" value="0.7" />
              </label>
            </div>
          </section>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { getAvatarPacks, getAvatarObjectPosition } from '../composables/useAvatarPacks';

const DEFAULT_USER_COLOR_PALETTE = [
  '#39ff14',
  '#00ff00',
  '#00ffaa',
  '#00ffff',
  '#00aaff',
  '#0055ff',
  '#aa00ff',
  '#ff00ff',
  '#ff0055',
  '#ff5500',
  '#ffff00',
  '#55ff00',
  '#00ff55',
  '#55ffff',
  '#ff55ff',
];

const props = defineProps<{
  themeName?: string;
  themeSource?: string;
  showScanlines?: boolean;
}>();

const themeName = computed(() => props.themeName || 'retro-terminal');
const themeSource = computed(() => props.themeSource || '');
const showScanlines = computed(() => props.showScanlines ?? false);
const themeSourceValues = ref<Record<string, string>>({});
const previewAvatars = ref<{ src: string; position: string }[]>([]);
const profileAvatarStyle = computed(() => {
  const avatar = previewAvatars.value[0];
  if (!avatar) {
    return {};
  }

  return {
    backgroundImage: `url(${avatar.src})`,
    backgroundPosition: avatar.position,
    backgroundSize: '300% 300%',
  };
});
const expandedCategories = ref(new Set<string>());
const values = reactive<Record<string, string>>({});

const previewPalette = computed(() => {
  const rawValue = values['--theme-user-colors'] || themeSourceValues.value['--theme-user-colors'] || '';
  const palette = parseUserColors(rawValue);
  const normalized = palette.length > 0 ? palette : DEFAULT_USER_COLOR_PALETTE;

  if (normalized.length >= DEFAULT_USER_COLOR_PALETTE.length) {
    return normalized;
  }

  return [
    ...normalized,
    ...DEFAULT_USER_COLOR_PALETTE.slice(normalized.length),
  ];
});

function getPreviewUserColor(str: string) {
  const palette = previewPalette.value;
  if (palette.length === 0) {
    return '#39ff14';
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return palette[Math.abs(hash) % palette.length];
}

function parseUserColors(raw: string | undefined | null) {
  return String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateUserColorPalette(index: number, nextColor: string) {
  const palette = parseUserColors(values['--theme-user-colors'] || themeSourceValues.value['--theme-user-colors'] || '');
  const normalized = [...palette];
  while (normalized.length < DEFAULT_USER_COLOR_PALETTE.length) {
    normalized.push(DEFAULT_USER_COLOR_PALETTE[normalized.length]);
  }
  normalized[index] = nextColor;
  values['--theme-user-colors'] = normalized.join(', ');
}

const tokenCategories = [
  {
    label: 'Core Colors',
    tokens: [
      { name: '--color-bg-base', label: 'Background' },
      { name: '--color-accent', label: 'Accent' },
      { name: '--color-on-accent', label: 'Accent text' },
      { name: '--color-text-primary', label: 'Primary text' },
      { name: '--color-text-secondary', label: 'Secondary text' },
      { name: '--color-danger', label: 'Danger' },
      { name: '--color-on-danger', label: 'Danger text' },
    ],
  },
  {
    label: 'Chat & System',
    tokens: [
      { name: '--color-chat-bg', label: 'Background' },
      { name: '--color-chat-surface', label: 'Surface' },
      { name: '--color-chat-surface-strong', label: 'Surface strong' },
      { name: '--color-chat-text', label: 'Text' },
      { name: '--color-chat-text-muted', label: 'Text muted' },
      { name: '--color-chat-border', label: 'Border' },
      { name: '--color-chat-link', label: 'Link' },
      { name: '--color-chat-link-hover', label: 'Link hover' },
      { name: '--color-chat-warning', label: 'Warning' },
      { name: '--color-chat-warning-contrast', label: 'Warning contrast' },
    ],
  },
  {
    label: 'Sidebar',
    tokens: [
      { name: '--color-sidebar-bg', label: 'Background' },
      { name: '--color-sidebar-status-dot', label: 'Status dot' },
      { name: '--color-sidebar-status-dot-glow', label: 'Status dot glow' },
    ],
  },
  {
    label: 'User colors',
    tokens: [
      { name: '--theme-user-colors', label: '' },
    ],
  },
  {
    label: 'Window & DM',
    tokens: [
      { name: '--color-dmwindow-bg', label: 'Window background' },
      { name: '--color-dmwindow-titlebar-bg', label: 'Titlebar' },
      { name: '--color-dmwindow-titlebar-border', label: 'Titlebar border' },
      { name: '--color-dmwindow-button-border', label: 'Button border' },
      { name: '--color-dmwindow-button-hover-bg', label: 'Button hover' },
      { name: '--color-dmwindow-close-border', label: 'Close border' },
    ],
  },
  {
    label: 'Settings UI',
    tokens: [
      { name: '--color-settings-surface', label: 'Surface' },
      { name: '--color-settings-overlay', label: 'Overlay' },
      { name: '--color-settings-divider', label: 'Divider' },
      { name: '--color-settings-code-bg', label: 'Code background' },
      { name: '--color-settings-code-border', label: 'Code border' },
      { name: '--color-settings-accent-glow', label: 'Accent glow' },
    ],
  },
  {
    label: 'AgentAmp',
    tokens: [
      { name: '--color-agentamp-bg', label: 'Background' },
      { name: '--color-agentamp-border', label: 'Border' },
      { name: '--color-agentamp-panel-bg', label: 'Panel' },
      { name: '--color-agentamp-panel-border', label: 'Panel border' },
      { name: '--color-agentamp-button-bg', label: 'Button' },
      { name: '--color-agentamp-button-border', label: 'Button border' },
      { name: '--color-agentamp-button-text', label: 'Button text' },
      { name: '--color-agentamp-button-hover-bg', label: 'Button hover' },
      { name: '--color-agentamp-button-hover-text', label: 'Button hover text' },
      { name: '--color-spectrum-threshold-low', label: 'Spectrum low threshold' },
      { name: '--color-spectrum-threshold-medium', label: 'Spectrum medium threshold' },
      { name: '--color-spectrum-threshold-high', label: 'Spectrum high threshold' },
      { name: '--color-agentamp-track-row-border', label: 'Spectrum row border' },
      { name: '--color-agentamp-track-active-glow', label: 'Spectrum active glow' },
      { name: '--color-agentamp-label-next', label: 'Label next' },
      { name: '--color-agentamp-label-then', label: 'Label then' },
    ],
  },
];

const allTokens = computed(() => tokenCategories.flatMap((category) => category.tokens));

function isCategoryExpanded(categoryLabel: string) {
  return expandedCategories.value.has(categoryLabel);
}

function toggleCategory(categoryLabel: string) {
  if (expandedCategories.value.has(categoryLabel)) {
    expandedCategories.value.delete(categoryLabel);
  } else {
    expandedCategories.value.add(categoryLabel);
  }
}

function tokenId(token: { name: string }): string {
  return token.name.replace(/^--/, '').replace(/[^a-z0-9]+/gi, '-');
}

function parseThemeVariables(cssSource: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const variableRegex = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;

  while ((match = variableRegex.exec(cssSource)) !== null) {
    variables[match[1]] = match[2].trim();
  }

  return variables;
}

function resolveThemeTokenValue(tokenName: string, fallback = '') {
  return themeSourceValues.value[tokenName] || fallback;
}

function updateSourceValuesFromProps() {
  themeSourceValues.value = parseThemeVariables(themeSource.value);
}

function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseColorValue(raw: string | undefined | null) {
  const value = String(raw ?? '').trim();
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    return { kind: 'hex' as const, hex: value, alpha: 1 };
  }

  const rgbMatch = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (rgbMatch) {
    return { kind: 'rgb' as const, hex: rgbaToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])), alpha: 1 };
  }

  const rgbaMatch = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/i);
  if (rgbaMatch) {
    return {
      kind: 'rgba' as const,
      hex: rgbaToHex(Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])),
      alpha: Number(rgbaMatch[4]),
    };
  }

  return null;
}

function formatColorValue(hex: string, alpha: number, originalKind: 'hex' | 'rgb' | 'rgba') {
  if (alpha >= 1 && originalKind !== 'rgba') {
    return hex;
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function isGradientToken(value: string | undefined | null) {
  return parseGradientValue(value) !== null;
}

function splitGradientParts(body: string) {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of body) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    }

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseGradientValue(raw: string | undefined | null) {
  const value = String(raw ?? '').trim();
  const gradientMatches = value.match(/(linear|radial)-gradient\(/gi) || [];
  if (gradientMatches.length > 1) {
    // Composite gradient values are not supported by the simple stop editor.
    return null;
  }

  const gradientMatch = value.match(/^(linear|radial)-gradient\((.+)\)$/i);
  if (!gradientMatch) {
    return null;
  }

  const body = gradientMatch[2];
  const parts = splitGradientParts(body);

  let direction = '';
  let stops = parts;

  if (parts.length > 1 && /^(to\s|top|bottom|left|right|circle|ellipse|\d)/i.test(parts[0])) {
    direction = parts[0];
    stops = parts.slice(1);
  }

  return {
    kind: gradientMatch[1].toLowerCase() as 'linear' | 'radial',
    direction,
    stops,
  };
}

function getGradientStopColor(stop: string) {
  const stopMatch = stop.match(/(rgba?\([^\)]+\)|#(?:[0-9a-f]{6}|[0-9a-f]{3})|[a-z]+)/i);
  return stopMatch?.[1] ?? '#000000';
}

function formatGradientStopColor(stop: string, nextHex: string) {
  const currentColor = getGradientStopColor(stop);
  const parsed = parseColorValue(currentColor);
  const alpha = parsed?.alpha ?? 1;
  const formatted = formatColorValue(nextHex, alpha, parsed?.kind ?? 'rgba');
  return stop.replace(/(rgba?\([^\)]+\)|#(?:[0-9a-f]{6}|[0-9a-f]{3})|[a-z]+)/i, formatted);
}

function buildGradientValue(parsed: { kind: 'linear' | 'radial'; direction: string; stops: string[] }) {
  const body = parsed.direction ? `${parsed.direction}, ${parsed.stops.join(', ')}` : parsed.stops.join(', ');
  return `${parsed.kind}-gradient(${body})`;
}

function isColorToken(value: string | undefined | null) {
  return !isGradientToken(value) && parseColorValue(value) !== null;
}

function colorControlValue(value: string | undefined | null) {
  const parsed = parseColorValue(value);
  return parsed?.hex ?? '#000000';
}

function alphaControlValue(value: string | undefined | null) {
  const parsed = parseColorValue(value);
  return Math.round((parsed?.alpha ?? 1) * 100);
}

function hasAlphaControl(value: string | undefined | null) {
  const parsed = parseColorValue(value);
  return parsed?.kind === 'rgba' || (parsed?.alpha ?? 1) !== 1;
}

function updateTokenValue(tokenName: string, nextValue: string) {
  values[tokenName] = nextValue.trim();
}

function updateTokenColor(tokenName: string, nextHex: string) {
  if (isGradientToken(values[tokenName])) {
    const parsed = parseGradientValue(values[tokenName]);
    if (!parsed) {
      values[tokenName] = nextHex;
      return;
    }
    parsed.stops = parsed.stops.map((stop, idx) => {
      if (idx !== 0) return stop;
      return formatGradientStopColor(stop, nextHex);
    });
    values[tokenName] = buildGradientValue(parsed);
    return;
  }

  const parsed = parseColorValue(values[tokenName]);
  const alpha = parsed?.alpha ?? 1;
  const kind = parsed?.kind ?? 'hex';
  values[tokenName] = formatColorValue(nextHex, alpha, kind);
}

function updateTokenAlpha(tokenName: string, nextAlpha: number) {
  if (isGradientToken(values[tokenName])) {
    const parsed = parseGradientValue(values[tokenName]);
    if (!parsed) {
      return;
    }
    values[tokenName] = buildGradientValue(parsed);
    return;
  }

  const parsed = parseColorValue(values[tokenName]);
  const hex = parsed?.hex ?? '#000000';
  const kind = parsed?.kind === 'hex' ? 'rgba' : parsed?.kind ?? 'rgba';
  const alpha = Number.isFinite(nextAlpha) ? Math.min(100, Math.max(0, nextAlpha)) / 100 : (parsed?.alpha ?? 1);
  values[tokenName] = formatColorValue(hex, alpha, kind);
}

function updateGradientStopColor(tokenName: string, stopIndex: number, nextHex: string) {
  const parsed = parseGradientValue(values[tokenName]);
  if (!parsed) {
    return;
  }
  parsed.stops = parsed.stops.map((stop, idx) => {
    if (idx !== stopIndex) return stop;
    return formatGradientStopColor(stop, nextHex);
  });
  values[tokenName] = buildGradientValue(parsed);
}

function resetThemeValues() {
  for (const token of allTokens.value) {
    values[token.name] = resolveThemeTokenValue(token.name, '#000000');
  }
}

function initializePreviewAvatars() {
  const packs = getAvatarPacks();
  if (packs.length === 0) {
    previewAvatars.value = [];
    return;
  }

  const pack = packs[Math.floor(Math.random() * packs.length)];
  const indices = [0, 4];
  previewAvatars.value = indices.map((index) => ({
    src: pack.src,
    position: getAvatarObjectPosition(index),
  }));
}

const previewStyle = computed(() => {
  const style: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(themeSourceValues.value).map(([name, value]) => [name, value])
    ),
  };

  for (const token of allTokens.value) {
    style[token.name] = values[token.name] || style[token.name] || '';
  }

  return style;
});

const agentAmpStyle = computed(() => {
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(previewStyle.value)) {
    if (name.startsWith('--color-agentamp-')) {
      style[name] = value;
    }
  }
  return style;
});

const cssSnippet = computed(() => {
  const lines = allTokens.value.map((token) => `  ${token.name}: ${values[token.name] || ''};`);
  return `:root[data-theme='${themeName.value}'] {\n${lines.join('\n')}\n}`;
});

defineExpose({
  resetThemeValues,
  cssSnippet,
});

onMounted(() => {
  updateSourceValuesFromProps();
  resetThemeValues();
  initializePreviewAvatars();
});

watch(
  () => themeSource.value,
  () => {
    updateSourceValuesFromProps();
    resetThemeValues();
  }
);

watch(
  () => props.themeName,
  () => {
    resetThemeValues();
  }
);
</script>

<style scoped>
.theme-editor-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding-right: 6px;
}

.theme-editor-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(360px, 2fr);
  gap: 16px;
}

.theme-editor-controls {
  display: grid;
  gap: 12px;
  padding: 12px;
  background: var(--color-chat-surface);
  border: 1px solid var(--color-chat-border);
  max-height: calc(100vh - 128px);
  overflow-y: auto;
}

.theme-editor-category {
  display: grid;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-chat-border);
}

.theme-editor-category-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.theme-editor-category-toggle:hover {
  color: var(--color-accent);
}

.theme-editor-category-toggle-icon {
  display: inline-flex;
  width: 18px;
  justify-content: center;
}

.theme-editor-category-title {
  color: var(--color-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.theme-editor-control-row {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.theme-editor-control-row.no-label {
  grid-template-columns: 1fr;
}

.theme-editor-control-row.no-label .theme-editor-control-inputs {
  grid-column: 1 / -1;
}

.theme-editor-control-label,
.theme-editor-control-row label {
  font-size: 0.78rem;
  color: var(--color-accent);
  letter-spacing: 0.06em;
  align-self: center;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.theme-editor-control-inputs {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.theme-editor-color-input,
.theme-editor-text-input,
.theme-editor-alpha-input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--color-chat-border);
  background: var(--color-chat-surface);
  color: var(--color-text-primary);
  padding: 8px 10px;
  border-radius: 10px;
  font: inherit;
}

.theme-editor-color-input {
  width: 52px;
  padding: 0;
  height: 34px;
  border-radius: 10px;
}

.theme-editor-alpha-input {
  width: 60px;
  max-width: 60px;
  text-align: right;
}

.theme-editor-color-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-editor-user-colors {
  display: grid;
  gap: 10px;
}

.theme-editor-user-color-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px;
  gap: 8px;
  align-items: center;
}

.theme-editor-user-colors-text {
  min-height: 84px;
  resize: vertical;
}

.theme-editor-gradient-editor {
  display: grid;
  gap: 8px;
}

.theme-editor-gradient-preview {
  min-height: 44px;
  border: 1px solid var(--color-chat-border);
  border-radius: 6px;
}

.theme-editor-gradient-stop-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.theme-editor-alpha-label {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}

.theme-editor-value {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-editor-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-preview-shell {
  position: relative;
  border: 1px solid var(--color-chat-border);
  background: var(--color-settings-surface);
  color: var(--color-text-primary);
  padding: 14px;
  display: grid;
  gap: 12px;
}

.theme-editor-preview.scanlines-enabled .theme-preview-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px);
  background-size: 100% 4px;
  opacity: 0.7;
}

.theme-preview-shell .gear-btn {
  top: 12px;
  right: 12px;
  color: var(--color-accent);
  font-size: 24px;
}

.theme-preview-title {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-accent);
}

.theme-preview-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary);
}

.theme-preview-badge {
  background: var(--color-accent);
  color: var(--color-on-accent);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.theme-preview-label {
  font-size: 0.8rem;
}

.theme-preview-content {
  display: grid;
  gap: 10px;
}

.theme-preview-main-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 10px;
}

.theme-preview-chat-panel {
  display: grid;
  gap: 10px;
  background: var(--color-chat-bg);
  border: 1px solid var(--color-chat-border);
  padding: 10px;
  min-height: 320px;
}

.theme-preview-lobby-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 6px;
}

.theme-preview-lobby-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-accent-muted);
  background: var(--color-chat-surface);
  color: var(--color-chat-text-muted);
  padding: 5px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
  max-width: 180px;
  flex-shrink: 0;
}

.theme-preview-lobby-tab.active {
  color: var(--color-on-accent);
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.theme-preview-lobby-label {
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-preview-message-list {
  display: grid;
  gap: 12px;
  padding: 4px 0;
}

.system-msg {
  text-align: center;
  color: var(--color-chat-text-muted);
  font-size: 13px;
  margin: 15px 0;
  letter-spacing: 1px;
  font-weight: bold;
  background: linear-gradient(90deg, transparent, var(--color-accent-muted), transparent);
}

.msg {
  position: relative;
  margin-bottom: 12px;
  line-height: 1.5;
  border-left: 3px solid var(--color-accent-muted);
  padding: 12px 12px 12px 56px;
  max-width: min(78%, 100%);
}

.msg.self-msg {
  margin-left: auto;
  border-left: none;
  border-right: 3px solid var(--color-accent-muted);
  padding: 12px 56px 12px 12px;
  text-align: right;
}

.sender-avatar-wrap {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.msg.self-msg .sender-avatar-wrap {
  left: auto;
  right: 12px;
}

.sender-avatar-sprite {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background-repeat: no-repeat;
}

.message-body {
  display: block;
}

.sender {
  font-weight: bold;
  margin-bottom: 6px;
  text-shadow: 0 0 5px currentColor;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.text {
  display: inline;
}

.input-bar {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-top: 1px solid var(--color-accent);
  height: 36px;
  background: var(--color-chat-bg);
}

#chat-msg {
  background: transparent;
  border: none;
  color: var(--color-accent);
  padding: 0 20px;
  flex: 1;
  height: 100%;
  font-family: inherit;
  font-size: 18px;
  outline: none;
}

#chat-msg:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  padding: 0 30px;
  cursor: pointer;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

.send-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.theme-preview-sidebar {
  gap: 6px;
  background: var(--color-sidebar-bg);
  border: 1px solid var(--color-chat-border);
  padding: 8px;
  min-height: 320px;
}

.theme-preview-profile-popup {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-preview-profile-card {
  width: 100%;
  max-width: 300px;
  display: grid;
  grid-template-columns: 88px 1fr;
  grid-template-rows: auto auto auto;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-dmwindow-titlebar-border);
  border-radius: 18px;
  background: var(--color-dmwindow-bg);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

.user-details-username-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  text-align: center;
  padding-bottom: 2px;
}

.user-details-name {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--color-text-primary);
}

.user-details-avatar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.user-details-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}

.user-details-tagline-row {
  display: flex;
  align-items: center;
  min-height: 100%;
}

.user-details-action-row {
  grid-column: 1 / -1;
}

.user-details-avatar-wrap {
  width: 90px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.user-details-avatar-placeholder {
  width: 90px;
  height: 90px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
  font-size: 28px;
  text-transform: uppercase;
}

.user-details-tagline-row {
  display: flex;
  align-items: center;
  min-height: 100%;
}

.user-details-tagline {
  color: var(--color-text-secondary);
}

.request-tunnel-btn {
  width: 100%;
  border: 1px solid rgba(120, 138, 255, 0.4);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 12px;
  text-transform: uppercase;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.request-tunnel-btn:hover {
  background: rgba(120, 138, 255, 0.12);
}

.theme-preview-sidebar-header .agent-header-title {
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.theme-preview-sidebar-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.theme-preview-away-toggle-btn,
.theme-preview-profile-btn,
.theme-preview-gear-btn {
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 18px;
  cursor: pointer;
}

.theme-preview-gear-btn {
  font-size: 18px;
}

.theme-preview-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-sidebar-status-dot);
  box-shadow: 0 0 8px var(--color-sidebar-status-dot-glow);
}

.theme-preview-sidebar-list {
  display: block;
}

.theme-preview-sidebar-item {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--color-chat-surface);
  color: var(--color-chat-text);
}

.theme-preview-sidebar-item.active {
  border-color: var(--color-sidebar-dm-active-border);
  color: var(--color-sidebar-dm-active);
  box-shadow: 0 0 10px var(--color-sidebar-dm-active-glow);
}

.theme-preview-sidebar-item.muted {
  opacity: 0.7;
}

.theme-preview-user-node {
  margin-bottom: 4px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 6px 0;
}

.user-bullet-btn,
.user-handle-btn {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
}

.user-bullet-btn {
  width: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.user-bullet-btn span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.user-handle-btn {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-bullet-btn:focus-visible,
.user-handle-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.theme-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--color-chat-bg);
  border: 1px solid var(--color-chat-border);
  padding: 12px;
}

.theme-preview-panel-header {
  font-size: 0.82rem;
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
}

.theme-preview-chat-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: var(--color-chat-surface);
  color: var(--color-chat-text);
  border: 1px solid var(--color-chat-border);
  border-radius: 10px;
}

.theme-preview-chat-row.muted {
  background: var(--color-chat-surface-strong);
  color: var(--color-chat-text-muted);
}

.theme-preview-label-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-accent);
}

.theme-preview-sidebar-section {
  margin-top: 10px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.theme-preview-sidebar-status {
  padding: 10px;
  background: var(--color-chat-surface);
  border: 1px solid var(--color-chat-border);
  border-radius: 10px;
  color: var(--color-chat-text);
}

.theme-preview-actions {
  display: flex;
  gap: 8px;
}

.theme-preview-agentamp {
  display: grid;
  gap: 10px;
}

.agentamp-dock {
  border-top: 1px solid var(--color-agentamp-border);
  background: var(--color-agentamp-bg);
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: visible;
}

.agentamp-controls {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
}

.agentamp-btn {
  background: transparent;
  border: 1px solid var(--color-agentamp-button-border);
  color: var(--color-accent);
  font-family: inherit;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.8px;
  padding: 5px 8px;
  cursor: pointer;
}

.agentamp-icon-btn {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.agentamp-icon-btn:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.agentamp-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.transport-btn {
  min-width: 34px;
  height: 24px;
  padding: 0 6px;
  border-color: var(--color-agentamp-button-border);
  background: var(--color-agentamp-button-bg);
  color: var(--color-agentamp-button-text);
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  font-weight: 700;
}

.transport-btn:hover:not(:disabled) {
  background: var(--color-agentamp-button-hover-bg);
  color: var(--color-agentamp-button-hover-text);
}

.agentamp-now-playing {
  border: 1px solid var(--color-agentamp-panel-border);
  background: var(--color-agentamp-panel-bg);
  padding: 6px 92px 6px 8px;
  display: block;
  min-height: 30px;
  position: relative;
  z-index: 2;
}

.agentamp-now-meta,
.agentamp-now-inline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.agentamp-now-meta {
  justify-content: space-between;
}

.agentamp-now-copy {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agentamp-label {
  color: var(--color-accent);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
}

.agentamp-label.label-now {
  color: var(--color-accent);
}

.agentamp-track-name {
  color: var(--color-agentamp-button-text);
  font-size: 12px;
  line-height: 1.4;
}

.agentamp-now-pinned-controls.compact-toggle-pinned {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: inline-flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.agentamp-seek-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.agentamp-timecode {
  font-size: 11px;
  color: var(--color-agentamp-button-text);
}

.agentamp-range {
  flex: 1;
  background: transparent;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.agentamp-range::-webkit-slider-thumb,
.agentamp-range::-moz-range-thumb,
.agentamp-range::-ms-thumb {
  cursor: pointer;
}

.agentamp-spectrogram {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  min-height: 70px;
  padding: 10px 0 0;
  border-top: 1px solid var(--color-agentamp-border);
}

.agentamp-spectrum-bar {
  flex: 1;
  min-width: 0;
  border-radius: 4px 4px 0 0;
  background: var(--color-accent);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.18);
}

.agentamp-spectrum-bar.low {
  background: var(--color-spectrum-threshold-low);
}

.agentamp-spectrum-bar.medium {
  background: var(--color-spectrum-threshold-medium);
}

.agentamp-spectrum-bar.high {
  background: var(--color-spectrum-threshold-high);
}

.agentamp-seek-range {
  width: 100%;
}

.agentamp-volume-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-agentamp-button-text);
  font-size: 10px;
}

</style>
