/* 동반자 기록: 붙여넣은 글·사진에서 동반자 점수를 읽고, 내 라운드와 비교할 숫자를 만든다.
 * 동반자 한 명: { name, front, back, total, holes: [{ h, st }] }  — st는 그 홀 타수(절대값).
 * 내 기록은 Par 대비(+/-)로 저장하지만, 동반자는 Par를 모를 수도 있어 타수 그대로 둔다.
 * 스코어만 알면 holes 없이 front/back/total만 둔다.
 *
 * 붙여넣기에서 읽는 모양(여러 줄·여러 명 섞어도 됨):
 *   홍*동 1 2 0 1 ...  (9개 또는 18개, 끝에 합계 칸이 있어도 됨, 타수 또는 +/-)
 *   철수 85            (총타수만)
 *   영희 42 45         (전반·후반)
 *   민수               (이름만 있는 줄 다음에 오는 Score/숫자 줄은 그 사람 것)
 *   Score 1 0 2 ...
 */
const Companions = (() => {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const NUM_TAIL = /^(.*?)\s*[:：]?\s*([+-]?\d+(?:(?:\s*[,/]\s*|\s+)[+-]?\d+)*)\s*(?:타)?$/;
  const SKIP = /^(par|파|hole|홀|홀별|합계|total|거리|dist|yard|yds?|white|blue|red|black|gold|화이트|블루|레드|블랙|골드|핸디|hdcp|handicap|out|in)\b/i;
  const DATE = /^\d{4}[-.]\d{1,2}[-.]\d{1,2}/;

  // OCR 결과에서 자주 틀리는 글자를 숫자로 고친다(숫자 사이에 있을 때만)
  function cleanOcr(text) {
    return String(text).split("\n").map((l) => l
      .replace(/[|¦\[\]{}()]/g, " ")
      .replace(/(?<=[\s\d])[Oo](?=[\s\d]|$)/g, "0")
      .replace(/(?<=[\s\d])[lI](?=[\s\d]|$)/g, "1")
      .replace(/\s{2,}/g, " ").trim())
      .map(splitRun).filter(Boolean).join("\n");
  }
  // OCR은 한 자리 숫자 사이 칸을 자주 붙여 읽는다(546545356). 붙은 자릿수로 홀 칸·합계 칸을 나눈다:
  // 9=9홀, 11=9홀+합계, 18=18홀, 20=9+OUT+9, 22=…+IN, 24=…+TOTAL
  const RUNS = { 9: [9], 11: [9, 2], 18: [18], 20: [9, 2, 9], 22: [9, 2, 9, 2], 24: [9, 2, 9, 2, 2] };
  function splitRun(line) {
    return line.replace(/\d{9,24}/g, (run) => {
      const plan = RUNS[run.length];
      if (!plan) return run;
      const out = [];
      let i = 0;
      for (const n of plan) {
        if (n === 9 || n === 18) { out.push(...run.slice(i, i + n).split("")); i += n; } else { out.push(run.slice(i, i + n)); i += n; }
      }
      return out.join(" ");
    });
  }

  // 합계 칸을 뺀다: 9홀 줄의 10번째(OUT/IN), 18홀 줄의 10·20·21번째(OUT·IN·TOTAL).
  // 합계 칸은 +/- 합일 수도 타수 합일 수도 있어 값으로 맞춰 보지 않고 자리로 판단한다(19칸만 끝이 합계인지 확인).
  function stripTotals(a) {
    const s = (x) => x.reduce((p, q) => p + q, 0);
    if (a.length === 10) return a.slice(0, 9);
    if (a.length === 20 || a.length === 21) return [...a.slice(0, 9), ...a.slice(10, 19)];
    if (a.length === 19 && a[18] === s(a.slice(0, 18))) return a.slice(0, 18);
    return a;
  }

  /* text → [{ name, front, back, total, holes, warnings }]
   * pars: { 홀번호: par } — 내 라운드의 Par. +/-로 적은 줄을 타수로 바꿀 때 쓴다.
   * opts.skipScore: 「Score」 줄은 내 것으로 보고 건너뛴다(스마트스코어 붙여넣기 등록 화면). */
  function parse(text, pars = {}, opts = {}) {
    const chunks = [];   // 이름 순서대로 [{ name, nums }]
    let pending = "", unnamed = 0;
    for (let line of String(text || "").replace(/\r/g, "").split("\n")) {
      line = line.replace(/\t/g, " ").trim();
      // 숫자 사이에 낀 OUT·IN·합계 같은 칸 이름은 지운다(숫자는 남기고 stripTotals가 합계 칸을 뺀다)
      const d0 = line.search(/[+-]?\d/);
      if (d0 > 0) line = line.slice(0, d0) + line.slice(d0).replace(/(?:OUT|IN|TOTAL|TOT|합계|전반|후반)/gi, " ").replace(/\s{2,}/g, " ");
      if (!line || DATE.test(line)) { if (DATE.test(line)) pending = ""; continue; }
      const m = line.match(NUM_TAIL);
      if (!m) {
        // 숫자가 없는 짧은 줄은 다음 숫자 줄의 이름
        pending = line.length <= 12 && !/[,()]/.test(line) && !SKIP.test(line) ? line.replace(/[:：]$/, "").trim() : "";
        continue;
      }
      let label = m[1].trim();
      const nums = (m[2].match(/[+-]?\d+/g) || []).map(Number);
      if (SKIP.test(label)) continue;
      if (/^(score|스코어)$/i.test(label)) {
        if (opts.skipScore || !pending) continue;
        label = pending;
      } else if (!label) {
        if (pending) label = pending;
        else if (nums.length >= 9) {
          // 이름을 숫자로 잘못 읽은 줄(사진): 홀 칸보다 하나 많고 첫 값이 점수일 수 없으면 그 값을 버린다.
          // 이름은 「이름*n」으로 두어 빨간 칸으로 표시 — 직접 적어야 저장된다.
          if ((nums.length === 10 || nums.length === 11 || nums.length === 19) && Math.abs(nums[0]) > 15) nums.shift();
          label = `이름*${++unnamed}`;
        } else continue;
      }
      chunks.push({ name: label, nums });
    }

    const byName = new Map();
    for (const c of chunks) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c.nums);
    }
    const out = [];
    for (const [name, rows] of byName) {
      const p = { name, front: null, back: null, total: null, holes: [], warnings: [] };
      const vals = [];   // 홀별 값(아직 타수인지 +/-인지 모름)
      for (const raw of rows) {
        const a = stripTotals(raw);
        if (a.length >= 9) { vals.push(...a.slice(0, 18 - vals.length)); continue; }
        if (a.length === 1 && a[0] >= 50) p.total = a[0];
        else if (a.length === 1 && a[0] >= 25) { if (p.front === null) p.front = a[0]; else p.back = a[0]; }
        else if (a.length === 2) { p.front = a[0]; p.back = a[1]; }
        else if (a.length === 3 && a[0] + a[1] === a[2]) { p.front = a[0]; p.back = a[1]; p.total = a[2]; }
        else p.warnings.push(`읽지 못한 숫자: ${raw.join(" ")}`);
      }
      if (vals.length) {
        const hs = vals.map((v, i) => ({ h: i + 1, v }));
        const known = hs.filter((x) => isNum(pars[x.h]));
        // 타수인지 +/-인지: 음수가 있으면 +/-, 아니면 Par와 비교(Par를 모르면 평균 2.8타 이상이면 타수로 본다)
        const neg = vals.some((v) => v < 0);
        const absolute = !neg && (known.length ? sum(known.map((x) => x.v)) >= sum(known.map((x) => pars[x.h])) - known.length * 0.6 : sum(vals) / vals.length >= 2.8);
        if (!absolute && known.length < hs.length) p.warnings.push("+/-로 적었는데 Par를 모르는 홀이 있어 그 홀은 넣지 않음");
        p.holes = hs.filter((x) => absolute || isNum(pars[x.h])).map((x) => ({ h: x.h, st: absolute ? x.v : pars[x.h] + x.v }));
        if (vals.length !== 9 && vals.length !== 18) p.warnings.push(`${vals.length}홀만 읽음`);
        const odd = p.holes.filter((x) => x.st < 1 || x.st > 15).map((x) => x.h);
        if (odd.length) p.warnings.push(`${odd.join("·")}번 홀 타수가 이상함 — 확인 필요`);
      }
      // 홀 기록과 따로 적은 합계가 다르면 알려 준다
      const s = summary(p);
      if (p.total !== null && s.holesTotal !== null && p.total !== s.holesTotal) p.warnings.push(`총타수 표기 ${p.total} ≠ 홀 합계 ${s.holesTotal}`);
      if (/\*/.test(name)) p.warnings.push(name.startsWith("이름*") ? "이름을 읽지 못함 — 적어 주세요" : "이름에 *가 있음 — 고쳐 주세요");
      out.push(p);
    }
    return out;
  }

  /* 동반자 점수 정리: 홀 기록이 있으면 그것으로, 없으면 적은 숫자로. pars가 있으면 오버파도 */
  function summary(c, pars = {}) {
    const hm = Object.fromEntries((c.holes || []).filter((x) => isNum(x.st)).map((x) => [x.h, x.st]));
    const half = (a) => { const xs = Array.from({ length: 9 }, (_, i) => hm[a + i]); return xs.every(isNum) ? sum(xs) : null; };
    const hf = half(1), hb = half(10);
    const holesTotal = hf !== null && hb !== null ? hf + hb : null;
    const front = hf ?? (isNum(c.front) ? c.front : null);
    const back = hb ?? (isNum(c.back) ? c.back : null);
    const total = holesTotal ?? (isNum(c.total) ? c.total : front !== null && back !== null ? front + back : null);
    const parSum = Array.from({ length: 18 }, (_, i) => pars[i + 1]);
    const over = total !== null && parSum.every(isNum) ? total - sum(parSum) : null;
    return { hm, front, back, total, over, holesTotal, holeCount: Object.keys(hm).length };
  }

  /* 사진 줄이기: 긴 변 max px, JPEG로 다시 저장. 다시 그리면서 EXIF(촬영 위치 GPS 등)가 모두 빠진다 —
   * 저장소가 공개라 위치정보가 함께 올라가면 안 된다. 반환: { b64, dataUrl } */
  async function shrink(file, max = 1600, quality = 0.82) {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {
      img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("사진을 열 수 없습니다(JPG·PNG만 가능).")); i.src = URL.createObjectURL(file); });
    }
    const w0 = img.width, h0 = img.height, k = Math.min(1, max / Math.max(w0, h0));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", quality);
    return { dataUrl, b64: dataUrl.split(",")[1] };
  }

  /* 사진 글자 읽기(OCR). 이 기기 브라우저 안에서 처리한다(사진을 다른 서버로 보내지 않음).
   * 처음 한 번 인식 프로그램과 한글·영문 글자 데이터(수 MB)를 받아 온다. */
  const OCR_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  async function ocr(file, onProgress) {
    if (!window.Tesseract) {
      await new Promise((ok, no) => { const s = document.createElement("script"); s.src = OCR_LIB; s.onload = ok; s.onerror = () => no(new Error("글자 인식 프로그램을 받지 못했습니다(인터넷 연결 확인).")); document.head.appendChild(s); });
    }
    const img = await prepare(file);
    const w = await window.Tesseract.createWorker("kor+eng", 1, { logger: (m) => onProgress && isNum(m.progress) && onProgress(m.status, m.progress) });
    try {
      // 6 = 글자 덩어리 하나로 보고 줄 단위로 읽기(표·스코어카드에 맞음), 칸 사이 공백 유지
      await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      const { data } = await w.recognize(img);
      return cleanOcr(data.text || "");
    } finally { await w.terminate(); }
  }

  /* 인식 전처리: 작은 사진은 키우고, 흑백으로 바꾼 뒤 표의 가로·세로 선을 지운다.
   * 스코어카드 칸 선이 남아 있으면 「]」「|」 같은 글자로 읽혀 숫자가 깨진다. */
  async function prepare(file) {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {
      img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("사진을 열 수 없습니다.")); i.src = URL.createObjectURL(file); });
    }
    const k = Math.min(3, Math.max(1, 1800 / img.width));
    const W = Math.round(img.width * k), H = Math.round(img.height * k);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H), px = d.data;
    // 밝기 평균으로 문턱값을 잡아 흑백으로(어두운 배경 화면 캡처면 뒤집는다)
    const lum = new Float32Array(W * H);
    let mean = 0;
    for (let i = 0; i < W * H; i++) { lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; mean += lum[i]; }
    mean /= W * H;
    const darkBg = mean < 110, th = darkBg ? mean + 40 : mean - 40;
    const ink = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) ink[i] = darkBg ? lum[i] > th : lum[i] < th;
    // 긴 선 지우기: 한 줄(가로) 또는 한 칸(세로)에 잉크가 길게 이어진 부분
    const minRun = (n) => Math.max(40, n * 0.25);
    for (let y = 0; y < H; y++) {
      let run = 0;
      for (let x = 0; x <= W; x++) {
        if (x < W && ink[y * W + x]) { run++; continue; }
        if (run >= minRun(W)) for (let t = x - run; t < x; t++) ink[y * W + t] = 2;
        run = 0;
      }
    }
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = 0; y <= H; y++) {
        if (y < H && ink[y * W + x]) { run++; continue; }
        if (run >= Math.max(60, H * 0.4)) for (let t = y - run; t < y; t++) ink[t * W + x] = 2;
        run = 0;
      }
    }
    for (let i = 0; i < W * H; i++) { const v = ink[i] === 1 ? 0 : 255; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255; }
    ctx.putImageData(d, 0, 0);
    return cv;
  }

  return { parse, summary, shrink, ocr, cleanOcr };
})();
if (typeof module !== "undefined") module.exports = Companions;
