import layout from "./layouts/ncaa_next_required_layout.json";
import { dynastySaveBytesToCsvFiles } from "./dynastySaveToCsvFiles.js";

self.onmessage = (e) => {
  try {
    const buf = e?.data?.buffer;
    if (!(buf instanceof ArrayBuffer)) {
      throw new Error("Worker expected {buffer: ArrayBuffer}");
    }

    const saveBytes = new Uint8Array(buf);
    const result = dynastySaveBytesToCsvFiles({ saveBytes, layout });

    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};