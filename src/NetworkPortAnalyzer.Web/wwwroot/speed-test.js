/* JackPeek's bounded HTTPS throughput test. No analytics or capture data is sent. */
"use strict";

(function (root) {
  const ENDPOINT = "https://speed.cloudflare.com";
  const DEFAULT_DURATION = 30000;
  const LATENCY_FRACTION = 0.16;
  const DOWNLOAD_FRACTION = 0.42;
  // Smaller independent samples work on connections that reject large bodies.
  // Repeating them across the run window gives steadier readings without one large request.
  const DOWNLOAD_BYTES = [1000000, 4000000, 4000000, 4000000];
  const UPLOAD_BYTES = [500000, 2000000, 4000000, 4000000];
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (ms <= 0) {
        resolve();
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const timer = setTimeout(done, ms);
      function done() {
        signal.removeEventListener("abort", abort);
        resolve();
      }
      function abort() {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        reject(signal.reason);
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  class SpeedTest {
    constructor(options = {}) {
      this.fetch = options.fetch || root.fetch.bind(root);
      this.now = options.now || (() => performance.now());
      this.random =
        options.random || ((bytes) => root.crypto.getRandomValues(bytes));
      this.onUpdate = options.onUpdate || (() => {});
      this.requestTimeout = options.requestTimeout ?? 8000;
      this.duration = options.duration ?? DEFAULT_DURATION;
      this.sampleInterval = options.sampleInterval ?? 900;
      this.runTimeout = options.runTimeout ?? this.duration + 10000;
      this.wait = options.wait || sleep;
      this.controller = null;
      this.sequence = 0;
      this.result = this.initial();
    }

    initial() {
      return {
        phase: "idle",
        running: false,
        progress: 0,
        download: null,
        upload: null,
        ping: null,
        jitter: null,
        edge: null,
        payloadBytes: 0,
        samples: [],
        completedAt: null,
        detail:
          "Runs automatically after sign-in for 30 seconds. You can cancel at any time.",
      };
    }

    emit(values = {}) {
      Object.assign(this.result, values);
      this.onUpdate({ ...this.result });
    }

    cancel() {
      this.controller?.abort(
        new DOMException("Speed test cancelled", "AbortError"),
      );
    }

    async exchange(path, { body, maximum = 65536, collect = false } = {}) {
      const controller = new AbortController();
      const parent = this.controller.signal;
      const abort = () => controller.abort(parent.reason);
      parent.addEventListener("abort", abort, { once: true });
      if (parent.aborted) abort();
      const timeout = setTimeout(
        () =>
          controller.abort(
            new DOMException("Speed test request timed out", "TimeoutError"),
          ),
        this.requestTimeout,
      );
      const started = this.now();
      let reader;
      let completed = false;
      try {
        const separator = path.includes("?") ? "&" : "?";
        const response = await this.fetch(
          `${ENDPOINT}${path}${separator}jackpeek=${Date.now()}-${++this.sequence}`,
          {
            method: body ? "POST" : "GET",
            body,
            signal: controller.signal,
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            redirect: "error",
          },
        );
        const latency = this.now() - started;
        if (!response.ok)
          throw new Error(`Cloudflare returned HTTP ${response.status}.`);
        if (!response.body)
          throw new Error(
            "The speed-test service returned no response stream.",
          );
        reader = response.body.getReader();
        let bytes = 0;
        const chunks = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maximum)
            throw new Error(
              "The speed-test response exceeded its expected size.",
            );
          if (collect) chunks.push(value);
        }
        const elapsed = this.now() - started;
        if (controller.signal.aborted) throw controller.signal.reason;
        let text = "";
        if (collect) {
          const data = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }
          text = new TextDecoder().decode(data);
        }
        completed = true;
        return { bytes, latency, elapsed, text };
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw error;
      } finally {
        clearTimeout(timeout);
        parent.removeEventListener("abort", abort);
        // Do not abort a successfully drained stream: Chromium can otherwise
        // mark the completed network request as cancelled in developer tools.
        if (reader) {
          try {
            if (!completed) await reader.cancel();
            reader.releaseLock?.();
          } catch {
            /* already closed */
          }
        }
        if (!completed) controller.abort();
      }
    }

    progressFromTime(startedAt) {
      if (!startedAt) return 0;
      const elapsed = Math.max(0, this.now() - startedAt);
      return Math.min(99, (elapsed / this.duration) * 100);
    }

    async paceUntil(nextSampleAt, deadline, startedAt) {
      const now = this.now();
      const waitMs = Math.min(nextSampleAt, deadline) - now;
      if (waitMs > 0) {
        await this.wait(waitMs, this.controller.signal);
        this.emit({ progress: this.progressFromTime(startedAt) });
      }
    }

    async measureDirection(direction, deadline, startedAt) {
      const sizes = direction === "download" ? DOWNLOAD_BYTES : UPLOAD_BYTES;
      const samples = [];
      let i = 0;
      do {
        const bytes = sizes[i % sizes.length];
        const sampleStarted = this.now();
        let transfer;
        if (direction === "download") {
          transfer = await this.exchange(`/__down?bytes=${bytes}`, {
            maximum: bytes,
          });
          if (transfer.bytes !== bytes)
            throw new Error(
              "The download sample was incomplete. Please try again.",
            );
        } else {
          const payload = new Uint8Array(bytes);
          for (let offset = 0; offset < payload.length; offset += 65536)
            this.random(
              payload.subarray(
                offset,
                Math.min(payload.length, offset + 65536),
              ),
            );
          transfer = await this.exchange("/__up", { body: payload });
        }
        if (transfer.elapsed <= 0)
          throw new Error("The browser could not measure transfer timing.");
        const rate = (bytes * 8) / transfer.elapsed / 1000;
        samples.push({ rate, elapsed: transfer.elapsed });
        // Exclude tiny ramp-up samples when longer, steadier measurements exist.
        const steady = samples.filter((sample) => sample.elapsed >= 250);
        const estimate = median(
          (steady.length ? steady : samples.slice(-2)).map(
            (sample) => sample.rate,
          ),
        );
        const visualSample = {
          direction,
          mbps: Math.max(0, estimate),
          sample: i + 1,
          total: null,
        };
        this.emit({
          [direction]: estimate,
          currentDirection: direction,
          currentMbps: visualSample.mbps,
          samples: [...this.result.samples, visualSample],
          payloadBytes: this.result.payloadBytes + bytes,
          progress: this.progressFromTime(startedAt),
        });
        i += 1;
        await this.paceUntil(
          sampleStarted + this.sampleInterval,
          deadline,
          startedAt,
        );
      } while (this.now() < deadline && !this.controller.signal.aborted);
    }

    async run() {
      if (this.controller) return null;
      this.controller = new AbortController();
      const timeout = setTimeout(
        () =>
          this.controller?.abort(
            new DOMException("Speed test time limit reached", "TimeoutError"),
          ),
        this.runTimeout,
      );
      const startedAt = this.now();
      const latencyDeadline = startedAt + this.duration * LATENCY_FRACTION;
      const downloadDeadline =
        latencyDeadline + this.duration * DOWNLOAD_FRACTION;
      const uploadDeadline = startedAt + this.duration;
      this.result = this.initial();
      this.emit({
        running: true,
        phase: "latency",
        detail: "Starting 30-second speed test and measuring HTTPS latency...",
      });
      try {
        // Edge discovery is optional. Keep only the edge code, never the returned IP.
        try {
          const trace = await this.exchange("/cdn-cgi/trace", {
            collect: true,
          });
          const edge =
            trace.text.match(/^colo=([A-Z0-9]{3,8})\s*$/m)?.[1] || null;
          this.emit({ edge });
        } catch (error) {
          if (this.controller.signal.aborted) throw error;
        }
        await this.exchange("/__down?bytes=0"); // Warm connection before measured latency.
        const latency = [];
        for (let i = 0; i < 6; i++) {
          const sampleStarted = this.now();
          const sample = await this.exchange("/__down?bytes=0");
          latency.push(sample.latency);
          this.emit({
            ping: median(latency),
            progress: this.progressFromTime(startedAt),
          });
          await this.paceUntil(
            sampleStarted + this.sampleInterval,
            latencyDeadline,
            startedAt,
          );
        }
        const deltas = latency
          .slice(1)
          .map((sample, i) => Math.abs(sample - latency[i]));
        this.emit({
          jitter: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
          phase: "download",
          detail: "Measuring download throughput across the 30-second window...",
        });
        const failures = [];
        const direction = async (name) => {
          try {
            await this.measureDirection(
              name,
              name === "download" ? downloadDeadline : uploadDeadline,
              startedAt,
            );
          } catch (error) {
            if (this.controller.signal.aborted) throw error;
            failures.push(
              `${name === "download" ? "Download" : "Upload"}: ${error instanceof TypeError ? "the connection to Cloudflare failed or was blocked" : error.message}`,
            );
          }
        };
        await direction("download");
        this.emit({
          phase: "upload",
          progress: this.progressFromTime(startedAt),
          detail: "Measuring upload throughput across the 30-second window...",
        });
        await direction("upload");
        if (failures.length) {
          this.emit({
            phase: "error",
            running: false,
            detail: `Some measurements are incomplete. ${failures.join(". ")}. Completed measurements are retained.`,
          });
          return { ...this.result };
        }
        this.emit({
          phase: "complete",
          running: false,
          progress: 100,
          completedAt: new Date().toISOString(),
          detail:
            "Test complete. Results estimate HTTPS throughput on this browser’s connection.",
        });
      } catch (error) {
        const reason = this.controller.signal.aborted
          ? this.controller.signal.reason
          : error;
        const cancelled = reason?.name === "AbortError";
        const timedOut = reason?.name === "TimeoutError";
        const partial =
          this.result.download !== null ||
          this.result.upload !== null ||
          this.result.ping !== null;
        this.emit({
          phase: cancelled ? "cancelled" : "error",
          running: false,
          detail: cancelled
            ? "Speed test cancelled. Completed measurements are retained."
            : timedOut
              ? `The speed test timed out.${partial ? " Completed measurements are retained." : " Check your connection and try again."}`
              : `The speed test could not finish. ${error instanceof TypeError ? "Check internet access or whether Cloudflare is blocked by your network." : error.message}${partial ? " Completed measurements are retained." : ""}`,
        });
      } finally {
        clearTimeout(timeout);
        this.controller = null;
      }
      return { ...this.result };
    }
  }

  root.JackPeekSpeedTest = SpeedTest;
  if (typeof module !== "undefined" && module.exports)
    module.exports = SpeedTest;
})(globalThis);
