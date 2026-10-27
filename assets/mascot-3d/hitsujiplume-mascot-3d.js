/** Dependency-free renderer for the generated sheep v2 atlas. */
export const CELL = Object.freeze({ width: 192, height: 208 });
export const STATES = Object.freeze({
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  'running-right': { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  'running-left': { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
});
const DEFAULT_SRC = new URL('./assets/sheep.webp', import.meta.url).href;

export class HitsujiplumeMascot3D extends HTMLElement {
  static observedAttributes = ['state', 'size', 'src', 'follow-pointer', 'label'];
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>
      :host{display:inline-block;width:var(--mascot-size,192px);max-width:100%;aspect-ratio:192/208;vertical-align:middle;contain:layout paint}
      canvas{display:block;width:100%;height:100%}
    </style><canvas width="192" height="208" role="img"></canvas>`;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.context = this.canvas.getContext('2d');
    this.image = null;
    this.state = 'idle'; this.loop = true; this.started = 0;
    this.frameRequest = 0; this.connected = false; this.visible = true;
    this.direction = null; this.loadToken = 0;
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.onPreference = () => this.restart();
    this.onVisibility = () => this.restart();
    this.onPointer = event => {
      if (!this.hasAttribute('follow-pointer') || this.motionPreference.matches || this.state !== 'idle') return;
      const rect = this.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      if (Math.hypot(x, y) < Math.min(rect.width, rect.height) * .3) this.direction = null;
      else this.direction = Math.round(((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) / 22.5) % 16;
      this.schedule();
    };
    this.onPointerLeave = () => { this.direction = null; this.schedule(); };
    this.tick = time => {
      this.frameRequest = 0;
      if (!this.canRender()) return;
      if (!this.started) this.started = time;
      if (this.motionPreference.matches) { this.draw(0, 0); return; }
      if (this.direction !== null && this.state === 'idle') {
        this.draw(9 + Math.floor(this.direction / 8), this.direction % 8);
        return;
      }
      const spec = STATES[this.state];
      const duration = spec.durations.reduce((sum, value) => sum + value, 0);
      let elapsed = time - this.started;
      if (!this.loop && elapsed >= duration) {
        const finishedState = this.state;
        this.play('idle', { loop: true });
        this.dispatchEvent(new CustomEvent('mascot-finished', { detail: { state: finishedState } }));
        return;
      }
      elapsed %= duration;
      let index = 0;
      while (elapsed >= spec.durations[index] && index < spec.durations.length - 1) elapsed -= spec.durations[index++];
      this.draw(spec.row, index);
      this.schedule();
    };
  }
  connectedCallback() {
    this.connected = true;
    this.motionPreference.addEventListener('change', this.onPreference);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.restart();
      });
      this.observer.observe(this);
    }
    this.syncPresentation();
    this.play(this.getAttribute('state') || 'idle', { loop: true });
    this.ready = this.load();
    // Error is also surfaced as an event without an unhandled rejection.
    this.ready.catch(() => {});
  }
  disconnectedCallback() {
    this.connected = false;
    cancelAnimationFrame(this.frameRequest); this.frameRequest = 0;
    this.observer?.disconnect();
    this.motionPreference.removeEventListener('change', this.onPreference);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointer);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'state') this.play(newValue || 'idle', { loop: true });
    else if (name === 'src' && this.connected) { this.ready = this.load(); this.ready.catch(() => {}); }
    else if (name === 'follow-pointer') { this.direction = null; this.restart(); }
    else this.syncPresentation();
  }
  syncPresentation() {
    const size = Number(this.getAttribute('size') || 192);
    this.style.setProperty('--mascot-size', `${Number.isFinite(size) && size > 0 ? Math.min(1024, size) : 192}px`);
    this.canvas.setAttribute('aria-label', this.getAttribute('label') || '淡い青の羽を持つ、ひつじぷるーむの羊');
  }
  async load() {
    const token = ++this.loadToken;
    const image = new Image();
    image.src = this.getAttribute('src') || DEFAULT_SRC;
    try {
      await image.decode();
      if (token !== this.loadToken) return this;
      if (image.naturalWidth !== 1536 || image.naturalHeight !== 2288) throw new Error('Expected a 1536 × 2288 v2 atlas.');
      this.image = image; this.restart();
      this.dispatchEvent(new CustomEvent('mascot-ready'));
      return this;
    } catch (error) {
      if (token === this.loadToken) {
        this.image = null; this.context.clearRect(0, 0, CELL.width, CELL.height);
        this.dispatchEvent(new CustomEvent('mascot-error', { detail: { message: error.message } }));
      }
      throw error;
    }
  }
  play(state, { loop = false } = {}) {
    if (!Object.hasOwn(STATES, state)) throw new RangeError(`Unknown mascot state: ${state}`);
    this.state = state; this.loop = loop; this.direction = null;
    this.restart(); return this;
  }
  look(direction) {
    if (direction === null) this.direction = null;
    else {
      if (!Number.isFinite(direction)) throw new TypeError('Direction must be degrees or null.');
      this.state = 'idle'; this.loop = true;
      this.direction = Math.round((((direction % 360) + 360) % 360) / 22.5) % 16;
    }
    this.restart(); return this;
  }
  restart() {
    cancelAnimationFrame(this.frameRequest); this.frameRequest = 0; this.started = 0;
    this.schedule();
  }
  canRender() { return this.connected && this.image && this.visible && !document.hidden; }
  schedule() { if (!this.frameRequest && this.canRender()) this.frameRequest = requestAnimationFrame(this.tick); }
  draw(row, column) {
    this.context.clearRect(0, 0, CELL.width, CELL.height);
    this.context.drawImage(this.image, column * CELL.width, row * CELL.height, CELL.width, CELL.height, 0, 0, CELL.width, CELL.height);
    this.canvas.dataset.row = String(row); this.canvas.dataset.column = String(column);
  }
}
if (!customElements.get('hitsujiplume-mascot-3d')) customElements.define('hitsujiplume-mascot-3d', HitsujiplumeMascot3D);
