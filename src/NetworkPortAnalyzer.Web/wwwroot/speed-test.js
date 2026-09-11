/* JackPeek's bounded HTTPS throughput test. No analytics or capture data is sent. */
"use strict";

(function (root) {
  const ENDPOINT = "https://speed.cloudflare.com";
  // Smaller independent samples work on connections that reject large bodies.
  // The two directions together request 39.5 MB of test payload at most.
  const DOWNLOAD_BYTES = [1000000, 4000000, 4000000, 4000000, 4000000, 4000000];
  const UPLOAD_BYTES = [500000, 2000000, 4000000, 4000000, 4000000, 4000000];
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
      this.runTimeout = options.runTimeout ?? 45000;
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
        detail: "Runs automatically after sign-in. You can cancel at any time.",
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

    async measureDirection(direction) {
      const sizes = direction === "download" ? DOWNLOAD_BYTES : UPLOAD_BYTES;
      const samples = [];
      for (let i = 0; i < sizes.length; i++) {
        const bytes = sizes[i];
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
          total: sizes.length,
        };
        this.emit({
          [direction]: estimate,
          currentDirection: direction,
          currentMbps: visualSample.mbps,
          samples: [...this.result.samples, visualSample],
          payloadBytes: this.result.payloadBytes + bytes,
          progress:
            (direction === "download" ? 20 : 58) +
            ((i + 1) / sizes.length) * 38,
        });
      }
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
      this.result = this.initial();
      this.emit({
        running: true,
        phase: "latency",
        detail: "Connecting to Cloudflare and measuring HTTPS latency…",
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
          const sample = await this.exchange("/__down?bytes=0");
          latency.push(sample.latency);
          this.emit({ ping: median(latency), progress: ((i + 1) / 6) * 20 });
        }
        const deltas = latency
          .slice(1)
          .map((sample, i) => Math.abs(sample - latency[i]));
        this.emit({
          jitter: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
          phase: "download",
          detail: "Measuring download throughput…",
        });
        const failures = [];
        const direction = async (name) => {
          try {
            await this.measureDirection(name);
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
          progress: 58,
          detail: "Measuring upload throughput…",
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
