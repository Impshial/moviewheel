import { wheelClickTimes, type WheelSpin } from "@/lib/wheel-timing";

// Browser-only, local sound. No recordings or spin events leave this client.
export class WheelSounds {
  private context: AudioContext | null = null;
  private click: AudioBuffer | null = null;
  private ready: Promise<void> = Promise.resolve();
  private readonly abort = new AbortController();
  private readonly applause: Promise<AudioBuffer | null>;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private disposed = false;

  constructor() {
    // Decode ahead of the gesture without opening a live audio device or playing.
    this.applause = fetch("/audio/spin-applause.wav", { signal: this.abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Applause unavailable");
        return response.arrayBuffer();
      })
      .then((bytes) => new OfflineAudioContext(1, 1, 22050).decodeAudioData(bytes))
      .catch(() => null);
  }

  unlock() {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext({ latencyHint: "interactive" });
      this.click ??= this.makeClick(this.context);
      // Called directly in the Spin button gesture for mobile autoplay policies.
      this.ready = this.context.resume().catch(() => {});
    } catch {
      // Sound support or permissions must never prevent choosing a movie.
    }
  }

  start(spin: WheelSpin) {
    this.stop();
    const generation = this.generation;
    const startedAt = performance.now();
    void this.play(spin, startedAt, generation).catch(() => {});
  }

  private async play(spin: WheelSpin, startedAt: number, generation: number) {
    await this.ready;
    const context = this.context;
    const active = () => !this.disposed && generation === this.generation && !document.hidden;
    if (!context || context.state !== "running" || !this.click || !active()) return;
    const origin = context.currentTime - (performance.now() - startedAt) / 1000;
    for (const seconds of wheelClickTimes(spin)) {
      const when = origin + seconds;
      // Never bunch missed clicks together after a delayed resume.
      if (when >= context.currentTime) this.source(this.click, when);
    }
    const applause = await this.applause;
    if (!applause || !active() || context.state !== "running") return;
    const elapsed = (performance.now() - startedAt) / 1000;
    if (elapsed < applause.duration) this.source(applause, context.currentTime, elapsed, 0.65);
  }

  private source(buffer: AudioBuffer, when: number, offset = 0, volume = 1) {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.sources.delete(source);
    };
    source.start(when, offset);
    this.sources.add(source);
  }

  private makeClick(context: AudioContext) {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.025),
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const t = i / context.sampleRate;
      const attack = Math.min(1, t / 0.0008);
      samples[i] =
        (0.7 * (Math.random() * 2 - 1) + 0.3 * Math.sin(2 * Math.PI * 1800 * t)) *
        Math.exp(-t * 240) *
        attack *
        0.5;
    }
    return buffer;
  }

  stop() {
    this.generation++;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.abort.abort();
    if (this.context) void this.context.close().catch(() => {});
  }
}
