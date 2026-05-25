type ChannelPayload = string | ArrayBuffer | Blob;

type ChannelState = 'connecting' | 'open' | 'closing' | 'closed';

interface ChannelChaosOptions {
  minLatencyMs?: number;
  maxLatencyMs?: number;
  dropRate?: number;
  duplicateRate?: number;
  reorderRate?: number;
}

const defaultChaos: Required<ChannelChaosOptions> = {
  minLatencyMs: 0,
  maxLatencyMs: 0,
  dropRate: 0,
  duplicateRate: 0,
  reorderRate: 0,
};

class MockPairedDataChannel {
  readonly label = 'dm';
  readonly protocol = '';
  readonly ordered = true;
  readonly maxPacketLifeTime = null;
  readonly maxRetransmits = null;
  readonly negotiated = false;
  readonly id = 0;

  readyState: ChannelState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType: BinaryType = 'arraybuffer';

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  private readonly chaos: Required<ChannelChaosOptions>;
  private readonly messageListeners = new Set<(event: MessageEvent) => void>();
  private peer: MockPairedDataChannel | null = null;

  constructor(chaos: ChannelChaosOptions) {
    this.chaos = {
      ...defaultChaos,
      ...chaos,
    };
  }

  setPeer(peer: MockPairedDataChannel) {
    this.peer = peer;
  }

  send(data: ChannelPayload) {
    if (this.readyState !== 'open' || !this.peer || this.peer.readyState !== 'open') {
      throw new Error('RTCDataChannel is not open');
    }

    if (Math.random() < this.chaos.dropRate) {
      return;
    }

    const copies = Math.random() < this.chaos.duplicateRate ? 2 : 1;
    for (let index = 0; index < copies; index += 1) {
      const baseDelay = this.randomLatency();
      const reorderDelay = Math.random() < this.chaos.reorderRate ? this.chaos.maxLatencyMs + 10 : 0;
      const delay = baseDelay + reorderDelay + (index * 4);

      window.setTimeout(() => {
        this.peer?.deliverMessage(data);
      }, delay);
    }
  }

  close() {
    if (this.readyState === 'closed') {
      return;
    }

    this.readyState = 'closed';
    const closeEvent = new Event('close');
    this.onclose?.(closeEvent);

    if (this.peer && this.peer.readyState !== 'closed') {
      this.peer.readyState = 'closed';
      this.peer.onclose?.(closeEvent);
    }
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') {
      return;
    }

    if (typeof listener === 'function') {
      this.messageListeners.add(listener as (event: MessageEvent) => void);
      return;
    }

    this.messageListeners.add((event) => listener.handleEvent(event));
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') {
      return;
    }

    if (typeof listener === 'function') {
      this.messageListeners.delete(listener as (event: MessageEvent) => void);
    }
  }

  dispatchEvent(_event: Event): boolean {
    return true;
  }

  private deliverMessage(data: ChannelPayload) {
    if (this.readyState !== 'open') {
      return;
    }

    const event = { data } as MessageEvent;
    this.onmessage?.(event);
    this.messageListeners.forEach((listener) => {
      listener(event);
    });
  }

  private randomLatency(): number {
    const spread = Math.max(0, this.chaos.maxLatencyMs - this.chaos.minLatencyMs);
    return this.chaos.minLatencyMs + Math.round(Math.random() * spread);
  }
}

export function createPairedDataChannels(chaos: ChannelChaosOptions = {}) {
  const left = new MockPairedDataChannel(chaos);
  const right = new MockPairedDataChannel(chaos);
  left.setPeer(right);
  right.setPeer(left);

  return {
    left: left as unknown as RTCDataChannel,
    right: right as unknown as RTCDataChannel,
  };
}
