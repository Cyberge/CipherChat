(function () {
  "use strict";

  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function onlyAlpha(s) { return /^[a-zA-Z]+$/.test(s); }
  function toUpper(s) { return s.toUpperCase(); }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a;
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  function caesarEncrypt(text, key) {
    const shift = parseInt(key, 10);
    if (isNaN(shift)) throw new Error("Caesar key must be an integer.");
    return text.split("").map(c => {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) return c;
      const ch = A[(i + shift) % 26];
      return c === c.toLowerCase() ? ch.toLowerCase() : ch;
    }).join("");
  }

  function vigenereEncrypt(text, key) {
    const kw = toUpper(key.replace(/[^a-zA-Z]/g, ""));
    if (!kw) throw new Error("Vigenère key must contain letters.");
    let ki = 0;
    return text.split("").map(c => {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) return c;
      const shift = A.indexOf(kw[ki % kw.length]);
      ki++;
      const ch = A[(i + shift) % 26];
      return c === c.toLowerCase() ? ch.toLowerCase() : ch;
    }).join("");
  }

  function affineEncrypt(text, key) {
    const parts = key.split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length !== 2 || parts.some(isNaN)) throw new Error("Affine key must be two integers: a,b (e.g. 5,8).");
    const [a, b] = parts;
    if (gcd(a, 26) !== 1) throw new Error("Affine parameter a must be coprime with 26.");
    return text.split("").map(c => {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) return c;
      const j = mod(a * i + b, 26);
      const ch = A[j];
      return c === c.toLowerCase() ? ch.toLowerCase() : ch;
    }).join("");
  }

  function affineDecrypt(text, key) {
    const parts = key.split(",").map(s => parseInt(s.trim(), 10));
    const [a, b] = parts;
    if (gcd(a, 26) !== 1) throw new Error("Affine parameter a must be coprime with 26.");
    let aInv = 0;
    for (let x = 0; x < 26; x++) if (mod(a * x, 26) === 1) { aInv = x; break; }
    return text.split("").map(c => {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) return c;
      const j = mod(aInv * (i - b), 26);
      const ch = A[j];
      return c === c.toLowerCase() ? ch.toLowerCase() : ch;
    }).join("");
  }

  function railFenceEncrypt(text, key) {
    const rails = parseInt(key, 10);
    if (isNaN(rails) || rails < 2) throw new Error("Rail-fence requires at least 2 rails.");
    const fence = Array.from({ length: rails }, () => []);
    let rail = 0;
    let dir = 1;
    for (const c of text) {
      fence[rail].push(c);
      if (rail === 0) dir = 1;
      else if (rail === rails - 1) dir = -1;
      rail += dir;
    }
    return fence.map(r => r.join("")).join("");
  }

  function railFenceDecrypt(text, key) {
    const rails = parseInt(key, 10);
    if (isNaN(rails) || rails < 2) throw new Error("Rail-fence requires at least 2 rails.");
    const len = text.length;
    const pattern = [];
    let rail = 0;
    let dir = 1;
    for (let i = 0; i < len; i++) {
      pattern.push(rail);
      if (rail === 0) dir = 1;
      else if (rail === rails - 1) dir = -1;
      rail += dir;
    }
    const counts = Array(rails).fill(0);
    pattern.forEach(r => counts[r]++);
    const rows = [];
    let idx = 0;
    for (let r = 0; r < rails; r++) {
      rows[r] = text.slice(idx, idx + counts[r]).split("");
      idx += counts[r];
    }
    const out = [];
    const pointers = Array(rails).fill(0);
    pattern.forEach(r => out.push(rows[r][pointers[r]++]));
    return out.join("");
  }

  function columnarEncrypt(text, key) {
    const kw = toUpper(key.replace(/[^a-zA-Z]/g, ""));
    if (!kw) throw new Error("Columnar key must contain letters.");
    const cols = kw.length;
    const order = kw.split("").map((c, i) => ({ c, i }))
      .sort((a, b) => a.c.localeCompare(b.c) || a.i - b.i)
      .map(x => x.i);
    const padded = text.replace(/ /g, "_");
    const rows = Math.ceil(padded.length / cols);
    const total = rows * cols;
    const pad = padded + "_".repeat(total - padded.length);
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(pad.slice(r * cols, (r + 1) * cols).split(""));
    let out = "";
    order.forEach(col => { for (let r = 0; r < rows; r++) out += grid[r][col]; });
    return out;
  }

  function columnarDecrypt(text, key) {
    const kw = toUpper(key.replace(/[^a-zA-Z]/g, ""));
    if (!kw) throw new Error("Columnar key must contain letters.");
    const cols = kw.length;
    const order = kw.split("").map((c, i) => ({ c, i }))
      .sort((a, b) => a.c.localeCompare(b.c) || a.i - b.i)
      .map(x => x.i);
    const rows = Math.ceil(text.length / cols);
    const colLens = Array(cols).fill(Math.floor(text.length / cols));
    const extra = text.length % cols;
    order.forEach((col, rank) => {
      if (rank < extra) colLens[col]++;
    });
    const grid = Array.from({ length: rows }, () => Array(cols).fill(""));
    let idx = 0;
    order.forEach(col => {
      const len = colLens[col];
      for (let r = 0; r < len; r++) grid[r][col] = text[idx++];
    });
    return grid.map(row => row.join("")).join("").replace(/_/g, " ").replace(/_+$/g, "").trimEnd();
  }

  function permutationEncrypt(text, key) {
    const order = key.split(",").map(s => parseInt(s.trim(), 10) - 1);
    if (order.some(isNaN) || order.length < 2) throw new Error("Permutation key: comma-separated 1-based positions (e.g. 3,1,4,2).");
    const n = order.length;
    const blocks = [];
    for (let i = 0; i < text.length; i += n) {
      const block = text.slice(i, i + n).padEnd(n, " ");
      const out = Array(n);
      order.forEach((dest, src) => { out[dest] = block[src]; });
      blocks.push(out.join("").trimEnd());
    }
    return blocks.join("");
  }

  function permutationDecrypt(text, key) {
    const order = key.split(",").map(s => parseInt(s.trim(), 10) - 1);
    const n = order.length;
    const inv = Array(n);
    order.forEach((dest, src) => { inv[dest] = src; });
    const blocks = [];
    for (let i = 0; i < text.length; i += n) {
      const block = text.slice(i, i + n).padEnd(n, " ");
      const out = Array(n);
      inv.forEach((src, dest) => { out[dest] = block[src]; });
      blocks.push(out.join("").trimEnd());
    }
    return blocks.join("");
  }

  function grilleEncrypt(text, key) {
    const holes = key.split(",").map(s => parseInt(s.trim(), 10));
    if (holes.some(isNaN)) throw new Error("Grille key: comma-separated hole positions (0-based).");
    const size = Math.ceil(Math.sqrt(text.length));
    const gridLen = size * size;
    const grid = Array(gridLen).fill("");
    let ti = 0;
    const sortedHoles = [...holes].sort((a, b) => a - b);
    for (const pos of sortedHoles) {
      if (pos >= gridLen) throw new Error("Grille hole position out of range.");
      if (ti < text.length) grid[pos] = text[ti++];
    }
    for (let i = 0; i < gridLen && ti < text.length; i++) {
      if (!sortedHoles.includes(i)) grid[i] = text[ti++];
    }
    return grid.join("");
  }

  function grilleDecrypt(text, key) {
    const holes = key.split(",").map(s => parseInt(s.trim(), 10));
    const size = Math.ceil(Math.sqrt(text.length));
    const gridLen = size * size;
    const grid = text.padEnd(gridLen, " ").split("");
    const sortedHoles = [...holes].sort((a, b) => a - b);
    let out = "";
    sortedHoles.forEach(pos => { if (grid[pos]) out += grid[pos]; });
    for (let i = 0; i < gridLen; i++) {
      if (!sortedHoles.includes(i) && grid[i] && grid[i] !== " ") out += grid[i];
    }
    return out.trimEnd();
  }

  function blockEncrypt(text, key) {
    if (!key) throw new Error("Block cipher requires a passphrase.");
    const bs = 4;
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 32 && c <= 126) {
        const k = key.charCodeAt(i % key.length) % 95;
        out += String.fromCharCode(((c - 32 + k) % 95) + 32);
      } else out += text[i];
    }
    return out;
  }

  function blockDecrypt(text, key) {
    if (!key) throw new Error("Block cipher requires a passphrase.");
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 32 && c <= 126) {
        const k = key.charCodeAt(i % key.length) % 95;
        out += String.fromCharCode(((c - 32 - k + 95) % 95) + 32);
      } else out += text[i];
    }
    return out;
  }

  function hillEncrypt(text, key) {
    const nums = key.split(",").map(s => parseInt(s.trim(), 10));
    if (nums.length !== 4 || nums.some(isNaN)) throw new Error("Hill key: four integers for 2×2 matrix (e.g. 3,3,2,5).");
    const [a, b, c, d] = nums;
    const det = mod(a * d - b * c, 26);
    if (gcd(det, 26) !== 1) throw new Error("Hill matrix is not invertible mod 26.");
    let clean = text.replace(/[^a-zA-Z]/g, "").toUpperCase();
    if (!clean) throw new Error("Hill cipher requires at least one letter.");
    if (clean.length % 2 !== 0) clean += "X";
    let out = "";
    for (let i = 0; i < clean.length; i += 2) {
      const v = [A.indexOf(clean[i]), A.indexOf(clean[i + 1])];
      out += A[mod(a * v[0] + b * v[1], 26)];
      out += A[mod(c * v[0] + d * v[1], 26)];
    }
    return out;
  }

  function hillDecrypt(text, key) {
    const nums = key.split(",").map(s => parseInt(s.trim(), 10));
    const [[a, b], [c, d]] = [[nums[0], nums[1]], [nums[2], nums[3]]];
    const det = mod(a * d - b * c, 26);
    if (gcd(det, 26) !== 1) throw new Error("Hill matrix is not invertible mod 26.");
    let detInv = 0;
    for (let x = 0; x < 26; x++) if (mod(det * x, 26) === 1) { detInv = x; break; }
    const ai = mod(d * detInv, 26);
    const bi = mod(-b * detInv, 26);
    const ci = mod(-c * detInv, 26);
    const di = mod(a * detInv, 26);
    let out = "";
    const clean = text.replace(/[^a-zA-Z]/g, "").toUpperCase();
    for (let i = 0; i < clean.length; i += 2) {
      const v = [A.indexOf(clean[i]), A.indexOf(clean[i + 1])];
      out += A[mod(ai * v[0] + bi * v[1], 26)];
      out += A[mod(ci * v[0] + di * v[1], 26)];
    }
    return out;
  }

  function streamCipher(text, key) {
    if (!key) throw new Error("Stream cipher requires a passphrase.");
    const S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
      [S[i], S[j]] = [S[j], S[i]];
    }
    let i = 0;
    j = 0;
    let out = "";
    for (const ch of text) {
      i = (i + 1) % 256;
      j = (j + S[i]) % 256;
      [S[i], S[j]] = [S[j], S[i]];
      const k = S[(S[i] + S[j]) % 256] % 95;
      const c = ch.charCodeAt(0);
      if (c >= 32 && c <= 126) out += String.fromCharCode(((c - 32 + k) % 95) + 32);
      else out += ch;
    }
    return out;
  }

  function productEncrypt(text, key) {
    const parts = key.split("|");
    if (parts.length !== 2) throw new Error("Product key format: vigenereKey|columnarKey");
    return columnarEncrypt(vigenereEncrypt(text, parts[0]), parts[1]);
  }

  function productDecrypt(text, key) {
    const parts = key.split("|");
    if (parts.length !== 2) throw new Error("Product key format: vigenereKey|columnarKey");
    return vigenereDecrypt(columnarDecrypt(text, parts[1]), parts[0]);
  }

  function vigenereDecrypt(text, key) {
    const kw = toUpper(key.replace(/[^a-zA-Z]/g, ""));
    let ki = 0;
    return text.split("").map(c => {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) return c;
      const shift = A.indexOf(kw[ki % kw.length]);
      ki++;
      const ch = A[(i - shift + 26) % 26];
      return c === c.toLowerCase() ? ch.toLowerCase() : ch;
    }).join("");
  }

  const CIPHERS = [
    { id: "none", label: "No cipher", keyLabel: "", keyPlaceholder: "" },
    { id: "caesar", label: "Caesar", keyLabel: "Shift", keyPlaceholder: "3" },
    { id: "vigenere", label: "Vigenère", keyLabel: "Keyword", keyPlaceholder: "SECRET" },
    { id: "affine", label: "Affine", keyLabel: "a,b", keyPlaceholder: "5,8" },
    { id: "railfence", label: "Rail-fence", keyLabel: "Rails", keyPlaceholder: "3" },
    { id: "columnar", label: "Columnar", keyLabel: "Keyword", keyPlaceholder: "ZEBRA" },
    { id: "permutation", label: "Permutation", keyLabel: "Order", keyPlaceholder: "3,1,4,2" },
    { id: "grille", label: "Grille", keyLabel: "Holes", keyPlaceholder: "0,3,5,8" },
    { id: "block", label: "Block", keyLabel: "Passphrase", keyPlaceholder: "mykey" },
    { id: "hill", label: "Hill", keyLabel: "Matrix", keyPlaceholder: "3,3,2,5" },
    { id: "stream", label: "Stream", keyLabel: "Passphrase", keyPlaceholder: "mypassword" },
    { id: "product", label: "Product", keyLabel: "Vig|Col", keyPlaceholder: "SECRET|ZEBRA" },
  ];

  const OPS = {
    none: { enc: (t) => t, dec: (t) => t },
    caesar: { enc: caesarEncrypt, dec: (t, k) => caesarEncrypt(t, String(-parseInt(k, 10))) },
    vigenere: { enc: vigenereEncrypt, dec: vigenereDecrypt },
    affine: { enc: affineEncrypt, dec: affineDecrypt },
    railfence: { enc: railFenceEncrypt, dec: railFenceDecrypt },
    columnar: { enc: columnarEncrypt, dec: columnarDecrypt },
    permutation: { enc: permutationEncrypt, dec: permutationDecrypt },
    grille: { enc: grilleEncrypt, dec: grilleDecrypt },
    block: { enc: blockEncrypt, dec: blockDecrypt },
    hill: { enc: hillEncrypt, dec: hillDecrypt },
    stream: { enc: streamCipher, dec: streamCipher },
    product: { enc: productEncrypt, dec: productDecrypt },
  };

  window.CipherEngine = {
    encrypt(id, text, key) {
      const op = OPS[id];
      if (!op) throw new Error("Unknown cipher: " + id);
      if (id === "none") return text;
      return op.enc(text, key);
    },
    decrypt(id, text, key) {
      const op = OPS[id];
      if (!op) throw new Error("Unknown cipher: " + id);
      if (id === "none") return text;
      return op.dec(text, key);
    },
    getCipherList() {
      return CIPHERS.map(({ id, label, keyLabel, keyPlaceholder }) => ({ id, label, keyLabel, keyPlaceholder }));
    },
  };
})();
