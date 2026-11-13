/* 말로 홀 기록 넣기: 음성 인식(또는 키보드 🎤로 받아쓴 글)을 홀 입력 칸으로 바꾼다.
 * 예) "3번 홀 파4 핸디캡 7 거리 350 보기 투퍼트 페어웨이 안착 티샷 230"
 *     "더블 쓰리퍼트 오른쪽 미스 OB 하나"   (홀 번호가 없으면 지금 홀)
 *     "5번 홀 6타 2퍼트 그린 왼쪽 어프로치 20 벙커 1 메모 벙커 탈출 실패"
 * 값은 바로 넣지 않고 미리보기 → 「적용」. 저장 값 형식은 입력 화면(app.js FIELDS)과 같다:
 *   score 파 기준 +/-, miss L·R·H·S·-, gmiss 짧음·길음·좌·우·-, fw·sg 1/0, 거리 m */
const Voice = (() => {
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  // ── 한글 숫자 → 아라비아 숫자 ──
  const SINO = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
  function sino(s) {
    let total = 0, cur = 0;
    for (const ch of s) {
      if (SINO[ch] !== undefined) cur = SINO[ch];
      else if (ch === "십") { total += (cur || 1) * 10; cur = 0; }
      else if (ch === "백") { total += (cur || 1) * 100; cur = 0; }
      else if (ch === "천") { total += (cur || 1) * 1000; cur = 0; }
      else return null;
    }
    return total + cur;
  }
  const NATIVE = { 스물: 20, 열: 10 };
  const NATIVE1 = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 석: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
  const UNIT_HARD = "(?=\\s*(?:번|개|타|홀|미터|m|M|야드|퍼트|퍼터|펏|온))";   // 숫자 뒤에 단위가 꼭 붙을 때
  const UNIT_SOFT = "(?=\\s*(?:번|개|타|홀|미터|m|M|야드|퍼트|퍼터|펏|온)|\\s|$|[,.])";
  function normNumbers(t) {
    // 영어식: 원퍼트·투온·쓰리퍼트, 파쓰리·파포·파파이브
    t = t.replace(/(원|투|쓰리|포|파이브|식스)\s*(퍼트|퍼터|펏|온)/g, (_, n, u) => ({ 원: 1, 투: 2, 쓰리: 3, 포: 4, 파이브: 5, 식스: 6 })[n] + u);
    t = t.replace(/파\s*(쓰리|포|파이브|식스)(?![가-힣])/g, (_, n) => "파" + ({ 쓰리: 3, 포: 4, 파이브: 5, 식스: 6 })[n]);
    // 「이번 홀」「이 홀」은 지금 홀(2번 홀로 읽지 않게)
    t = t.replace(/(?<![가-힣])이\s*번\s*홀|(?<![가-힣])이\s+홀/g, "지금 홀");
    // 고유어: 하나·둘·다섯은 홀로 써도 숫자, 한·두·세·네·열두는 단위가 붙을 때만(「네, 보기」를 4로 읽지 않게)
    t = t.replace(new RegExp(`(?<![가-힣])(스물|열)?\\s?(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉)${UNIT_SOFT}`, "g"), (_, ten, one) => String((ten ? NATIVE[ten] : 0) + NATIVE1[one]));
    t = t.replace(new RegExp(`(?<![가-힣])(스물|열)?\\s?(한|두|세|석|네)${UNIT_HARD}`, "g"), (_, ten, one) => String((ten ? NATIVE[ten] : 0) + NATIVE1[one]));
    t = t.replace(new RegExp(`(?<![가-힣])(열|스물)${UNIT_HARD}`, "g"), (_, ten) => String(NATIVE[ten]));
    // 항목 이름 바로 뒤의 숫자 말은 단위가 없어도 숫자(「핸디캡 열두」「거리 백오십」「벌타 두」)
    const KEYW = "(핸디캡|핸디|거리|티\\s*샷|드라이버|벌타|OB|오비|퍼트|퍼터|벙커|어프로치|스코어|타수)\\s*";
    t = t.replace(new RegExp(`${KEYW}(스물|열)?\\s?(하나|한|둘|두|셋|세|석|넷|네|다섯|여섯|일곱|여덟|아홉)(?![가-힣])`, "g"), (_, k, ten, one) => k + ((ten ? NATIVE[ten] : 0) + NATIVE1[one]));
    t = t.replace(new RegExp(`${KEYW}(열|스물)(?![가-힣])`, "g"), (_, k, ten) => k + NATIVE[ten]);
    t = t.replace(new RegExp(`${KEYW}([일이삼사오육륙칠팔구십백천]+)(?![가-힣])`, "g"), (m, k, x) => { const n = sino(x); return n === null ? m : k + n; });
    // 한자어: 십·백·천이 들어간 것(이백삼십, 십이)은 낱말 경계에서, 한 글자(삼, 오)는 단위가 붙을 때만 — 「오른쪽」「이글」은 그대로
    t = t.replace(new RegExp(`(?<![가-힣])([일이삼사오육륙칠팔구]?[십백천][일이삼사오육륙칠팔구십백천]*)${UNIT_SOFT}`, "g"), (m, x) => { const n = sino(x); return n === null ? m : String(n); });
    t = t.replace(new RegExp(`(?<![가-힣])([일이삼사오육륙칠팔구])${UNIT_HARD}`, "g"), (_, x) => String(SINO[x]));
    return t;
  }

  const NUM = "(\\d+(?:\\.\\d+)?)";
  const SCORE_WORD = [
    [/홀인원/, (par) => (par ? 1 - par : null)],
    [/알바트로스|알바/, () => -3],
    [/이글/, () => -2],
    [/버디/, () => -1],
    [/양파|더블\s*파/, (par) => (par ? par : null)],
    [/쿼드(?:러플)?(?:\s*보기)?/, () => 4],
    [/트리플(?:\s*보기)?/, () => 3],
    [/더블(?:\s*보기)?/, () => 2],
    [/보기/, () => 1],
    [/파\s*(?:세이브|로|했|$|[,.\s](?!\d))/, () => 0],
  ];

  /* 한 홀 분량의 글 → { set: {키: 값}, said: [알아들은 말], rest: 못 알아들은 말 }
   * par: 그 홀의 Par(타수 → +/- 바꿀 때) */
  function parseHole(text, par) {
    const set = {}, said = [];
    let t = " " + text + " ";
    const take = (re, fn) => {
      const m = t.match(re);
      if (!m) return false;
      const r = fn(m);
      if (r === false) return false;
      said.push(m[0].trim());
      t = t.replace(m[0], " ");
      return true;
    };
    // 메모는 끝까지 그대로(다른 낱말로 해석하지 않게 먼저 떼어 낸다)
    take(/메모\s*[:은는]?\s*(.+)$/, (m) => { set.memo = m[1].trim(); });
    // 코스 정보
    take(new RegExp(`(?<![가-힣])(?<!더블\\s)파\\s*([3-6])(?:\\s*홀)?(?!\\s*(?:\\d|퍼트|퍼터|펏|온|타))`), (m) => { set.par = Number(m[1]); });
    if (isFinite(set.par)) par = set.par;
    take(new RegExp(`(?:핸디캡|핸디|HCP|hcp)\\s*${NUM}`), (m) => { const v = Number(m[1]); if (v < 1 || v > 18) return false; set.hcp = v; });
    take(new RegExp(`(?:홀\\s*)?거리\\s*${NUM}\\s*(미터|m|야드)?`), (m) => { set.dist = Math.round(Number(m[1]) * (m[2] === "야드" ? 0.9144 : 1)); });
    // 거리류(퍼트 수보다 먼저: 「퍼트 거리 3」을 퍼트 수로 잘못 읽지 않게)
    take(new RegExp(`(?:첫\\s*퍼트|퍼트\\s*거리|첫\\s*펏)\\s*${NUM}\\s*(?:미터|m)?|${NUM}\\s*(?:미터|m)\\s*(?:첫\\s*)?(?:퍼트|펏)`), (m) => { set.fp = Number(m[1] ?? m[2]); });
    take(new RegExp(`(?:어프로치|어프)\\s*(?:거리)?\\s*${NUM}`), (m) => { set.appr = Math.round(Number(m[1])); });
    take(new RegExp(`(?:티\\s*샷|티샷|드라이버|드라이브|비거리)\\s*(?:거리)?\\s*${NUM}\\s*(미터|m|야드)?`), (m) => { set.drive = Math.round(Number(m[1]) * (m[2] === "야드" ? 0.9144 : 1)); });
    // 부호 붙은 스코어(「플러스 2」)는 뒤 숫자를 퍼트 수로 잘못 읽지 않게 먼저
    take(/(?:스코어\s*)?(플러스|마이너스)\s*(\d)|(?:스코어\s*)([+-])\s*(\d)/, (m) => { const sg = m[1] || m[3], n = Number(m[2] || m[4]); set.score = (sg === "플러스" || sg === "+" ? 1 : -1) * n; });
    // 퍼트 수
    if (!take(new RegExp(`${NUM}\\s*번?\\s*(?:퍼트|퍼터|펏)|(?:퍼트|퍼터|펏)\\s*(?:수\\s*)?${NUM}\\s*(?:번|개|회)?`), (m) => { const v = Number(m[1] ?? m[2]); if (v > 6) return false; set.putts = v; }))
      take(/노\s*퍼트|칩\s*인|칩인/, () => { set.putts = 0; });
    // 온그린 타수: 2온, 온그린 3
    take(new RegExp(`${NUM}\\s*온(?!그린)|온\\s*그린\\s*(?:타수\\s*)?${NUM}`), (m) => { const v = Number(m[1] ?? m[2]); if (v < 1 || v > 8) return false; set.ong = v; });
    // OB·벌타·해저드·벙커
    take(new RegExp(`(?:OB|ob|오비)\\s*${NUM}?\\s*(?:번|개|회)?`), (m) => { set.ob = m[1] ? Number(m[1]) : 1; });
    let pen = null;
    take(new RegExp(`(?:벌타|패널티|페널티)\\s*${NUM}?\\s*(?:타|번|개)?`), (m) => { pen = m[1] ? Number(m[1]) : 1; });
    take(new RegExp(`(?:해저드|워터\\s*해저드|물에|언플레이어블|분실구?|로스트)\\s*(?:에\\s*빠짐|빠짐)?\\s*${NUM}?\\s*(?:번|개|회)?`), (m) => { pen = (pen || 0) + (m[1] ? Number(m[1]) : 1); });
    // 이 앱은 OB도 벌타에 포함해 센다(OB 1 → 벌타 1 이상)
    if (pen === null && isFinite(set.ob)) pen = set.ob;
    if (pen !== null) set.pen = Math.max(pen, set.ob || 0);
    take(new RegExp(`벙커\\s*(?:샷)?\\s*${NUM}?\\s*(?:번|개|회|타)?`), (m) => { set.bunker = m[1] ? Number(m[1]) : 1; });
    // 그린 미스(「그린」이 붙은 방향·짧음·길음)
    take(/그린\s*(?:미스\s*)?(왼쪽|좌측|좌|오른쪽|우측|우|짧|길|오버)\S*/, (m) => { set.gmiss = /왼|좌/.test(m[1]) ? "좌" : /오른|우/.test(m[1]) ? "우" : m[1] === "짧" ? "짧음" : "길음"; });
    if (!set.gmiss) take(/(짧았|짧게|짧음|숏|길었|길게|길음|오버)\S*/, (m) => { set.gmiss = /짧|숏/.test(m[1]) ? "짧음" : "길음"; });
    take(/그린\s*(?:적중|온|성공)|GIR/, () => { set.gmiss = "-"; });
    // 티샷: 페어웨이 안착/미스, 방향, 훅·슬라이스
    take(/(?:티\s*샷\s*)?(?:페어웨이|페웨|FW)\s*(?:안착|적중|성공|킵|에|o|O)?(?:\s*(놓침|미스|실패|못|x|X))?/, (m) => { if (m[1]) set.fw = 0; else { set.fw = 1; set.miss = "-"; } });
    take(/(?:티\s*샷\s*)?(훅|슬라이스|슬라|왼쪽|좌측|레프트|오른쪽|오늘쪽|우측|라이트|러프)(?:\s*(?:미스|으로|러프|감|밀림|감김))?/, (m) => {
      const w = m[1];
      set.miss = w === "훅" ? "H" : /슬라/.test(w) ? "S" : /왼|좌|레프트/.test(w) ? "L" : /오른|오늘|우|라이트/.test(w) ? "R" : null;
      if (!set.miss) delete set.miss;
      set.fw = 0;
    });
    // 스코어: +2, 마이너스 1, 이름(보기·더블…), 타수(5타)
    if (set.score === undefined) {
      if (!take(new RegExp(`(?:스코어|타수)?\\s*${NUM}\\s*타|(?:스코어|타수)\\s*${NUM}`), (m) => { const n = Number(m[1] ?? m[2]); if (!par) { set._strokes = n; return; } set.score = n - par; }))
        for (const [re, f] of SCORE_WORD) { if (take(re, () => { const v = f(par); if (v === null) return false; set.score = v; })) break; }
    }
    const rest = t.replace(/\s*(그리고|이고|하고|요|네|응|어|음|다음|번\s*홀|홀|에서|은|는|이|가|을|를|,|\.)\s*/g, " ").trim();
    return { set, said, rest };
  }

  /* 전체 문장 → [{ hole, set, said, rest }] (홀 번호가 여러 개면 나눠서), nav: 'next'|'prev'|번호 */
  function parse(raw, ctx) {
    let t = normNumbers(String(raw || "").replace(/\s+/g, " ").trim());
    const out = { parts: [], nav: null };
    if (/^(다음\s*홀|넥스트)$/.test(t)) return { ...out, nav: "next" };
    if (/^(이전\s*홀|앞\s*홀)$/.test(t)) return { ...out, nav: "prev" };
    const marks = [...t.matchAll(/(\d{1,2})\s*번\s*홀|(\d{1,2})\s*홀(?!\s*인원)|지금\s*홀/g)];
    const segs = [];
    if (!marks.length) segs.push({ hole: ctx.cur, text: t });
    else {
      if (marks[0].index > 0) segs.push({ hole: ctx.cur, text: t.slice(0, marks[0].index) });
      marks.forEach((m, i) => segs.push({ hole: m[1] || m[2] ? Number(m[1] || m[2]) : ctx.cur, text: t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined) }));
    }
    for (const s of segs) {
      if (s.hole < 1 || s.hole > 18) { out.parts.push({ hole: s.hole, set: {}, said: [], rest: s.text, bad: `${s.hole}번 홀은 없습니다` }); continue; }
      if (!s.text.trim()) { if (marks.length === 1 && segs.length === 1) out.nav = s.hole; continue; }
      const p = parseHole(s.text, ctx.par(s.hole));
      out.parts.push({ hole: s.hole, ...p });
    }
    return out;
  }

  // 미리보기용 한 줄 설명
  const NAME = { "-3": "알바트로스", "-2": "이글", "-1": "버디", 0: "파", 1: "보기", 2: "더블", 3: "트리플" };
  const MISS = { L: "왼쪽", R: "오른쪽", H: "훅", S: "슬라이스", "-": "없음" };
  function describe(set) {
    const a = [];
    if (set.par !== undefined) a.push(`Par ${set.par}`);
    if (set.hcp !== undefined) a.push(`핸디캡 ${set.hcp}`);
    if (set.dist !== undefined) a.push(`거리 ${set.dist}m`);
    if (set.score !== undefined) a.push(`스코어 ${set.score > 0 ? "+" + set.score : set.score}${NAME[set.score] ? `(${NAME[set.score]})` : ""}`);
    if (set._strokes !== undefined) a.push(`${set._strokes}타(Par를 몰라 스코어로 못 바꿈)`);
    if (set.putts !== undefined) a.push(`퍼트 ${set.putts}`);
    if (set.ong !== undefined) a.push(`${set.ong}온`);
    if (set.fw !== undefined) a.push(`페어웨이 ${set.fw ? "안착" : "미스"}`);
    if (set.miss !== undefined && set.miss !== "-") a.push(`티샷 ${MISS[set.miss]}`);
    if (set.drive !== undefined) a.push(`티샷 ${set.drive}m`);
    if (set.gmiss !== undefined) a.push(set.gmiss === "-" ? "그린 적중" : `그린 미스 ${set.gmiss}`);
    if (set.appr !== undefined) a.push(`어프로치 ${set.appr}m`);
    if (set.fp !== undefined) a.push(`첫 퍼트 ${set.fp}m`);
    if (set.pen !== undefined) a.push(`벌타 ${set.pen}`);
    if (set.ob !== undefined) a.push(`OB ${set.ob}`);
    if (set.bunker !== undefined) a.push(`벙커 ${set.bunker}`);
    if (set.memo !== undefined) a.push(`메모 「${set.memo}」`);
    return a.join(" · ");
  }

  /* 음성 인식 한 번(누르고 말하기). onText(글, 끝났나) */
  function listen(onText, onEnd) {
    if (!SR) return null;
    const r = new SR();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onText((final + interim).trim(), false);
    };
    r.onerror = (e) => onEnd(e.error === "not-allowed" || e.error === "service-not-allowed" ? "마이크 사용이 허용되지 않았습니다. 브라우저 설정에서 마이크를 허용해 주세요." : e.error === "no-speech" ? "말소리를 듣지 못했습니다. 다시 눌러 말해 주세요." : `음성 인식 오류: ${e.error}`);
    r.onend = () => { onText(final.trim(), true); onEnd(null); };
    r.start();
    return r;
  }

  return { available: !!SR, parse, describe, listen, _normNumbers: normNumbers };
})();
if (typeof module !== "undefined") module.exports = Voice;
