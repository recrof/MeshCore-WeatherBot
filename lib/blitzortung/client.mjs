import { EventEmitter } from 'node:events';
import { lzwDecode } from "./lzw.mjs";
const DEFAULT_SERVERS = [
  'ws1.blitzortung.org',
  'ws2.blitzortung.org',
  'ws7.blitzortung.org',
  'ws8.blitzortung.org',
];
const WORLD = { west: -180, east: 180, north: 90, south: -90 };
/** Stops a timer holding the Node event loop open; a no-op on Deno, where timers are numbers. */
function unref(timer) {
  timer.unref?.();
}
/**
 * Client for the Blitzortung.org live lightning feed.
 *
 * ```ts
 * const client = new BlitzortungClient({ bounds: { west: 5, east: 25, north: 55, south: 45 } });
 * client.on('strike', (s) => console.log(s.timestamp, s.lat, s.lon));
 * await client.connect();
 * ```
 */
export class BlitzortungClient extends EventEmitter {
  servers;
  key;
  bounds;
  shouldReconnect;
  baseDelay;
  maxDelay;
  idleTimeout;
  socket = null;
  serverIndex;
  wantSignals;
  paused = false;
  closed = false;
  attempt = 0;
  reconnectTimer = null;
  idleTimer = null;
  constructor(options = {}) {
    super();
    this.servers = options.servers?.length ? [...options.servers] : [...DEFAULT_SERVERS];
    this.key = options.key ?? 111;
    this.bounds = options.bounds ?? WORLD;
    this.shouldReconnect = options.reconnect ?? true;
    this.baseDelay = options.reconnectDelay ?? 1_000;
    this.maxDelay = options.maxReconnectDelay ?? 30_000;
    this.idleTimeout = options.idleTimeout ?? 60_000;
    this.wantSignals = options.signals ?? true;
    this.serverIndex = Math.floor(Math.random() * this.servers.length);
  }
  /** The host this client is connected to, or will connect to next. */
  get server() {
    return this.servers[this.serverIndex % this.servers.length];
  }
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  /**
   * Opens the socket. Resolves once the connection is open and subscribed.
   *
   * Rejects if this attempt fails; when `reconnect` is enabled, retries still
   * continue in the background, so a rejection is not the end of the client.
   */
  connect() {
    if (this.socket)
      return Promise.resolve();
    if (typeof WebSocket === 'undefined') {
      return Promise.reject(new Error('This runtime has no global WebSocket. Use Node 22+, Deno or Bun, ' +
        'or start Node 20/21 with --experimental-websocket.'));
    }
    this.closed = false;
    this.paused = false;
    const server = this.server;
    const socket = new WebSocket(`wss://${server}`);
    this.socket = socket;
    return new Promise((resolve, reject) => {
      let settled = false;
      socket.onopen = () => {
        this.attempt = 0;
        socket.send(JSON.stringify({ a: this.key }));
        this.armIdleTimer();
        this.emit('open', server);
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      socket.onmessage = (event) => {
        this.armIdleTimer();
        this.handleMessage(event.data);
      };
      socket.onerror = (event) => {
        const error = toError(event);
        // Without a listener, an 'error' emit would throw and take the process
        // down for what is a recoverable socket hiccup.
        if (this.listenerCount('error') > 0)
          this.emit('error', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      socket.onclose = () => {
        this.teardownSocket();
        const willReconnect = this.shouldReconnect && !this.closed && !this.paused;
        this.emit('close', { server, willReconnect });
        if (willReconnect)
          this.scheduleReconnect();
        if (!settled) {
          settled = true;
          reject(new Error(`Connection to ${server} closed before it opened`));
        }
      };
    });
  }
  /** Closes the socket and cancels any pending reconnect. */
  close() {
    this.closed = true;
    this.clearTimers();
    this.shutdownSocket();
  }
  /**
   * Stops the flow of strikes while keeping the client reusable, for consumers
   * that go idle. The server ignores the `{"send":false}` hint it is sent, so
   * the socket is closed as well -- that is what actually stops the traffic,
   * and it is what the official browser client does when the tab is hidden.
   */
  pause() {
    if (this.paused)
      return;
    this.paused = true;
    this.clearTimers();
    this.shutdownSocket();
  }
  /** Reopens the feed after {@link pause}. */
  resume() {
    if (!this.paused)
      return;
    this.paused = false;
    this.attempt = 0;
    if (!this.closed && !this.socket) {
      void this.connect().catch(() => {
        /* reported via the 'error' event */
      });
    }
  }
  /**
   * Controls whether `strike.signals` is populated. The server always sends
   * station data and ignores the `{"sig":...}` toggle, so this filters on the
   * client: turning it off avoids retaining a ~40-entry array per strike.
   */
  setSignals(enabled) {
    this.wantSignals = enabled;
  }
  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(lzwDecode(toText(data)));
    }
    catch (cause) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', new Error('Failed to decode message', { cause }));
      }
      return;
    }
    this.emit('message', message);
    if ('timeout' in message) {
      this.emit('timeout', message);
      return;
    }
    const strike = parseStrike(message, this.wantSignals);
    if (strike && this.inBounds(strike))
      this.emit('strike', strike);
  }
  inBounds({ lat, lon }) {
    const { west, east, north, south } = this.bounds;
    return lon >= west && lon <= east && lat >= south && lat <= north;
  }
  scheduleReconnect() {
    this.serverIndex = (this.serverIndex + 1) % this.servers.length;
    const delay = Math.min(this.baseDelay * 2 ** this.attempt, this.maxDelay);
    this.attempt++;
    this.emit('reconnecting', { server: this.server, attempt: this.attempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        /* the close handler schedules the next attempt */
      });
    }, delay);
    // Deliberately left ref'd: a consumer waiting on a reconnect expects the
    // process to stay alive through the backoff rather than exit mid-retry.
  }
  /** Drops the connection if the feed goes quiet, so a dead socket reconnects. */
  armIdleTimer() {
    if (this.idleTimeout <= 0 || this.paused)
      return;
    if (this.idleTimer)
      clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.socket?.close();
    }, this.idleTimeout);
    unref(this.idleTimer);
  }
  /**
   * Closes the socket on our own initiative. The handlers are detached first so
   * the reconnect path does not fire, which means the `close` event is emitted
   * here rather than from `onclose`.
   */
  shutdownSocket() {
    const socket = this.socket;
    if (!socket)
      return;
    const server = this.server;
    this.teardownSocket();
    if (socket.readyState === WebSocket.OPEN)
      trySend(socket, { send: false });
    socket.close();
    this.emit('close', { server, willReconnect: false });
  }
  teardownSocket() {
    const socket = this.socket;
    if (!socket)
      return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    this.socket = null;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
  clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
/**
 * Turns a raw feed message into a {@link Strike}, or `null` if it is not one.
 * Pass `includeSignals: false` to leave `strike.signals` empty.
 */
export function parseStrike(message, includeSignals = true) {
  const { time, lat, lon, delay } = message;
  if (typeof time !== 'number' ||
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    typeof delay !== 'number') {
    return null;
  }
  const signals = (includeSignals ? message.sig ?? [] : []).flatMap((s) => typeof s?.lat === 'number' && typeof s.lon === 'number'
    ? [
      {
        station: s.sta ?? -1,
        lat: s.lat,
        lon: s.lon,
        ...(s.alt !== undefined && { alt: s.alt }),
        ...(s.time !== undefined && { time: s.time }),
        ...(s.status !== undefined && { status: s.status }),
      },
    ]
    : []);
  return {
    time,
    timestamp: new Date(time / 1e6),
    lat: lat + (message.latc ?? 0),
    lon: lon + (message.lonc ?? 0),
    ...(message.alt !== undefined && { alt: message.alt }),
    delay,
    ...(message.mds !== undefined && { deviation: message.mds }),
    ...(message.mcg !== undefined && { stationCount: message.mcg }),
    ...(message.status !== undefined && { status: message.status }),
    ...(message.pol !== undefined && { polarity: message.pol }),
    ...(message.region !== undefined && { region: message.region }),
    signals,
    raw: message,
  };
}
/** Text frames arrive as strings; the guard covers a server sending binary. */
function toText(data) {
  if (typeof data === 'string')
    return data;
  if (data instanceof ArrayBuffer)
    return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return String(data);
}
function toError(event) {
  if (event instanceof Error)
    return event;
  const message = event?.message;
  return new Error(typeof message === 'string' ? message : 'WebSocket error');
}
function trySend(socket, payload) {
  try {
    socket.send(JSON.stringify(payload));
  }
  catch {
    // The socket raced us into a closed state; the close handler takes over.
  }
}
