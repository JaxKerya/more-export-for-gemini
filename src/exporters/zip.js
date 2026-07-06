/**
 * Minimal ZIP writer (STORE / no compression).
 *
 * A .docx file is just a ZIP archive of XML parts, so a tiny dependency-free
 * writer is enough to produce a genuine, Word-openable document. Files are
 * stored uncompressed which keeps the implementation small and robust.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  // Precomputed CRC-32 lookup table.
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }
  function writeUint16(view, offset, value) {
    view.setUint16(offset, value & 0xffff, true);
  }

  /**
   * @param {{name: string, data: (string|Uint8Array)}[]} entries
   * @returns {Blob} application/zip blob
   */
  function build(entries) {
    const files = entries.map((e) => {
      const nameBytes = strToBytes(e.name);
      const dataBytes = typeof e.data === "string" ? strToBytes(e.data) : e.data;
      return { nameBytes, dataBytes, crc: crc32(dataBytes) };
    });

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const LOCAL_HEADER = 30;
    const CENTRAL_HEADER = 46;

    files.forEach((f) => {
      // Local file header.
      const local = new Uint8Array(LOCAL_HEADER + f.nameBytes.length);
      const lv = new DataView(local.buffer);
      writeUint32(lv, 0, 0x04034b50); // signature
      writeUint16(lv, 4, 20); // version needed
      writeUint16(lv, 6, 0x0800); // flags: UTF-8 names
      writeUint16(lv, 8, 0); // method: store
      writeUint16(lv, 10, 0); // mod time
      writeUint16(lv, 12, 0); // mod date
      writeUint32(lv, 14, f.crc);
      writeUint32(lv, 18, f.dataBytes.length);
      writeUint32(lv, 22, f.dataBytes.length);
      writeUint16(lv, 26, f.nameBytes.length);
      writeUint16(lv, 28, 0); // extra length
      local.set(f.nameBytes, LOCAL_HEADER);

      localParts.push(local, f.dataBytes);

      // Central directory record.
      const central = new Uint8Array(CENTRAL_HEADER + f.nameBytes.length);
      const cv = new DataView(central.buffer);
      writeUint32(cv, 0, 0x02014b50); // signature
      writeUint16(cv, 4, 20); // version made by
      writeUint16(cv, 6, 20); // version needed
      writeUint16(cv, 8, 0x0800); // flags: UTF-8
      writeUint16(cv, 10, 0); // method
      writeUint16(cv, 12, 0); // time
      writeUint16(cv, 14, 0); // date
      writeUint32(cv, 16, f.crc);
      writeUint32(cv, 20, f.dataBytes.length);
      writeUint32(cv, 24, f.dataBytes.length);
      writeUint16(cv, 28, f.nameBytes.length);
      writeUint16(cv, 30, 0); // extra
      writeUint16(cv, 32, 0); // comment
      writeUint16(cv, 34, 0); // disk number
      writeUint16(cv, 36, 0); // internal attrs
      writeUint32(cv, 38, 0); // external attrs
      writeUint32(cv, 42, offset); // local header offset
      central.set(f.nameBytes, CENTRAL_HEADER);
      centralParts.push(central);

      offset += local.length + f.dataBytes.length;
    });

    const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
    const centralOffset = offset;

    // End of central directory record.
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    writeUint32(ev, 0, 0x06054b50);
    writeUint16(ev, 4, 0);
    writeUint16(ev, 6, 0);
    writeUint16(ev, 8, files.length);
    writeUint16(ev, 10, files.length);
    writeUint32(ev, 12, centralSize);
    writeUint32(ev, 16, centralOffset);
    writeUint16(ev, 20, 0); // comment length

    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  GEP.zip = { build, crc32 };
})();
