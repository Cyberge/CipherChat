// CipherChat — CipherEngine (11 classical ciphers)
// Exposes: window.CipherEngine = { encrypt, decrypt, getCipherList }

(function () {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function isAlpha(ch) {
    return /^[A-Za-z]$/.test(ch);
  }

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function alphaIndex(ch) {
    return A.indexOf(ch.toUpperCase());
  }

  function shiftChar(ch, k) {
    const i = alphaIndex(ch);
    if (i < 0) return ch;
    const out = A[mod(i + k, 26)];
    return ch === ch.toLowerCase() ? out.toLowerCase() : out;
  }

  function onlyLettersLower(s) {
    return String(s || "")
      .replace(/[^A-Za-z]/g, "")
      .toLowerCase();
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  function egcd(a, b) {
    let x0 = 1,
      y0 = 0,
      x1 = 0,
      y1 = 1;
    while (b !== 0) {
      const q = Math.floor(a / b);
      [a, b] = [b, a - q * b];
      [x0, x1] = [x1, x0 - q * x1];
      [y0, y1] = [y1, y0 - q * y1];
    }
    return { g: a, x: x0, y: y0 };
  }

  function modInv(a, m) {
    const { g, x } = egcd(mod(a, m), m);
    if (g !== 1) return null;
    return mod(x, m);
  }

  // 1) Caesar
  const Caesar = {
    encrypt: (text, key) => {
      const k = parseInt(key, 10);
      if (!Number.isFinite(k)) throw new Error("Caesar key must be an integer shift.");
      return [...String(text || "")].map((c) => shiftChar(c, k)).join("");
    },
    decrypt: (text, key) => {
      const k = parseInt(key, 10);
      if (!Number.isFinite(k)) throw new Error("Caesar key must be an integer shift.");
      return [...String(text || "")].map((c) => shiftChar(c, -k)).join("");
    },
  };

  // 2) Vigenère
  const Vigenere = {
    encrypt: (text, key) => {
      const k = onlyLettersLower(key);
      if (!k) throw new Error("Vigenère key must be a keyword (letters only).");
      let j = 0;
      return [...String(text || "")]
        .map((c) => {
          if (!isAlpha(c)) return c;
          const s = alphaIndex(k[j++ % k.length]);
          return shiftChar(c, s);
        })
        .join("");
    },
    decrypt: (text, key) => {
      const k = onlyLettersLower(key);
      if (!k) throw new Error("Vigenère key must be a keyword (letters only).");
      let j = 0;
      return [...String(text || "")]
        .map((c) => {
          if (!isAlpha(c)) return c;
          const s = alphaIndex(k[j++ % k.length]);
          return shiftChar(c, -s);
        })
        .join("");
    },
  };

  // 3) Affine
  const Affine = {
    encrypt: (text, key) => {
      const parts = String(key || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10));
      const a = parts[0],
        b = parts[1];
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Affine key must be 'a,b' (e.g. 5,8).");
      if (gcd(a, 26) !== 1) throw new Error("Affine key 'a' must be coprime with 26.");
      return [...String(text || "")]
        .map((c) => {
          const x = alphaIndex(c);
          if (x < 0) return c;
          const y = mod(a * x + b, 26);
          const out = A[y];
          return c === c.toLowerCase() ? out.toLowerCase() : out;
        })
        .join("");
    },
    decrypt: (text, key) => {
      const parts = String(key || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10));
      const a = parts[0],
        b = parts[1];
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Affine key must be 'a,b' (e.g. 5,8).");
      if (gcd(a, 26) !== 1) throw new Error("Affine key 'a' must be coprime with 26.");
      const aInv = modInv(a, 26);
      if (aInv == null) throw new Error("Affine key 'a' has no modular inverse mod 26.");
      return [...String(text || "")]
        .map((c) => {
          const y = alphaIndex(c);
          if (y < 0) return c;
          const x = mod(aInv * (y - b), 26);
          const out = A[x];
          return c === c.toLowerCase() ? out.toLowerCase() : out;
        })
        .join("");
    },
  };

  // 4) Rail-fence
  function railFenceEncrypt(text, rails) {
    const n = parseInt(rails, 10);
    if (!Number.isFinite(n) || n < 2) throw new Error("Rail-fence key must be a number of rails (>= 2).");
    const rows = Array.from({ length: n }, () => []);
    let r = 0,
      dir = 1;
    for (const ch of String(text || "")) {
      rows[r].push(ch);
      if (r === 0) dir = 1;
      else if (r === n - 1) dir = -1;
      r += dir;
    }
    return rows.map((x) => x.join("")).join("");
  }

  function railFenceDecrypt(cipher, rails) {
    const n = parseInt(rails, 10);
    if (!Number.isFinite(n) || n < 2) throw new Error("Rail-fence key must be a number of rails (>= 2).");
    const text = String(cipher || "");
    const len = text.length;
    const pattern = [];
    let r = 0,
      dir = 1;
    for (let i = 0; i < len; i++) {
      pattern.push(r);
      if (r === 0) dir = 1;
      else if (r === n - 1) dir = -1;
      r += dir;
    }
    const counts = Array.from({ length: n }, () => 0);
    pattern.forEach((rr) => counts[rr]++);
    const railsArr = Array.from({ length: n }, () => []);
    let idx = 0;
    for (let rr = 0; rr < n; rr++) {
      railsArr[rr] = text.slice(idx, idx + counts[rr]).split("");
      idx += counts[rr];
    }
    const pos = Array.from({ length: n }, () => 0);
    let out = "";
    for (const rr of pattern) {
      out += railsArr[rr][pos[rr]++];
    }
    return out;
  }

  const RailFence = {
    encrypt: railFenceEncrypt,
    decrypt: railFenceDecrypt,
  };

  // 5) Columnar Transposition
  function columnarOrder(key) {
    const k = onlyLettersLower(key);
    if (!k) throw new Error("Columnar key must be a keyword (letters only).");
    const pairs = k.split("").map((ch, idx) => ({ ch, idx }));
    pairs.sort((a, b) => (a.ch === b.ch ? a.idx - b.idx : a.ch < b.ch ? -1 : 1));
    return pairs.map((p) => p.idx);
  }

  function columnarEncrypt(text, key) {
    const order = columnarOrder(key);
    const cols = order.length;
    const t = String(text || "");
    const rows = Math.ceil(t.length / cols);
    const padLen = rows * cols - t.length;
    const padded = t + "_".repeat(padLen);
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(padded.slice(r * cols, (r + 1) * cols).split(""));
    let out = "";
    for (const cIdx of order) {
      for (let r = 0; r < rows; r++) out += grid[r][cIdx];
    }
    return out;
  }

  function columnarDecrypt(cipher, key) {
    const order = columnarOrder(key);
    const cols = order.length;
    const t = String(cipher || "");
    const rows = Math.ceil(t.length / cols);
    const total = rows * cols;
    const padded = t.padEnd(total, "_");
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
    let idx = 0;
    for (const cIdx of order) {
      for (let r = 0; r < rows; r++) {
        grid[r][cIdx] = padded[idx++] || "_";
      }
    }
    const joined = grid.map((row) => row.join("")).join("");
    return joined.replace(/_+$/g, "");
  }

  const Columnar = {
    encrypt: columnarEncrypt,
    decrypt: columnarDecrypt,
  };

  // 6) Permutation (block-wise)
  function parsePermutation(key) {
    const parts = String(key || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (!parts.length) throw new Error("Permutation key must be comma-separated order (e.g. 3,1,4,2).");
    const n = parts.length;
    const set = new Set(parts);
    if (set.size !== n) throw new Error("Permutation key must not contain duplicates.");
    for (const v of parts) {
      if (v < 1 || v > n) throw new Error("Permutation values must be in range 1..N.");
    }
    // Convert to 0-based positions, where output[i] = input[perm[i]]
    return parts.map((v) => v - 1);
  }

  function invertPermutation(p) {
    const inv = Array.from({ length: p.length }, () => 0);
    for (let i = 0; i < p.length; i++) inv[p[i]] = i;
    return inv;
  }

  function permutationEncrypt(text, key) {
    const p = parsePermutation(key);
    const n = p.length;
    const t = String(text || "");
    let out = "";
    for (let i = 0; i < t.length; i += n) {
      const block = t.slice(i, i + n).padEnd(n, "_");
      const arr = block.split("");
      for (let j = 0; j < n; j++) out += arr[p[j]];
    }
    return out;
  }

  function permutationDecrypt(cipher, key) {
    const p = parsePermutation(key);
    const inv = invertPermutation(p);
    const n = p.length;
    const t = String(cipher || "");
    let out = "";
    for (let i = 0; i < t.length; i += n) {
      const block = t.slice(i, i + n).padEnd(n, "_");
      const arr = block.split("");
      const dec = Array.from({ length: n }, () => "_");
      for (let j = 0; j < n; j++) dec[j] = arr[inv[j]];
      out += dec.join("");
    }
    return out.replace(/_+$/g, "");
  }

  const Permutation = {
    encrypt: permutationEncrypt,
    decrypt: permutationDecrypt,
  };

  // 7) Grille (simple position extraction in square)
  function grilleSquareSize(holes) {
    const maxPos = Math.max(...holes, 0);
    const n = Math.ceil(Math.sqrt(maxPos + 1));
    return Math.max(n, 2);
  }

  function parseHoles(key) {
    const holes = String(key || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (!holes.length) throw new Error("Grille key must be comma-separated hole positions (e.g. 0,3,5,8).");
    const set = new Set(holes);
    if (set.size !== holes.length) throw new Error("Grille hole positions must not repeat.");
    return holes;
  }

  function grilleEncrypt(text, key) {
    const holes = parseHoles(key);
    const n = grilleSquareSize(holes);
    const size = n * n;
    const t = String(text || "").padEnd(size, "_").slice(0, size);
    // "Holes reveal important chars": take only chars at hole positions
    let out = "";
    for (const pos of holes) {
      if (pos >= size) throw new Error(`Grille hole position ${pos} out of range for ${n}x${n} grid.`);
      out += t[pos];
    }
    return out;
  }

  function grilleDecrypt(cipher, key) {
    const holes = parseHoles(key);
    const n = grilleSquareSize(holes);
    const size = n * n;
    const c = String(cipher || "");
    const grid = Array.from({ length: size }, () => "_");
    for (let i = 0; i < holes.length; i++) {
      const pos = holes[i];
      if (pos >= size) throw new Error(`Grille hole position ${pos} out of range for ${n}x${n} grid.`);
      grid[pos] = c[i] ?? "_";
    }
    return grid.join("").replace(/_+$/g, "");
  }

  const Grille = {
    encrypt: grilleEncrypt,
    decrypt: grilleDecrypt,
  };

  // 8) Block (blocks of 4)
  function blockShiftFromPass(pass) {
    const p = String(pass || "");
    let sum = 0;
    for (const ch of p) sum += ch.charCodeAt(0);
    return mod(sum, 26);
  }

  function blockEncrypt(text, key) {
    const base = blockShiftFromPass(key);
    const t = String(text || "");
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const posInBlock = i % 4;
      out += shiftChar(t[i], base + posInBlock);
    }
    return out;
  }

  function blockDecrypt(cipher, key) {
    const base = blockShiftFromPass(key);
    const t = String(cipher || "");
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const posInBlock = i % 4;
      out += shiftChar(t[i], -(base + posInBlock));
    }
    return out;
  }

  const Block = {
    encrypt: blockEncrypt,
    decrypt: blockDecrypt,
  };

  // 9) Hill (2x2)
  function parseHillKey(key) {
    const parts = String(key || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
      throw new Error("Hill key must be 4 integers (2×2 matrix), e.g. 3,3,2,5.");
    return parts.map((n) => mod(n, 26));
  }

  function hillDet(m) {
    // m: [a,b,c,d]
    return mod(m[0] * m[3] - m[1] * m[2], 26);
  }

  function hillInvMatrix(m) {
    const det = hillDet(m);
    const detInv = modInv(det, 26);
    if (detInv == null) throw new Error("Hill matrix is not invertible mod 26.");
    const a = m[0],
      b = m[1],
      c = m[2],
      d = m[3];
    // adjugate: [d, -b, -c, a]
    const inv = [d, -b, -c, a].map((x) => mod(detInv * x, 26));
    return inv;
  }

  function hillProcess(text, m) {
    const t = onlyLettersLower(text);
    const pairs = t.length % 2 === 1 ? t + "x" : t;
    let out = "";
    for (let i = 0; i < pairs.length; i += 2) {
      const x1 = alphaIndex(pairs[i]);
      const x2 = alphaIndex(pairs[i + 1]);
      const y1 = mod(m[0] * x1 + m[1] * x2, 26);
      const y2 = mod(m[2] * x1 + m[3] * x2, 26);
      out += A[y1] + A[y2];
    }
    return out;
  }

  function hillEncrypt(text, key) {
    const m = parseHillKey(key);
    const det = hillDet(m);
    if (modInv(det, 26) == null) throw new Error("Hill matrix is not invertible mod 26.");
    return hillProcess(text, m);
  }

  function hillDecrypt(cipher, key) {
    const m = parseHillKey(key);
    const inv = hillInvMatrix(m);
    const t = onlyLettersLower(cipher);
    let out = "";
    const pairs = t.length % 2 === 1 ? t + "x" : t;
    for (let i = 0; i < pairs.length; i += 2) {
      const y1 = alphaIndex(pairs[i]);
      const y2 = alphaIndex(pairs[i + 1]);
      const x1 = mod(inv[0] * y1 + inv[1] * y2, 26);
      const x2 = mod(inv[2] * y1 + inv[3] * y2, 26);
      out += A[x1] + A[x2];
    }
    return out.toLowerCase();
  }

  const Hill = {
    encrypt: hillEncrypt,
    decrypt: hillDecrypt,
  };

  // 10) Stream (RC4-like) — symmetric
  function rc4Bytes(keyStr) {
    const key = String(keyStr || "");
    if (!key) throw new Error("Stream key must be a non-empty passphrase.");
    const S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + key.charCodeAt(i % key.length)) & 255;
      [S[i], S[j]] = [S[j], S[i]];
    }
    let i = 0;
    j = 0;
    return function nextByte() {
      i = (i + 1) & 255;
      j = (j + S[i]) & 255;
      [S[i], S[j]] = [S[j], S[i]];
      const K = S[(S[i] + S[j]) & 255];
      return K;
    };
  }

  function streamXor(text, key) {
    const next = rc4Bytes(key);
    const t = String(text || "");
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const b = next();
      out += String.fromCharCode(t.charCodeAt(i) ^ b);
    }
    return out;
  }

  const Stream = {
    encrypt: streamXor,
    decrypt: streamXor,
  };

  // 11) Product (Vigenère then Columnar)
  const Product = {
    encrypt: (text, key) => {
      const raw = String(key || "");
      if (!raw.includes("|")) throw new Error("Product key must be 'vigKey|columnarKey' (missing '|').");
      const [k1, k2] = raw.split("|");
      return Columnar.encrypt(Vigenere.encrypt(text, k1), k2);
    },
    decrypt: (cipher, key) => {
      const raw = String(key || "");
      if (!raw.includes("|")) throw new Error("Product key must be 'vigKey|columnarKey' (missing '|').");
      const [k1, k2] = raw.split("|");
      return Vigenere.decrypt(Columnar.decrypt(cipher, k2), k1);
    },
  };

  const registry = {
    caesar: Caesar,
    vigenere: Vigenere,
    affine: Affine,
    railfence: RailFence,
    columnar: Columnar,
    permutation: Permutation,
    grille: Grille,
    block: Block,
    hill: Hill,
    stream: Stream,
    product: Product,
  };

  const cipherList = [
    { id: "", label: "None", keyLabel: "", keyPlaceholder: "" },
    { id: "caesar", label: "Caesar", keyLabel: "Shift", keyPlaceholder: "e.g. 3" },
    { id: "vigenere", label: "Vigenère", keyLabel: "Keyword", keyPlaceholder: "e.g. SECRET" },
    { id: "affine", label: "Affine", keyLabel: "a,b", keyPlaceholder: "e.g. 5,8" },
    { id: "railfence", label: "Rail-fence", keyLabel: "Rails", keyPlaceholder: "e.g. 3" },
    { id: "columnar", label: "Columnar", keyLabel: "Keyword", keyPlaceholder: "e.g. ZEBRA" },
    { id: "permutation", label: "Permutation", keyLabel: "Order", keyPlaceholder: "e.g. 3,1,4,2" },
    { id: "grille", label: "Grille", keyLabel: "Holes", keyPlaceholder: "e.g. 0,3,5,8" },
    { id: "block", label: "Block", keyLabel: "Passphrase", keyPlaceholder: "e.g. mykey" },
    { id: "hill", label: "Hill (2×2)", keyLabel: "Matrix", keyPlaceholder: "e.g. 3,3,2,5" },
    { id: "stream", label: "Stream (RC4-like)", keyLabel: "Passphrase", keyPlaceholder: "e.g. mypassword" },
    { id: "product", label: "Product", keyLabel: "vigKey|columnarKey", keyPlaceholder: "e.g. SECRET|ZEBRA" },
  ];

  window.CipherEngine = {
    encrypt(cipherType, text, key) {
      const id = String(cipherType || "");
      if (!id) return String(text || "");
      const impl = registry[id];
      if (!impl) throw new Error(`Unknown cipher: ${id}`);
      return impl.encrypt(String(text || ""), key);
    },
    decrypt(cipherType, text, key) {
      const id = String(cipherType || "");
      if (!id) return String(text || "");
      const impl = registry[id];
      if (!impl) throw new Error(`Unknown cipher: ${id}`);
      return impl.decrypt(String(text || ""), key);
    },
    getCipherList() {
      return cipherList.slice();
    },
  };
})();

