/* 서버판2 화면 — 일정(달력)·모임·친구·친구 순위·마이페이지.
 * app.js의 route()가 X("schedule") 식으로 부르고, 공용 도구({ app, esc, toast, G, route, reload, rounds, arg })를 넘겨 준다.
 * 서버 호출은 G.api(method, url, body) — 로그인 만료(401)면 api.js가 로그인 페이지로 보낸다.
 */
const Extra = (() => {
  const v = (x, d = "-") => (x === null || x === undefined ? d : x);
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const isNum = (x) => typeof x === "number" && isFinite(x);
  const GENDER = { M: "남", F: "여" };
  const yearOptions = (sel) => { const y = new Date().getFullYear(); let o = `<option value="">선택 안 함</option>`; for (let v = y - 10; v >= 1935; v--) o += `<option value="${v}" ${Number(sel) === v ? "selected" : ""}>${v}년</option>`; return o; };
  const profileNote = `<div class="notice" style="margin-bottom:12px">👤 <b>성별·출생연도</b>를 넣으면 모임 대시보드의 성별·나이대 통계에 반영됩니다(인원수 합계만, 개인별로는 보이지 않음). <a href="#/mypage/profile">마이페이지에서 넣기 ›</a></div>`;
  // 18홀을 다 적은 완료 라운드의 타수(홀 score는 파 대비 오버 → 타수 = par + score)
  const strokes18 = (r) => {
    if (r.planned) return null;
    const hs = (r.holes || []).filter((h) => isNum(h.score) && isNum(h.par));
    return hs.length === 18 ? hs.reduce((a, h) => a + h.par + h.score, 0) : null;
  };
  const avg1 = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const dayTxt = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`; };
  // 버튼을 누르는 동안 막고, 실패하면 알림 후 다시 누를 수 있게
  const run = (ctx, fn, after) => async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await fn(e); if (after) await after(); } catch (x) { if (x.message !== "취소") ctx.toast(x.message, 5000); b.disabled = false; }
  };

  // ───────── 일정(달력) ─────────
  let calMonth = null, calSel = null, calFilter = "all", calList = false, calEdit = null;
  async function schedule(ctx) {
    const { app, esc, G } = ctx;
    const now = new Date();
    if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const first = new Date(calMonth), start = new Date(first);
    start.setDate(1 - first.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 41);
    app.innerHTML = `<p class="muted">일정을 불러오는 중…</p>`;
    const [{ rounds, events, personal = [] }, { groups }] = await Promise.all([
      G.api("GET", `/api/schedule?from=${ymd(start)}&to=${ymd(end)}`),
      G.api("GET", "/api/groups"),
    ]);
    const byDay = {};
    const put = (d, x) => (byDay[d] = byDay[d] || []).push(x);
    if (calFilter !== "group") rounds.forEach((r) => put(r.date, r));
    if (calFilter !== "group") personal.forEach((p) => put(p.date, p));
    if (calFilter !== "mine") events.forEach((e) => put(e.date, e));
    const today = ymd(now);
    if (!calSel) calSel = today;
    const label = (x) => (x.kind === "round" ? `${x.planned ? "예정 " : ""}${x.course}${x.score ? " " + x.score : ""}` : `${x.time ? x.time + " " : ""}${x.title}`);
    const cls = (x) => (x.kind === "event" ? "g" : x.kind === "personal" ? "m" : x.planned ? "p" : "r");
    let cells = "";
    for (let w = 0; w < 6; w++) {
      cells += "<tr>";
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + w * 7 + i);
        const k = ymd(d), items = byDay[k] || [];
        cells += `<td data-day="${k}" class="${d.getMonth() !== first.getMonth() ? "out" : ""} ${k === today ? "today" : ""} ${k === calSel ? "sel" : ""} ${i === 0 ? "sun" : ""}">
          <span class="dn">${d.getDate()}</span>${items.slice(0, 3).map((x) => `<span class="ev ${cls(x)}" title="${esc(label(x))}">${esc(label(x))}</span>`).join("")}${items.length > 3 ? `<span class="muted" style="font-size:11px">+${items.length - 3}</span>` : ""}</td>`;
      }
      cells += "</tr>";
    }
    const sel = byDay[calSel] || [];
    app.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 class="mt0" style="margin:0">📅 ${first.getFullYear()}년 ${first.getMonth() + 1}월</h2>
        <div class="row"><button class="btn ghost" id="cPrev" type="button">‹ 이전</button><button class="btn ghost" id="cToday" type="button">오늘</button><button class="btn ghost" id="cNext" type="button">다음 ›</button></div>
      </div>
      <div class="row" style="justify-content:space-between;align-items:center;margin:6px 0 10px">
        <div class="seg" id="cFilter">${[["all", "전체"], ["group", "모임만"], ["mine", "내 일정만"]].map(([k, t]) => `<button type="button" data-f="${k}" class="${calFilter === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <div class="seg"><button type="button" id="cMode" class="${calList ? "on" : ""}">${calList ? "📅 달력으로 보기" : "📋 목록으로 보기"}</button></div>
      </div>
      <p class="legend-dots"><span><i style="background:var(--mint)"></i>내 라운드</span><span><i style="background:var(--peach)"></i>예정 라운드</span><span><i style="background:var(--butter)"></i>개인 일정</span><span><i style="background:var(--lav)"></i>모임 일정</span></p>
      ${calList ? `<div class="card">${Object.keys(byDay).filter((d) => d.slice(0, 7) === ymd(first).slice(0, 7)).sort().map((d) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${dayTxt(d)}</b> ${byDay[d].map((x) => `<span class="cal"><span class="ev ${cls(x)}" style="display:inline-block;margin:2px 4px 0 0;font-size:13px">${esc(label(x))}${x.kind === "event" ? ` · ${esc(x.group_name)}` : ""}</span></span>`).join("")}</div>`).join("") || `<p class="muted mt0">이달 일정이 없습니다.</p>`}</div>`
      : `<div class="card" style="padding:8px"><table class="cal"><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${cells}</tbody></table></div>`}
      <h2>${dayTxt(calSel)}</h2>
      <div class="card">
        ${sel.length ? sel.map((x) => (x.kind === "personal" ? `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span class="pill" style="background:var(--butter);color:var(--butter-d)">개인 일정</span> <b>${esc(x.title)}</b> ${x.time ? `<span class="muted">${esc(x.time)}</span>` : ""}${x.course ? ` · ${esc(x.course)}` : ""}
            ${x.memo ? `<div class="muted" style="margin-top:4px;white-space:pre-wrap">${esc(x.memo)}</div>` : ""}
            <div class="row" style="margin-top:6px"><button class="btn ghost xs" data-edp="${x.id}" type="button">수정</button><button class="btn danger xs" data-delp="${x.id}" type="button">삭제</button></div></div>`
          : x.kind === "round" ? `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span class="pill">${x.planned ? "예정 라운드" : "내 라운드"}</span> <b>${esc(x.course)}</b> <span class="muted">${esc(x.where)}</span>
            ${x.score ? ` · <b>${x.score}타</b>${x.holes < 18 ? ` (${x.holes}홀)` : ""}` : ""} <a href="#/round/${encodeURIComponent(x.id)}">${x.planned ? "공략 보기" : "자세히"} ›</a></div>`
          : `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span class="pill" style="background:var(--lav);color:var(--lav-d)">${esc(x.group_name)}</span> <b>${esc(x.title)}</b> ${x.time ? `<span class="muted">${esc(x.time)}</span>` : ""}${x.course ? ` · ${esc(x.course)}` : ""}
            ${x.memo ? `<div class="muted" style="margin-top:4px;white-space:pre-wrap">${esc(x.memo)}</div>` : ""}
            ${(() => { const me = String(G.me()?.id); const f = x.flights?.flights?.find((ff) => ff.members.some((m) => String(m.id) === me)); return f ? `<div style="margin-top:6px"><span class="pill ok">내 조: ${f.no}조${f.tee ? " " + esc(f.tee) : ""}</span></div>` : ""; })()}
            <div style="margin-top:6px;font-size:13px">참석: ${x.attendees.filter((a) => a.going).map((a) => esc(a.nickname)).join(", ") || "-"}${x.attendees.some((a) => !a.going) ? ` <span class="muted">· 불참: ${x.attendees.filter((a) => !a.going).map((a) => esc(a.nickname)).join(", ")}</span>` : ""}</div>
            <div class="row" style="margin-top:6px">
              <button class="btn ${x.my_going === true ? "" : "ghost"} xs" data-go="${x.id}" data-v="1" type="button">참석</button>
              <button class="btn ${x.my_going === false ? "" : "ghost"} xs" data-go="${x.id}" data-v="0" type="button">불참</button>
              <a class="btn ghost xs" href="#/event/${x.id}">상세·조 편성 ›</a>
              ${x.my_role === "owner" || String(x.created_by) === String(G.me()?.id) ? `<button class="btn danger xs" data-delev="${x.id}" type="button">일정 삭제</button>` : ""}
            </div></div>`)).join("") : `<p class="muted mt0">이날 일정이 없습니다.</p>`}
      </div>
      <h2 id="eHead">${calEdit ? "개인 일정 수정" : "일정 추가"}</h2>
      <div class="card"><div class="form-grid">
          <label>대상<select id="eG" ${calEdit ? "disabled" : ""}><option value="">개인 일정 (나만 보임)</option>${groups.map((g) => `<option value="${g.id}">모임: ${esc(g.name)}</option>`).join("")}</select></label>
          <label>날짜<input id="eD" type="date" value="${esc(calEdit?.date || calSel)}"></label>
          <label>시간(선택)<input id="eT" type="time" value="${esc(calEdit?.time || "")}"></label>
          <label>제목<input id="eTitle" maxlength="60" value="${esc(calEdit?.title || "")}" placeholder="예: 레슨, 연습장, 지인 라운드"></label>
          <label>골프장·장소(선택)<input id="eC" maxlength="60" value="${esc(calEdit?.course || "")}"></label>
        </div>
        <div class="form-grid" style="margin-top:10px"><label>메모(선택)<textarea id="eM" rows="2" maxlength="500" placeholder="모이는 시간, 준비물 등">${esc(calEdit?.memo || "")}</textarea></label></div>
        ${calEdit ? "" : `<label style="display:block;margin-top:8px;font-size:14px"><input type="checkbox" id="eRound"> 골프 라운드예요 — <b>예정 라운드</b>로도 등록(홀별 공략 보기·전날 알림)</label>`}
        <div class="row" style="margin-top:10px"><button class="btn" id="eAdd" type="button">${calEdit ? "수정 저장" : "일정 추가"}</button>${calEdit ? `<button class="btn ghost" id="eCancel" type="button">취소</button>` : ""}</div>
        <p class="legend-note">개인 일정은 나만 보이고, 알림을 켜 두면 <b>전날 19시</b>에 알려 드립니다. 모임을 고르면 그 모임 회원 모두의 달력에 나오고 참석·조 편성을 할 수 있습니다.${groups.length ? "" : ` 모임은 <a href="#/groups">모임 메뉴</a>에서 만들거나 가입합니다.`}</p>
      </div>
      <p class="legend-note">「라운드 입력」에서 날짜를 미래로 넣어 스코어 없이 저장한 <b>예정 라운드</b>도 달력과 전날 알림(홀별 공략)에 나옵니다. 알림은 <a href="#/mypage/settings">마이페이지 → 설정</a>에서 켭니다.</p>`;
    const again = () => schedule(ctx);
    const $ = (id) => document.getElementById(id);
    $("cPrev").onclick = () => { calMonth = new Date(first.getFullYear(), first.getMonth() - 1, 1); again(); };
    $("cNext").onclick = () => { calMonth = new Date(first.getFullYear(), first.getMonth() + 1, 1); again(); };
    $("cToday").onclick = () => { calMonth = null; calSel = today; again(); };
    app.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { calFilter = b.dataset.f; again(); }));
    $("cMode").onclick = () => { calList = !calList; again(); };
    app.querySelectorAll("[data-day]").forEach((td) => (td.onclick = () => {
      calSel = td.dataset.day;
      const d = new Date(calSel + "T00:00:00");
      if (d.getMonth() !== first.getMonth()) calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      again();
    }));
    app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = run(ctx, () => G.api("POST", `/api/events/${b.dataset.go}/attend`, { going: b.dataset.v === "1" }), again)));
    app.querySelectorAll("[data-delev]").forEach((b) => (b.onclick = run(ctx, async () => { if (!confirm("이 일정을 지울까요?")) throw new Error("취소"); await G.api("DELETE", `/api/events/${b.dataset.delev}`); }, again)));
    if ($("eAdd")) $("eAdd").onclick = run(ctx, async () => {
      const body = { date: $("eD").value, time: $("eT").value, title: $("eTitle").value, course: $("eC").value, memo: $("eM").value };
      const gid = $("eG").value;
      if (calEdit) await G.api("PATCH", `/api/personal-events/${calEdit.id}`, body);
      else if (gid) await G.api("POST", `/api/groups/${gid}/events`, body);
      else await G.api("POST", "/api/personal-events", body);
      calSel = body.date;
      const toRound = !calEdit && $("eRound")?.checked;
      calEdit = null;
      ctx.toast("일정을 저장했습니다.");
      if (toRound) {
        // 예정 라운드: 날짜·시간·골프장·유형을 채운 라운드 입력 화면으로(스코어 없이 저장하면 예정 라운드)
        const g = groups.find((x) => String(x.id) === gid);
        try { localStorage.setItem("lounge.draft.v1:new", JSON.stringify({ date: body.date, time: body.time, course: body.course, front: "", back: "", tee: "White", region: "", memo: body.title, kind: g ? "group" : "personal", group: g ? g.name : "", groupId: g ? String(g.id) : "", holes: [] })); } catch { /* 무시 */ }
        location.hash = "#/register/input";
        throw new Error("취소");   // 화면을 다시 그리지 않고 입력 화면으로
      }
    }, again);
    if ($("eCancel")) $("eCancel").onclick = () => { calEdit = null; again(); };
    app.querySelectorAll("[data-edp]").forEach((b) => (b.onclick = () => {
      calEdit = personal.find((p) => String(p.id) === b.dataset.edp);
      again().then(() => document.getElementById("eHead")?.scrollIntoView({ behavior: "smooth" }));
    }));
    app.querySelectorAll("[data-delp]").forEach((b) => (b.onclick = run(ctx, async () => { if (!confirm("이 개인 일정을 지울까요?")) throw new Error("취소"); await G.api("DELETE", `/api/personal-events/${b.dataset.delp}`); }, again)));
  }

  // ───────── 모임 ─────────
  async function groups(ctx) {
    const { app, esc, G } = ctx;
    const { groups } = await G.api("GET", "/api/groups");
    app.innerHTML = `
      <h2 class="mt0">👥 내 모임</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">모임</th><th>회원</th><th>다가오는 일정</th><th>내 역할</th></tr></thead><tbody>
        ${groups.map((g) => `<tr data-gid="${g.id}" style="cursor:pointer"><td class="l"><b>${esc(g.name)}</b>${g.description ? `<br><span class="muted">${esc(g.description)}</span>` : ""}</td><td>${g.members}명</td><td>${g.upcoming}건</td><td>${g.role === "owner" ? "모임장" : "회원"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">아직 들어간 모임이 없습니다.</td></tr>`}
      </tbody></table></div>
      <div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:16px">
        <div class="card"><h3 class="mt0">모임 코드로 가입</h3><p class="muted">모임장에게 받은 코드를 넣으세요.</p>
          <div class="row"><input id="jCode" placeholder="모임 코드" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:8px"><button class="btn" id="bJoin" type="button">가입</button></div></div>
        <div class="card"><h3 class="mt0">새 모임 만들기</h3>
          <div class="form-grid"><label>모임 이름<input id="gName" maxlength="30" placeholder="예: 목요 라운드 모임"></label><label>소개(선택)<input id="gDesc" maxlength="300"></label>
            <label>공개 여부<select id="gVis"><option value="private">비공개 — 모임 코드로만 가입</option><option value="public">공개 — 「모임 찾기」에 보이고 가입 요청 가능</option></select></label></div>
          <div class="row" style="margin-top:10px"><button class="btn" id="bMake" type="button">만들기</button></div></div>
      </div>
      <h2>🔎 모임 찾기 <span class="muted">공개 모임</span></h2>
      <div class="card">
        <div class="row"><input id="sQ" placeholder="모임 이름·소개 검색" style="flex:1;padding:9px;border:1px solid var(--line);border-radius:8px"><button class="btn ghost" id="bSearch" type="button">검색</button></div>
        <div id="sList" style="margin-top:10px"></div>
      </div>
      <p class="legend-note">모임 회원끼리는 <b>모임 일정</b>(달력)과 참석 여부, 회원 닉네임이 보입니다. 라운드 기록·통계는 모임에 공유되지 않습니다(친구 순위는 「친구」에서 따로).</p>`;
    const $ = (id) => document.getElementById(id);
    app.querySelectorAll("[data-gid]").forEach((tr) => (tr.onclick = () => (location.hash = "#/group/" + tr.dataset.gid)));
    $("bJoin").onclick = run(ctx, async () => { const r = await G.api("POST", "/api/groups/join", { code: $("jCode").value }); ctx.toast(`「${r.name}」에 가입했습니다.`); location.hash = "#/group/" + r.id; });
    $("bMake").onclick = run(ctx, async () => { const r = await G.api("POST", "/api/groups", { name: $("gName").value, description: $("gDesc").value, visibility: $("gVis").value }); location.hash = "#/group/" + r.id; });
    const search = async () => {
      const { groups: list } = await G.api("GET", `/api/groups-search?q=${encodeURIComponent($("sQ").value.trim())}`);
      $("sList").innerHTML = list.map((g) => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
          <div><b>${esc(g.name)}</b> <span class="muted">${g.members}명 · 모임장 ${esc(g.owner)}</span>${g.description ? `<br><span class="muted">${esc(g.description)}</span>` : ""}</div>
          <div>${g.joined ? `<a class="btn ghost xs" href="#/group/${g.id}">들어가기</a>` : g.requested ? `<span class="muted">요청함</span> <button class="link" data-cancel="${g.id}" type="button">취소</button>` : `<button class="btn xs" data-req="${g.id}" type="button">가입 요청</button>`}</div></div>`).join("") || `<p class="muted mt0">공개 모임이 없습니다.</p>`;
      $("sList").querySelectorAll("[data-req]").forEach((b) => (b.onclick = run(ctx, async () => { await G.api("POST", `/api/groups/${b.dataset.req}/request`, { message: "" }); ctx.toast("가입 요청을 보냈습니다. 모임장이 승인하면 들어갑니다."); }, search)));
      $("sList").querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = run(ctx, () => G.api("DELETE", `/api/groups/${b.dataset.cancel}/request`), search)));
    };
    $("bSearch").onclick = () => search().catch((x) => ctx.toast(x.message));
    $("sQ").onkeydown = (e) => { if (e.key === "Enter") $("bSearch").click(); };
    search().catch(() => {});
  }

  let groupTab = "dash", groupYear = "";
  async function group(ctx) {
    const { app, esc, G, arg } = ctx;
    let d;
    if (group.last !== arg) { groupYear = ""; group.last = arg; }
    try { d = await G.api("GET", `/api/groups/${encodeURIComponent(arg)}`); } catch (x) { app.innerHTML = `<p>${esc(x.message)} <a href="#/groups">모임 목록 ›</a></p>`; return; }
    const owner = d.role === "owner", g = d.group;
    const me0 = await G.api("GET", "/api/me/summary").then((x) => x.user).catch(() => null);
    const O = await G.api("GET", `/api/groups/${g.id}/overview${groupYear ? "?year=" + groupYear : ""}`);
    groupYear = O.year;
    const TABS = [["dash", "📊 대시보드"], ["rounds", "📋 라운드 목록"], ["mystat", "📈 나의 통계"], ["rank", "🏆 순위·핸디"], ["settle", "💰 정산"], ["members", `👥 멤버 ${d.members.length}`], ["manage", owner ? `⚙️ 관리${d.requests.length ? ` (${d.requests.length})` : ""}` : "⚙️ 모임 정보"]];
    const yearSeg = `<div class="seg" style="margin-bottom:12px">${O.years.map((y) => `<button type="button" data-gy="${y}" class="${y === O.year ? "on" : ""}">${y}년</button>`).join("")}</div>`;
    const won = (n) => (n == null ? "-" : Number(n).toLocaleString("ko-KR") + "원");
    const stPill = (st) => `<span class="pill ${st === "완료" ? "" : "ok"}">${st}</span>`;
    const roundRow = (r) => `<tr class="click" onclick="location.hash='#/event/${r.id}'" style="cursor:pointer"><td class="l">${esc(r.date)}</td><td class="l"><b>${esc(r.title)}</b>${r.course ? `<br><span class="muted">${esc(r.course)}</span>` : ""}</td>
      <td>${r.going}명</td><td class="l">${r.winner ? `🏅 ${r.winner.who.map(esc).join(", ")} <span class="muted">${r.winner.value}</span>` : "-"}</td>
      <td>${r.my?.total != null ? `<b>${r.my.total}</b> <span class="muted">${r.my.rank}/${r.my.of}위</span>` : "-"}</td><td>${stPill(r.status)}</td></tr>`;
    if (!TABS.some((t) => t[0] === groupTab)) groupTab = "dash";
    const upcoming = d.recent.filter((e) => e.status !== "완료").sort((a, b) => (a.date < b.date ? -1 : 1));
    const past = d.recent.filter((e) => e.status === "완료");
    const evRow = (e) => `<tr class="click" onclick="location.hash='#/event/${e.id}'" style="cursor:pointer"><td class="l">${esc(e.date)}${e.time ? " " + esc(e.time) : ""}</td><td class="l"><b>${esc(e.title)}</b>${e.course ? `<br><span class="muted">${esc(e.course)}</span>` : ""}</td><td>${e.going}명</td><td><span class="pill ${e.status === "완료" ? "" : "ok"}">${e.status}</span></td></tr>`;
    const nowY = String(new Date().getFullYear());
    const recentMembers = [...d.members].sort((a, b) => (a.joined_at < b.joined_at ? 1 : -1)).slice(0, 5);
    const body = {
      dash: `<div class="card" style="margin-bottom:12px"><p class="mt0" style="margin:0">👑 모임장 <b>${esc(d.members.find((m) => m.role === "owner")?.nickname || "-")}</b> · 만든 날 ${esc(new Date(g.created_at).toLocaleDateString("ko-KR"))} · ${g.visibility === "public" ? "🌐 공개" : "🔒 비공개"}${g.description ? `<br><span class="muted">${esc(g.description)}</span>` : ""}</p></div>
        ${me0 && (!me0.gender || !me0.birth_year) ? profileNote : ""}
        <div class="demo-grid">
          <div class="card demo"><div class="dh"><span>전체 멤버</span><b>${d.members.length}</b></div><div class="dc"><canvas id="cdGender"></canvas></div></div>
          <div class="card demo"><div class="dh"><span>${O.year}년 라운드</span><b>${O.demo.courses.reduce((s, x) => s + x.n, 0)}</b></div><div class="dc"><canvas id="cdCourse"></canvas></div></div>
          <div class="card demo"><div class="dh"><span>${O.year}년 참석자</span><b>${O.demo.events.reduce((s, x) => s + x.M + x.F + x.U, 0)}</b><em>연인원</em></div><div class="dc"><canvas id="cdAttend"></canvas></div></div>
          <div class="card demo"><div class="dh"><span>나이대</span><b>${O.demo.ages.filter((a) => a.band !== "미입력").length}</b><em>개 연령대</em></div><div class="dc"><canvas id="cdAge"></canvas></div></div>
        </div>
        ${O.demo.missing ? `<p class="legend-note">성별·출생연도를 넣지 않은 멤버 ${O.demo.missing}명은 「미입력」으로 셉니다.</p>` : ""}
        <div class="stat-grid" style="margin-top:12px">
          <div class="kpi"><div class="lbl">올해 일정</div><div class="val">${d.stats.events_year}</div><div class="sub">건(예정 포함)</div></div>
          <div class="kpi"><div class="lbl">다가오는 일정</div><div class="val">${upcoming.length}</div><div class="sub">건</div></div>
        </div>
        <h3>최근·다가오는 라운드</h3>
        <div class="tbl-wrap"><table><thead><tr><th class="l">일자</th><th class="l">일정</th><th>참석</th><th>상태</th></tr></thead><tbody>${[...upcoming, ...past].map(evRow).join("") || `<tr><td colspan="4" class="muted">아직 일정이 없습니다.</td></tr>`}</tbody></table></div>
        ${O.board.some((x) => x.avg != null) && O.year === nowY ? `<h3>${O.year}년 상위 3명 <span class="muted">평균 타수</span></h3><div class="awards">${O.board.filter((x) => x.rank).slice(0, 3).map((x) => `<div class="award"><span>${["🥇", "🥈", "🥉"][x.rank - 1] || x.rank + "위"} ${x.rank}위</span><b>${esc(x.nickname)}</b><em>평균 ${x.avg} · ${x.played}회</em></div>`).join("")}</div>` : ""}
        <h3>최근 가입 멤버</h3>
        <div class="tbl-wrap"><table><tbody>${recentMembers.map((m) => `<tr><td class="l"><b>${esc(m.nickname)}</b></td><td>${m.role === "owner" ? "모임장" : "회원"}</td><td>${esc(new Date(m.joined_at).toLocaleDateString("ko-KR"))}</td></tr>`).join("")}</tbody></table></div>
        <p class="legend-note"><a href="#/schedule">일정 → 달력</a>에서 모임 일정을 추가하고 참석·불참을 표시합니다.</p>`,
      rounds: `${yearSeg}<div class="tbl-wrap"><table><thead><tr><th class="l">일자</th><th class="l">라운드</th><th>참석</th><th class="l">메달리스트</th><th>내 점수</th><th>상태</th></tr></thead><tbody>
          ${O.rounds.map(roundRow).join("") || `<tr><td colspan="6" class="muted">${O.year}년 일정이 없습니다.</td></tr>`}</tbody></table></div>
        <p class="legend-note">행을 누르면 참석·조 편성·점수표·정산이 있는 일정 상세로 갑니다.</p>`,
      mystat: `${yearSeg}${O.me ? `<div class="stat-grid">
          <div class="kpi"><div class="lbl">참석</div><div class="val">${O.me.attend}</div><div class="sub">회</div></div>
          <div class="kpi"><div class="lbl">평균 타수</div><div class="val">${O.me.avg ?? "-"}</div><div class="sub">점수 있는 ${O.me.played}회</div></div>
          <div class="kpi"><div class="lbl">베스트</div><div class="val">${O.me.best ?? "-"}</div><div class="sub">타</div></div>
          <div class="kpi"><div class="lbl">모임 순위</div><div class="val">${O.me.rank ?? "-"}</div><div class="sub">평균 기준</div></div>
          <div class="kpi"><div class="lbl">메달리스트</div><div class="val">${O.me.medal}</div><div class="sub">회</div></div>
          <div class="kpi"><div class="lbl">버디</div><div class="val">${O.me.birdie}</div><div class="sub">개</div></div>
        </div>
        <h3>회차별 내 성적</h3>
        <div class="tbl-wrap"><table><thead><tr><th class="l">일자</th><th>타수</th><th>순위</th></tr></thead><tbody>${O.me.history.map((h) => `<tr><td class="l">${esc(h.date)}</td><td><b>${h.total}</b></td><td>${h.rank ?? "-"} / ${h.of}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">점수가 있는 라운드가 없습니다.</td></tr>`}</tbody></table></div>`
        : `<p class="muted">${O.year}년에 참석한 지난 모임 라운드가 없습니다.</p>`}
        <p class="legend-note">이 모임 일정에 참석한 라운드만 셉니다(일정 날 내 라운드 기록·직접 입력 점수).</p>`,
      rank: `${yearSeg}<div class="tbl-wrap"><table><thead><tr><th>순위</th><th class="l">멤버</th><th>참석</th><th>평균</th><th>베스트</th><th>모임 핸디</th><th>🏅</th><th>🐦</th></tr></thead><tbody>
          ${O.board.map((x) => `<tr style="${x.mine ? "background:var(--sky)" : ""}"><td>${x.rank ? `<b>${x.rank}</b>` : "-"}</td><td class="l"><b>${esc(x.nickname)}</b>${x.mine ? " (나)" : ""}</td><td>${x.attend}</td><td>${x.avg ?? "-"}</td><td>${x.best ?? "-"}</td><td>${x.handicap != null ? (x.handicap > 0 ? "+" : "") + x.handicap : "-"}</td><td>${x.medal || ""}</td><td>${x.birdie || ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">${O.year}년 지난 모임 라운드가 없습니다.</td></tr>`}</tbody></table></div>
        <p class="legend-note">순위는 이 모임 라운드의 평균 타수 기준(점수 있는 회차만). <b>모임 핸디</b>는 평균 − 72로 낸 참고값으로, 모임 안에서 재미로 비교하는 용도입니다. 🏅 메달리스트 횟수 · 🐦 버디 수.</p>`,
      settle: `${yearSeg}<div class="tbl-wrap"><table><thead><tr><th class="l">일자</th><th class="l">라운드</th><th>총비용</th><th>1인당</th><th>입금</th><th>나</th></tr></thead><tbody>
          ${O.rounds.filter((r) => r.settle).map((r) => `<tr class="click" onclick="location.hash='#/event/${r.id}'" style="cursor:pointer"><td class="l">${esc(r.date)}</td><td class="l">${esc(r.title)}</td><td>${won(r.settle.total)}</td><td><b>${won(r.settle.perPerson)}</b></td><td>${r.settle.paid}/${r.settle.count}</td><td>${r.settle.myPaid ? `<span class="pill ok">입금</span>` : `<span class="pill ng">미입금</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">${O.year}년 정산한 일정이 없습니다.</td></tr>`}</tbody></table></div>
        <p class="legend-note">정산은 일정 상세 맨 아래에서 모임장·일정 만든 사람이 비용을 넣고 입금을 확인합니다. 「나」는 내 입금 여부입니다.</p>`,
      events: `<div class="tbl-wrap"><table><thead><tr><th class="l">일자</th><th class="l">일정</th><th>참석</th><th>상태</th></tr></thead><tbody>${upcoming.map(evRow).join("") || `<tr><td colspan="4" class="muted">다가오는 일정이 없습니다.</td></tr>`}</tbody></table></div>
        <h3>지난 일정</h3><div class="tbl-wrap"><table><tbody>${past.map(evRow).join("") || `<tr><td class="muted">없음</td></tr>`}</tbody></table></div>
        <div class="row" style="margin-top:12px"><a class="btn" href="#/schedule">달력에서 일정 추가</a></div>`,
      members: `<div class="tbl-wrap"><table><thead><tr><th class="l">닉네임</th><th>역할</th><th>가입일</th><th>참석</th><th>마지막 참석</th><th></th></tr></thead><tbody>${d.members.map((m) => { const om = O.members.find((x) => String(x.id) === String(m.id)) || {}; return `<tr><td class="l"><b>${esc(m.nickname)}</b></td><td>${m.role === "owner" ? "모임장" : "회원"}</td><td>${esc(new Date(m.joined_at).toLocaleDateString("ko-KR"))}</td><td>${om.attend ?? 0}회</td><td>${esc(om.last || "-")}</td>
          <td>${owner && m.role !== "owner" ? `<button class="btn ghost xs" data-kick="${m.id}" data-nick="${esc(m.nickname)}" type="button">내보내기</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`,
      manage: `<div class="card">
          <p class="mt0">${g.visibility === "public" ? "🌐 <b>공개 모임</b> — 「모임 찾기」에 보이고 가입 요청을 받습니다." : "🔒 <b>비공개 모임</b> — 모임 코드로만 가입합니다."}</p>
          <p>모임 코드 <span class="code-chip">${esc(g.join_code)}</span> <button class="btn ghost xs" id="bCopyCode" type="button">초대 문구 복사</button>
          ${owner ? `<button class="link" id="bNewCode" type="button">코드 바꾸기</button>` : ""}</p>
          <p class="legend-note">사이트 회원이 이 코드를 「모임 → 모임 코드로 가입」에 넣으면 바로 들어옵니다. 사이트 가입은 관리자의 초대 코드가 필요합니다.</p></div>
        ${owner ? `<h3>가입 요청 <span class="muted">${d.requests.length}건</span></h3>
          <div class="tbl-wrap"><table><tbody>${d.requests.map((r) => `<tr><td class="l"><b>${esc(r.nickname)}</b>${r.message ? `<br><span class="muted">${esc(r.message)}</span>` : ""}</td><td><button class="btn xs" data-ok="${r.id}" type="button">승인</button> <button class="btn ghost xs" data-no="${r.id}" type="button">거절</button></td></tr>`).join("") || `<tr><td class="muted">대기 중인 요청이 없습니다.</td></tr>`}</tbody></table></div>
          <h3>모임 정보 바꾸기</h3><div class="card"><div class="form-grid"><label>이름<input id="gN" maxlength="30" value="${esc(g.name)}"></label><label>소개<input id="gD" maxlength="300" value="${esc(g.description || "")}"></label>
            <label>공개 여부<select id="gV"><option value="private" ${g.visibility !== "public" ? "selected" : ""}>비공개</option><option value="public" ${g.visibility === "public" ? "selected" : ""}>공개</option></select></label></div>
          <div class="row" style="margin-top:10px"><button class="btn" id="bSaveG" type="button">저장</button><button class="btn danger" id="bDelG" type="button">모임 삭제</button></div></div>`
        : `<div class="row" style="margin-top:12px"><button class="btn danger" id="bLeave" type="button">모임 나가기</button></div>`}`,
    };
    app.innerHTML = `
      <p><a href="#/groups">‹ 내 모임</a></p>
      <div class="home-hello"><div><h2>${esc(g.name)}</h2>${g.description ? `<p class="muted" style="margin:4px 0 0">${esc(g.description)}</p>` : ""}</div>
        <span class="muted">${owner ? "모임장" : "회원"} · ${g.visibility === "public" ? "공개" : "비공개"}</span></div>
      <div class="subtabs" style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px">${TABS.map(([k, t]) => `<a href="javascript:void 0" data-gtab="${k}" class="${k === groupTab ? "active" : ""}" style="padding:7px 14px;border-radius:999px;background:${k === groupTab ? "#3654b8" : "#eef2fb"};color:${k === groupTab ? "#fff" : "#3a4660"};font-weight:700;font-size:14px;text-decoration:none">${t}</a>`).join("")}</div>
      ${body[groupTab]}`;
    const $ = (id) => document.getElementById(id);
    const again = () => group(ctx);
    app.querySelectorAll("[data-gtab]").forEach((a) => (a.onclick = () => { groupTab = a.dataset.gtab; again(); }));
    app.querySelectorAll("[data-gy]").forEach((b) => (b.onclick = () => { groupYear = b.dataset.gy; again(); }));
    if (groupTab === "dash") drawDemo(O.demo);
    if ($("bCopyCode")) $("bCopyCode").onclick = async () => { await navigator.clipboard.writeText(`[${g.name}] 모임 코드: ${g.join_code}\n${location.origin}/ 에 로그인 → 모임 → 모임 코드로 가입`); ctx.toast("초대 문구를 복사했습니다."); };
    if ($("bNewCode")) $("bNewCode").onclick = run(ctx, async () => { if (!confirm("코드를 바꾸면 예전 코드로는 가입할 수 없습니다.")) throw new Error("취소"); await G.api("POST", `/api/groups/${g.id}/code`); }, again);
    app.querySelectorAll("[data-kick]").forEach((b) => (b.onclick = run(ctx, async () => { if (!confirm(`${b.dataset.nick}님을 모임에서 내보낼까요?`)) throw new Error("취소"); await G.api("DELETE", `/api/groups/${g.id}/members/${b.dataset.kick}`); }, again)));
    app.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = run(ctx, () => G.api("POST", `/api/groups/${g.id}/requests/${b.dataset.ok}`, { approve: true }), again)));
    app.querySelectorAll("[data-no]").forEach((b) => (b.onclick = run(ctx, () => G.api("POST", `/api/groups/${g.id}/requests/${b.dataset.no}`, { approve: false }), again)));
    if ($("bSaveG")) $("bSaveG").onclick = run(ctx, async () => { await G.api("PATCH", `/api/groups/${g.id}`, { name: $("gN").value, description: $("gD").value, visibility: $("gV").value }); ctx.toast("저장했습니다."); }, again);
    if ($("bDelG")) $("bDelG").onclick = run(ctx, async () => {
      if (prompt(`모임과 모임 일정을 모두 지웁니다. 지우려면 모임 이름(${g.name})을 입력하세요.`) !== g.name) throw new Error("취소");
      await G.api("DELETE", `/api/groups/${g.id}`); location.hash = "#/groups";
    });
    if ($("bLeave")) $("bLeave").onclick = run(ctx, async () => { if (!confirm("모임에서 나갈까요?")) throw new Error("취소"); await G.api("POST", `/api/groups/${g.id}/leave`); location.hash = "#/groups"; });
  }

  // 모임 대시보드 차트: 멤버 성별(도넛), 골프장별 라운드, 라운드별 참석자 성별, 나이대×성별(가로 막대). 합계만 보여 준다
  let demoCharts = [];
  function drawDemo(D) {
    demoCharts.forEach((c) => c.destroy()); demoCharts = [];
    if (typeof Chart === "undefined") return;
    const C = { M: "#6c8cff", F: "#ff8fab", U: "#c9d1e3" };
    const opts = (stacked) => ({ indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: stacked, position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { x: { stacked, beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } }, y: { stacked, ticks: { font: { size: 11 } } } } });
    const mk = (id, cfg) => { const el = document.getElementById(id); if (el) demoCharts.push(new Chart(el, cfg)); };
    const gs = [["남", D.gender.M, C.M], ["여", D.gender.F, C.F], ["미입력", D.gender.U, C.U]].filter((x) => x[1] > 0);
    mk("cdGender", { type: "doughnut", data: { labels: gs.map((x) => `${x[0]} ${x[1]}`), datasets: [{ data: gs.map((x) => x[1]), backgroundColor: gs.map((x) => x[2]), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } } } });
    mk("cdCourse", { type: "bar", data: { labels: D.courses.map((x) => x.course), datasets: [{ label: "라운드", data: D.courses.map((x) => x.n), backgroundColor: "#7fd1ae", borderRadius: 4 }] }, options: opts(false) });
    const gsets = (rows) => [["남", "M"], ["여", "F"], ["미입력", "U"]].filter(([, k]) => rows.some((r) => r[k])).map(([l, k]) => ({ label: l, data: rows.map((r) => r[k]), backgroundColor: C[k], borderRadius: 3 }));
    mk("cdAttend", { type: "bar", data: { labels: D.events.map((x) => x.label), datasets: gsets(D.events) }, options: opts(true) });
    mk("cdAge", { type: "bar", data: { labels: D.ages.map((x) => x.band), datasets: gsets(D.ages) }, options: opts(true) });
    for (const [id, n] of [["cdCourse", D.courses.length], ["cdAttend", D.events.length], ["cdAge", D.ages.length]]) if (!n) { const el = document.getElementById(id); if (el) el.parentElement.innerHTML = `<p class="muted" style="margin:30px 0;text-align:center">아직 자료가 없습니다</p>`; }
  }

  // ───────── 일정 상세 · 조 편성 ─────────
  async function event(ctx) {
    const { app, esc, G, arg } = ctx;
    let d;
    try { d = await G.api("GET", `/api/events/${encodeURIComponent(arg)}`); } catch (x) { app.innerHTML = `<p>${esc(x.message)} <a href="#/schedule">일정으로</a></p>`; return; }
    const e = d.event, me = String(d.me), F = e.flights;
    const going = d.attendees.filter((a) => a.going), notGoing = d.attendees.filter((a) => !a.going);
    const myGo = d.attendees.find((a) => String(a.id) === me)?.going;
    const who = (m) => (m.id ? esc(m.nickname) : `${esc(m.guest)} <span class="muted">(게스트)</span>`);
    const flightCards = F?.flights?.length ? `<div class="flights">${F.flights.map((f) => `<div class="flight ${f.members.some((m) => String(m.id) === me) ? "mine" : ""}">
        <div class="fh"><b>${f.no}조</b>${f.tee ? ` <span>⏰ ${esc(f.tee)}</span>` : ""}${f.members.some((m) => String(m.id) === me) ? ` <span class="pill ok">내 조</span>` : ""}</div>
        <ul>${f.members.map((m) => `<li>${who(m)}</li>`).join("")}</ul></div>`).join("")}</div>
        <p class="legend-note">${F.mode === "balanced" ? "실력 고르게(최근 5라운드 평균 기준)" : "무작위"}로 편성 · ${F.flights.reduce((s, f) => s + f.members.length, 0)}명 · ${F.flights.length}개 조</p>
        <div class="row"><button class="btn ghost" id="fCopy" type="button">📋 조 편성 복사(메신저용)</button></div>`
      : `<p class="muted mt0">아직 조 편성이 없습니다.${d.canEdit ? " 아래에서 자동 편성을 해 보세요." : " 모임장이 편성하면 여기에 나옵니다."}</p>`;
    app.innerHTML = `
      <p><a href="#/schedule">‹ 일정</a> · <a href="#/group/${e.group_id}">${esc(e.group_name)}</a></p>
      <div class="home-hello"><div><h2>${esc(e.title)}</h2><p class="muted" style="margin:4px 0 0">${dayTxt(e.date)}${e.time ? " · " + esc(e.time) : ""}${e.course ? " · ⛳ " + esc(e.course) : ""}</p></div></div>
      ${e.memo ? `<div class="card" style="white-space:pre-wrap">${esc(e.memo)}</div>` : ""}
      <h2>참석 <span class="muted">${going.length}명${notGoing.length ? ` · 불참 ${notGoing.length}명` : ""}</span></h2>
      <div class="card">
        <p class="mt0">${going.map((a) => `<span class="chip-n">${esc(a.nickname)}</span>`).join(" ") || `<span class="muted">아직 없음</span>`}</p>
        ${notGoing.length ? `<p class="muted">불참: ${notGoing.map((a) => esc(a.nickname)).join(", ")}</p>` : ""}
        <div class="row"><button class="btn ${myGo === true ? "" : "ghost"}" id="goY" type="button">참석</button><button class="btn ${myGo === false ? "" : "ghost"}" id="goN" type="button">불참</button></div>
      </div>
      <h2>조 편성 ${F?.flights?.length && e.flights_at ? `<span class="muted">${esc(new Date(e.flights_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))} 편성</span>` : ""}</h2>
      <div class="card">${flightCards}</div>
      ${d.canEdit ? `
      <h2>편성하기 <span class="muted">모임장·일정 만든 사람</span></h2>
      <div class="card">
        <div class="form-grid">
          <label>조 인원<select id="fSize">${[2, 3, 4, 5].map((n) => `<option ${n === (F?.size || 4) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label>첫 티오프<input id="fStart" type="time" value="${esc(F?.start || e.time || "")}"></label>
          <label>조 간격(분)<input id="fInt" type="number" min="0" max="30" value="${F?.interval ?? 7}"></label>
          <label>방식<select id="fMode"><option value="random" ${F?.mode !== "balanced" ? "selected" : ""}>무작위</option><option value="balanced" ${F?.mode === "balanced" ? "selected" : ""}>실력 고르게(최근 평균)</option></select></label>
        </div>
        <div class="form-grid" style="margin-top:10px"><label>게스트(회원 아닌 동반자, 쉼표로)<input id="fGuests" value="${esc((F?.guests || []).join(", "))}" placeholder="예: 김프로, 이친구"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="fAuto" type="button">${F?.flights?.length ? "다시 자동 편성" : "자동 편성"}</button>${F?.flights?.length ? `<button class="btn danger" id="fClear" type="button">편성 지우기</button>` : ""}</div>
        <p class="legend-note">참석으로 표시한 회원 ${going.length}명 + 게스트로 편성합니다. 「실력 고르게」는 각자의 최근 5라운드 평균으로 조마다 비슷하게 나누며, 숫자는 누구에게도 보이지 않습니다.</p>
        ${F?.flights?.length ? `<h3>손으로 고치기</h3>
          <div class="tbl-wrap"><table><thead><tr><th class="l">이름</th><th>조</th></tr></thead><tbody>
            ${F.flights.flatMap((f) => f.members.map((m) => ({ m, no: f.no }))).map(({ m, no }, i) => `<tr><td class="l">${who(m)}</td><td><select data-mv="${i}">${F.flights.map((f) => `<option value="${f.no}" ${f.no === no ? "selected" : ""}>${f.no}조</option>`).join("")}<option value="${F.flights.length + 1}">새 조</option><option value="0">빼기</option></select></td></tr>`).join("")}
          </tbody></table></div>
          <div class="form-grid" style="margin-top:10px">${F.flights.map((f) => `<label>${f.no}조 티오프<input type="time" data-tee="${f.no}" value="${esc(f.tee || "")}"></label>`).join("")}</div>
          <div class="row" style="margin-top:10px"><button class="btn" id="fSave" type="button">고친 편성 저장</button></div>` : ""}
      </div>` : ""}
      <h2 id="scoreHead">점수 모아보기</h2>
      <div id="scoreBox"><div class="card"><p class="muted mt0">불러오는 중…</p></div></div>
      <h2 id="settleHead">💰 정산</h2>
      <div class="card" id="settleBox">${settleHtml(ctx, d, going)}</div>`;
    const $ = (id) => document.getElementById(id);
    const again = () => event(ctx);
    bindSettle(ctx, d, going, again);
    renderScores(ctx, e, myGo).catch((x) => ($("scoreBox").innerHTML = `<div class="card"><p class="muted mt0">점수를 불러오지 못했습니다: ${esc(x.message)}</p></div>`));
    $("goY").onclick = run(ctx, () => G.api("POST", `/api/events/${e.id}/attend`, { going: true }), again);
    $("goN").onclick = run(ctx, () => G.api("POST", `/api/events/${e.id}/attend`, { going: false }), again);
    if ($("fCopy")) $("fCopy").onclick = async () => {
      const txt = `⛳ ${e.title}\n${dayTxt(e.date)}${e.course ? " · " + e.course : ""}\n\n` + F.flights.map((f) => `${f.no}조${f.tee ? " " + f.tee : ""}: ${f.members.map((m) => (m.id ? m.nickname : m.guest)).join(", ")}`).join("\n");
      try { await navigator.clipboard.writeText(txt); ctx.toast("조 편성을 복사했습니다. 메신저에 붙여 넣으세요."); } catch { prompt("아래 글을 복사하세요", txt); }
    };
    if ($("fAuto")) $("fAuto").onclick = run(ctx, async () => {
      if (F?.flights?.length && !confirm("지금 편성을 지우고 다시 자동 편성할까요?")) throw new Error("취소");
      await G.api("POST", `/api/events/${e.id}/flights/auto`, { size: Number($("fSize").value), start: $("fStart").value, interval: Number($("fInt").value), mode: $("fMode").value, guests: $("fGuests").value.split(",").map((x) => x.trim()).filter(Boolean) });
      ctx.toast("편성했습니다.");
    }, again);
    if ($("fClear")) $("fClear").onclick = run(ctx, async () => { if (!confirm("조 편성을 지울까요?")) throw new Error("취소"); await G.api("PUT", `/api/events/${e.id}/flights`, { flights: null }); }, again);
    if ($("fSave")) $("fSave").onclick = run(ctx, async () => {
      const all = F.flights.flatMap((f) => f.members.map((m) => ({ m, no: f.no })));
      const tees = Object.fromEntries([...app.querySelectorAll("[data-tee]")].map((i) => [i.dataset.tee, i.value]));
      app.querySelectorAll("[data-mv]").forEach((sel) => (all[Number(sel.dataset.mv)].no = Number(sel.value)));
      const max = Math.max(0, ...all.map((x) => x.no));
      const flights = Array.from({ length: max }, (_, i) => ({ tee: tees[i + 1] || "", members: all.filter((x) => x.no === i + 1).map((x) => (x.m.id ? { id: x.m.id } : { guest: x.m.guest })) }));
      await G.api("PUT", `/api/events/${e.id}/flights`, { flights });
      ctx.toast("저장했습니다.");
    }, again);
  }

  // 정산: 비용 항목 합계 ÷ 인원(100원 올림), 입금 확인. 편집은 모임장·일정 만든 사람
  const SETTLE_ITEMS = ["그린피", "카트비", "캐디피", "식사·기타"];
  function settlePeople(d, going) {
    const ps = going.map((a) => ({ key: String(a.id), name: a.nickname }));
    for (const f of d.event.flights?.flights || []) for (const m of f.members) if (m.guest) ps.push({ key: "g:" + m.guest, name: m.guest + " (게스트)" });
    return ps;
  }
  function settleHtml(ctx, d, going) {
    const { esc } = ctx;
    const st = d.event.settle, me = String(d.me);
    const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
    const ps = settlePeople(d, going);
    const view = st ? `<div class="stat-grid">
        <div class="kpi"><div class="lbl">총비용</div><div class="val" style="font-size:22px">${won(st.total)}</div><div class="sub">${st.items.map((x) => `${esc(x.label)} ${won(x.amount)}`).join(" · ")}</div></div>
        <div class="kpi"><div class="lbl">1인당</div><div class="val" style="font-size:22px">${won(st.perPerson)}</div><div class="sub">${st.count}명 기준</div></div>
        <div class="kpi"><div class="lbl">입금</div><div class="val" style="font-size:22px">${st.paid.length} / ${st.count}</div><div class="sub">${st.paid.includes(me) ? "✅ 나는 입금 완료" : going.some((a) => String(a.id) === me) ? "⏳ 나는 아직" : ""}</div></div>
      </div>${st.note ? `<p class="muted" style="margin-top:8px">${esc(st.note)}</p>` : ""}` : `<p class="muted mt0">아직 정산이 없습니다.${d.canEdit ? "" : " 모임장이 비용을 넣으면 여기에 1인당 금액이 나옵니다."}</p>`;
    if (!d.canEdit) return view;
    const items = st?.items?.length ? st.items : SETTLE_ITEMS.map((label) => ({ label, amount: "" }));
    return view + `<h3>${st ? "정산 고치기" : "정산하기"} <span class="muted">모임장·일정 만든 사람</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th class="l">항목</th><th>금액(원)</th></tr></thead><tbody id="stItems">
        ${items.map((x) => `<tr><td class="l"><input data-sl value="${esc(x.label)}" style="width:140px"></td><td><input data-sa type="number" min="0" step="1000" value="${x.amount}" style="width:120px"></td></tr>`).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:6px"><button class="link" id="stAddItem" type="button">+ 항목 추가</button></div>
      <div class="form-grid" style="margin-top:10px">
        <label>나눌 인원<input id="stCount" type="number" min="1" value="${st?.count || ps.length || 1}"></label>
        <label>1인당(비우면 자동, 100원 올림)<input id="stPer" type="number" min="0" step="100" value="${st && st.perPerson !== Math.ceil(st.total / st.count / 100) * 100 ? st.perPerson : ""}" placeholder="자동"></label>
        <label>메모(계좌·마감 등)<input id="stNote" maxlength="200" value="${esc(st?.note || "")}"></label>
      </div>
      <h3>입금 확인</h3>
      <div class="paid-list">${ps.map((p) => `<label><input type="checkbox" data-paid="${esc(p.key)}" ${st?.paid?.includes(p.key) ? "checked" : ""}> ${esc(p.name)}</label>`).join("") || `<span class="muted">참석자가 없습니다.</span>`}</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="stSave" type="button">정산 저장</button>${st ? `<button class="btn ghost" id="stCopy" type="button">📋 정산 안내 복사</button><button class="btn danger" id="stClear" type="button">정산 지우기</button>` : ""}</div>`;
  }
  function bindSettle(ctx, d, going, again) {
    const { G } = ctx, $ = (id) => document.getElementById(id);
    if (!d.canEdit) return;
    $("stAddItem").onclick = () => $("stItems").insertAdjacentHTML("beforeend", `<tr><td class="l"><input data-sl placeholder="항목" style="width:140px"></td><td><input data-sa type="number" min="0" step="1000" style="width:120px"></td></tr>`);
    $("stSave").onclick = run(ctx, async () => {
      const ls = [...document.querySelectorAll("[data-sl]")], as = [...document.querySelectorAll("[data-sa]")];
      const items = ls.map((l, i) => ({ label: l.value.trim(), amount: Number(as[i].value) || 0 })).filter((x) => x.amount > 0);
      if (!items.length) throw new Error("금액을 하나 이상 넣어 주세요.");
      const paid = [...document.querySelectorAll("[data-paid]")].filter((c) => c.checked).map((c) => c.dataset.paid);
      await G.api("PUT", `/api/events/${d.event.id}/settle`, { items, count: Number($("stCount").value), perPerson: $("stPer").value ? Number($("stPer").value) : null, paid, note: $("stNote").value });
      ctx.toast("정산을 저장했습니다.");
    }, again);
    if ($("stClear")) $("stClear").onclick = run(ctx, async () => { if (!confirm("정산을 지울까요?")) throw new Error("취소"); await G.api("PUT", `/api/events/${d.event.id}/settle`, { settle: null }); }, again);
    if ($("stCopy")) $("stCopy").onclick = async () => {
      const st = d.event.settle, ps = settlePeople(d, going);
      const unpaid = ps.filter((p) => !st.paid.includes(p.key)).map((p) => p.name.replace(" (게스트)", ""));
      const txt = `💰 ${d.event.title} 정산 (${d.event.date})\n${st.items.map((x) => `${x.label} ${x.amount.toLocaleString("ko-KR")}원`).join(" / ")}\n총 ${st.total.toLocaleString("ko-KR")}원 ÷ ${st.count}명 = 1인당 ${st.perPerson.toLocaleString("ko-KR")}원${st.note ? "\n" + st.note : ""}${unpaid.length ? `\n미입금: ${unpaid.join(", ")}` : "\n모두 입금 완료 👍"}`;
      try { await navigator.clipboard.writeText(txt); ctx.toast("정산 안내를 복사했습니다."); } catch { prompt("아래 글을 복사하세요", txt); }
    };
  }

  // 점수 모아보기: 그날 각자 입력한 라운드 + 직접 입력 점수 → 점수표·시상
  async function renderScores(ctx, e, myGo) {
    const { esc, G } = ctx;
    const d = await G.api("GET", `/api/events/${e.id}/scores`);
    const box = document.getElementById("scoreBox");
    if (!box) return;
    const nm = (x) => (x.id ? esc(x.nickname) : `${esc(x.guest)} <span class="muted">(게스트)</span>`);
    const v = (x) => (x == null ? "-" : x);
    const future = e.date > ymd(new Date());
    const me = d.list.find((x) => x.mine);
    const A = d.awards;
    const award = (ico, label, a, unit) => (a ? `<div class="award"><span>${ico} ${label}</span><b>${a.who.map(esc).join(", ")}</b><em>${a.value}${unit}</em></div>` : "");
    const has = d.list.some((x) => x.total != null || x.src);
    box.innerHTML = `
      ${future ? `<div class="notice">라운드 날(${dayTxt(e.date)})이 지나면 각자 입력한 점수가 여기에 모입니다.</div>` : ""}
      ${has ? `<div class="awards">${award("🏅", "메달리스트", A.medalist, "타")}${award("🐦", "다버디", A.birdie, "개")}${award("🎯", "다파", A.par, "개")}${award("⛳", "전반 베스트", A.front, "타")}${award("🏁", "후반 베스트", A.back, "타")}</div>` : ""}
      <div class="tbl-wrap"><table><thead><tr><th>순위</th><th class="l">이름</th><th>조</th><th>전반</th><th>후반</th><th>총타</th><th>오버</th><th>버디</th><th>파</th><th>퍼트</th><th class="l">출처</th></tr></thead><tbody>
        ${d.list.map((x) => `<tr style="${x.mine ? "background:var(--sky)" : ""}"><td>${x.rank ? `<b>${x.rank}</b>` : "-"}</td><td class="l">${nm(x)}</td><td>${x.flight ? x.flight + "조" : "-"}</td>
          <td>${v(x.front)}</td><td>${v(x.back)}</td><td>${x.total != null ? `<b>${x.total}</b>` : x.holes && x.holes < 18 ? `<span class="muted">${x.holes}홀</span>` : "-"}</td>
          <td>${x.over != null ? (x.over > 0 ? "+" + x.over : x.over) : x.total != null ? "" : "-"}</td><td>${v(x.birdie)}</td><td>${v(x.par)}</td><td>${v(x.putts)}</td>
          <td class="l">${x.src === "round" ? (x.mine ? `<a href="#/round/${encodeURIComponent(x.roundId)}">내 기록</a>` : "기록") : x.src === "manual" ? `<span class="muted">직접 입력</span>` : `<span class="muted">없음</span>`}</td></tr>`).join("") || `<tr><td colspan="11" class="muted">참석자가 없습니다.</td></tr>`}
      </tbody></table></div>
      <p class="legend-note">각자 이날 입력한 라운드에서 점수를 가져옵니다(유형을 「개인 라운드」로 저장한 기록은 모임에 보이지 않음). 순위는 18홀 총타, 같으면 후반·전반 순. 버디·파·퍼트는 홀별 기록이 있을 때만.</p>
      <div class="row">
        ${myGo && (!me || me.src !== "round") ? `<button class="btn" id="sMine" type="button">✏️ 내 라운드 입력하기</button>` : ""}
        ${has ? `<button class="btn ghost" id="sCopy" type="button">📋 점수표 복사(메신저용)</button>` : ""}
      </div>
      ${d.canEdit ? `<h3>점수 직접 입력 <span class="muted">기록을 안 남긴 회원·게스트</span></h3>
        <div class="tbl-wrap"><table><thead><tr><th class="l">이름</th><th>전반</th><th>후반</th><th>총타</th></tr></thead><tbody>
          ${d.list.filter((x) => x.src !== "round").map((x, i) => `<tr><td class="l">${nm(x)}</td>
            ${["front", "back", "total"].map((k) => `<td><input type="number" data-si="${i}" data-sk="${k}" value="${x.src === "manual" && x[k] != null ? x[k] : ""}" style="width:64px"></td>`).join("")}</tr>`).join("")}
          <tr><td class="l"><input id="sGuest" placeholder="게스트 이름 추가" style="width:130px"></td>${["front", "back", "total"].map((k) => `<td><input type="number" data-sg="${k}" style="width:64px"></td>`).join("")}</tr>
        </tbody></table></div>
        <div class="row" style="margin-top:8px"><button class="btn" id="sSave" type="button">직접 입력 점수 저장</button></div>
        <p class="legend-note">전반·후반을 넣으면 총타는 자동으로 더합니다. 회원이 나중에 자기 라운드를 입력하면 그 기록이 우선입니다.</p>` : ""}`;
    const $ = (id) => document.getElementById(id);
    // 내 라운드 입력: 날짜·골프장·유형(이 모임)을 채운 입력 화면으로
    if ($("sMine")) $("sMine").onclick = () => {
      try { localStorage.setItem("lounge.draft.v1:new", JSON.stringify({ date: e.date, time: e.time || "", course: e.course || "", front: "", back: "", tee: "White", region: "", memo: e.title, kind: "group", group: e.group_name, groupId: String(e.group_id), holes: [] })); } catch { /* 무시 */ }
      location.hash = "#/register/input";
    };
    if ($("sCopy")) $("sCopy").onclick = async () => {
      const lines = d.list.filter((x) => x.total != null).map((x) => `${x.rank}. ${x.nickname || x.guest} ${x.total}${x.front != null && x.back != null ? ` (${x.front}/${x.back})` : ""}`);
      const aw = [["🏅 메달리스트", A.medalist, "타"], ["🐦 다버디", A.birdie, "개"], ["🎯 다파", A.par, "개"]].filter(([, a]) => a).map(([l, a, un]) => `${l}: ${a.who.join(", ")} ${a.value}${un}`);
      const txt = `⛳ ${e.title} 결과\n${dayTxt(e.date)}${e.course ? " · " + e.course : ""}\n\n${lines.join("\n")}${aw.length ? "\n\n" + aw.join("\n") : ""}`;
      try { await navigator.clipboard.writeText(txt); ctx.toast("점수표를 복사했습니다."); } catch { prompt("아래 글을 복사하세요", txt); }
    };
    if ($("sSave")) $("sSave").onclick = run(ctx, async () => {
      const rows = d.list.filter((x) => x.src !== "round");
      const val = (sel) => { const el = document.querySelector(sel); return el && el.value !== "" ? Number(el.value) : null; };
      const entries = rows.map((x, i) => ({ ...(x.id ? { id: x.id } : { guest: x.guest }), front: val(`[data-si="${i}"][data-sk="front"]`), back: val(`[data-si="${i}"][data-sk="back"]`), total: val(`[data-si="${i}"][data-sk="total"]`) }));
      const gName = $("sGuest").value.trim();
      if (gName) entries.push({ guest: gName, front: val('[data-sg="front"]'), back: val('[data-sg="back"]'), total: val('[data-sg="total"]') });
      const r = await G.api("PUT", `/api/events/${e.id}/scores`, { entries });
      ctx.toast(`${r.saved}명 점수를 저장했습니다.`);
    }, () => renderScores(ctx, e, myGo));
  }

  // ───────── 친구 ─────────
  async function friends(ctx) {
    const { app, esc, G } = ctx;
    const [{ friends }, { members }] = await Promise.all([G.api("GET", "/api/social/friends"), G.api("GET", "/api/social/members")]);
    const by = (st, out) => friends.filter((f) => f.status === st && (out === undefined || f.outgoing === out));
    const known = new Set(friends.map((f) => String(f.id)));
    const others = members.filter((m) => !known.has(String(m.id)));
    const row = (f, btns) => `<tr><td class="l"><b>${esc(f.nickname)}</b></td><td>${btns}</td></tr>`;
    app.innerHTML = `
      ${by("pending", false).length ? `<h2 class="mt0">받은 신청</h2><div class="tbl-wrap"><table><tbody>${by("pending", false).map((f) => row(f, `<button class="btn xs" data-add="${f.id}" type="button">수락</button> <button class="btn ghost xs" data-del="${f.id}" type="button">거절</button>`)).join("")}</tbody></table></div>` : ""}
      <h2 class="mt0">친구 <span class="muted">${by("accepted").length}명</span></h2>
      <div class="tbl-wrap"><table><tbody>${by("accepted").map((f) => row(f, `<button class="btn ghost xs" data-del="${f.id}" data-ask="1" type="button">친구 끊기</button>`)).join("") || `<tr><td class="muted">아직 없음</td></tr>`}</tbody></table></div>
      ${by("pending", true).length ? `<h2>보낸 신청</h2><div class="tbl-wrap"><table><tbody>${by("pending", true).map((f) => row(f, `<span class="muted">수락 대기</span> <button class="btn ghost xs" data-del="${f.id}" type="button">취소</button>`)).join("")}</tbody></table></div>` : ""}
      <h2>다른 회원</h2>
      <div class="tbl-wrap"><table><tbody>${others.map((m) => row(m, `<button class="btn xs" data-add="${m.id}" type="button">친구 신청</button>`)).join("") || `<tr><td class="muted">다른 회원이 없습니다.</td></tr>`}</tbody></table></div>
      <p class="legend-note">친구가 되면 <a href="#/analysis/ranking">통계 → 친구 순위</a>에 서로의 요약 숫자가 보이고, 내 기록의 동반자를 친구와 연결할 수 있습니다. 끊으면 동반자 연결도 풀립니다.</p>`;
    app.querySelectorAll("[data-add]").forEach((b) => (b.onclick = run(ctx, () => G.api("POST", `/api/social/friends/${b.dataset.add}`), () => friends(ctx))));
    app.querySelectorAll("[data-del]").forEach((b) => (b.onclick = run(ctx, async () => {
      if (b.dataset.ask && !confirm("친구를 끊을까요? 서로 연결해 둔 동반자 연결도 풀립니다.")) throw new Error("취소");
      await G.api("DELETE", `/api/social/friends/${b.dataset.del}`);
    }, () => friends(ctx))));
  }

  async function links(ctx) {
    const { app, esc, G } = ctx;
    const [{ names }, { friends }] = await Promise.all([G.api("GET", "/api/social/links"), G.api("GET", "/api/social/friends")]);
    const fr = friends.filter((f) => f.status === "accepted");
    app.innerHTML = `<p class="mt0">내 라운드 기록에 적은 동반자 이름을 친구 회원과 연결하면, 그 친구가 <b>함께한 라운드</b>에서 해당 라운드(코스·Par·자기 타수)를 자기 기록으로 가져갈 수 있습니다.</p>
      ${fr.length ? "" : `<div class="notice">먼저 <a href="#/friends/list">친구</a>를 맺어야 연결할 수 있습니다.</div>`}
      <div class="tbl-wrap"><table><thead><tr><th class="l">내 기록 속 동반자</th><th>함께한 라운드</th><th class="l">연결할 친구</th></tr></thead><tbody>
      ${names.map((n, i) => `<tr><td class="l"><b>${esc(n.name)}</b></td><td>${n.rounds}</td><td class="l"><select data-link="${i}" ${fr.length ? "" : "disabled"}><option value="">연결 안 함</option>${fr.map((f) => `<option value="${f.id}" ${n.friend && String(n.friend.id) === String(f.id) ? "selected" : ""}>${esc(f.nickname)}</option>`).join("")}</select></td></tr>`).join("") || `<tr><td colspan="3" class="muted">기록에 동반자가 없습니다.</td></tr>`}
      </tbody></table></div>`;
    app.querySelectorAll("[data-link]").forEach((s) => (s.onchange = async () => {
      s.disabled = true;
      try { await G.api("PUT", "/api/social/links", { name: names[Number(s.dataset.link)].name, friend_id: s.value || null }); ctx.toast("연결을 저장했습니다."); } catch (x) { ctx.toast(x.message, 5000); }
      s.disabled = false;
    }));
  }

  async function shared(ctx) {
    const { app, esc, G } = ctx;
    const { rounds } = await G.api("GET", "/api/social/shared-rounds");
    app.innerHTML = `<p class="mt0">친구가 자기 기록의 동반자를 나와 연결한 라운드입니다. 「내 기록으로 가져오기」를 누르면 코스·Par·핸디캡·거리와 <b>내 홀별 타수</b>로 새 라운드가 만들어집니다. 퍼트·FW 등은 가져온 뒤 라운드 수정에서 채우세요.</p>
      <div class="tbl-wrap"><table><thead><tr><th class="l">날짜·코스</th><th class="l">기록한 친구</th><th>내 타수</th><th>친구 타수</th><th></th></tr></thead><tbody>
      ${rounds.map((r, i) => `<tr><td class="l"><b>${esc(r.date)}</b> ${esc(r.course)}<br><span class="muted">${esc([r.front, r.back].filter(Boolean).join("·"))}${r.tee ? " · " + esc(r.tee) : ""}</span></td><td class="l">${esc(r.owner)}</td>
        <td><b>${v(r.myScore)}</b>${r.myHoles && r.myHoles < 18 ? `<br><span class="muted">${r.myHoles}홀</span>` : ""}</td><td>${v(r.ownerScore)}</td>
        <td>${r.imported ? `<span class="muted">가져옴</span>` : `<button class="btn xs" data-imp="${i}" type="button">내 기록으로 가져오기</button>${r.sameDate ? `<br><span class="muted">⚠ 같은 날 라운드 있음</span>` : ""}`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">아직 없습니다. 친구가 「동반자 연결」에서 나를 연결하면 나타납니다.</td></tr>`}
      </tbody></table></div>`;
    app.querySelectorAll("[data-imp]").forEach((b) => (b.onclick = run(ctx, async () => {
      const r = rounds[Number(b.dataset.imp)];
      if (r.sameDate && !confirm(`${r.date}에 이미 라운드가 있습니다. 그래도 가져올까요?`)) throw new Error("취소");
      await G.api("POST", "/api/social/shared-rounds/import", { ownerId: r.ownerId, roundId: r.roundId });
      ctx.toast("가져왔습니다. 라운드 기록에서 확인하세요.");
      await ctx.reload();
    }, () => shared(ctx))));
  }

  // ───────── 통계 → 친구 순위 ─────────
  let period = "0";
  async function ranking(ctx) {
    const { app, esc, G } = ctx;
    const { players } = await G.api("GET", `/api/social/ranking?period=${period}`);
    const ps = players.filter((p) => p.rounds).sort((a, b) => (a.recent5 ?? 999) - (b.recent5 ?? 999));
    const none = players.filter((p) => !p.rounds);
    app.innerHTML = `<div class="row"><label>기간 <select id="period">${[["0", "전체"], ["365", "최근 1년"], ["90", "최근 90일"]].map(([k, t]) => `<option value="${k}" ${k === period ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
      <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>순위</th><th class="l">회원</th><th>최근 5R 평균</th><th>평균 타수</th><th>베스트</th><th>평균 퍼트</th><th>파 이하 홀</th><th>라운드</th><th>최근</th></tr></thead><tbody>
      ${ps.map((p, i) => `<tr style="${p.me ? "background:var(--sky)" : ""}"><td><b>${i + 1}</b></td><td class="l"><b>${esc(p.nickname)}</b>${p.me ? " (나)" : ""}</td><td><b>${v(p.recent5)}</b></td><td>${v(p.avg)}</td><td>${v(p.best)}<br><span class="muted">${v(p.bestDate, "")}</span></td><td>${v(p.putts)}</td><td>${v(p.parOrBetter)}</td><td>${p.rounds}</td><td>${v(p.last)}</td></tr>`).join("")}
      </tbody></table></div>
      ${none.length ? `<p class="muted">이 기간 18홀 기록 없음: ${none.map((p) => esc(p.nickname)).join(", ")}</p>` : ""}
      ${players.length < 2 ? `<div class="notice" style="margin-top:12px">아직 친구가 없습니다. <a href="#/friends/list">친구</a>를 맺으면 서로의 순위가 보입니다.</div>` : ""}
      <p class="legend-note">18홀을 모두 기록한 라운드만 셉니다(예정 라운드 제외). 순위는 최근 5라운드 평균 타수 기준. 친구에게는 요약 숫자만 보입니다.</p>`;
    document.getElementById("period").onchange = (e) => { period = e.target.value; ranking(ctx); };
  }

  // ───────── 홈 위쪽: 인사·빠른 실행·공지 ─────────
  async function homeTop(ctx) {
    const { app, esc, G } = ctx;
    await G.ready;
    const me = G.me();
    const { notices } = await G.api("GET", "/api/notices").catch(() => ({ notices: [] }));
    if (!/^#\/(dashboard)?$/.test(location.hash || "#/")) return;   // 그사이 다른 화면으로 옮겼으면 그리지 않음
    const hour = new Date().getHours();
    const hi = hour < 11 ? "좋은 아침이에요" : hour < 18 ? "반가워요" : "오늘 라운드는 어땠나요";
    const box = document.createElement("div");
    box.id = "homeTop";
    box.innerHTML = `
      <div class="home-hello"><h2>⛳ ${esc(me?.nickname || "")}님, ${hi}</h2><span class="muted">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span></div>
      <div class="quick">
        <a href="#/register/input" style="background:var(--mint)"><i>✏️</i><b>라운드 기록하기</b><span>홀별 점수 직접 입력</span></a>
        <a href="#/register/paste" style="background:var(--sky)"><i>📸</i><b>스코어·사진 등록</b><span>스코어카드 사진, 스마트스코어</span></a>
        <a href="#/schedule" style="background:var(--lav)"><i>📅</i><b>일정 보기</b><span>내 라운드 + 모임 일정</span></a>
        <a href="#/mypage/settings" style="background:var(--peach)"><i>🔔</i><b>알림·앱 설치</b><span>라운드·일정 전날 알림</span></a>
      </div>
      ${notices.length ? `<div class="card" style="margin-bottom:14px"><h3 class="mt0">📢 공지</h3><ul class="notice-list">${notices.slice(0, 3).map((n, i) => `<li data-n="${i}">${n.pinned ? `<span class="pin">고정</span>` : ""}<b>${esc(n.title)}</b> <span class="muted">· ${esc(new Date(n.created_at).toLocaleDateString("ko-KR"))}</span><div class="notice-body" hidden>${esc(n.body || "")}</div></li>`).join("")}</ul></div>` : ""}`;
    document.getElementById("homeTop")?.remove();
    app.prepend(box);
    box.querySelectorAll("[data-n]").forEach((li) => (li.onclick = () => { const b = li.querySelector(".notice-body"); b.hidden = !b.hidden; }));
  }

  // ───────── 통계 → 베스트 스코어 ─────────
  let bestYear = "";
  function best(ctx) {
    const { app, esc } = ctx;
    const all = ctx.rounds().map((r) => ({ r, s: strokes18(r) })).filter((x) => x.s !== null);
    const years = [...new Set(all.map((x) => x.r.date.slice(0, 4)))].sort().reverse();
    const list = bestYear ? all.filter((x) => x.r.date.startsWith(bestYear)) : all;
    const band = [["70대", 70, 79], ["80대", 80, 89], ["90대", 90, 99], ["100타 이상", 100, 999]].map(([t, a, b]) => [t, list.filter((x) => x.s >= a && x.s <= b).length]);
    const top = [...list].sort((a, b) => a.s - b.s || (a.r.date < b.r.date ? 1 : -1)).slice(0, 10);
    const byYear = years.map((y) => { const ys = all.filter((x) => x.r.date.startsWith(y)); const b = ys.reduce((m, x) => (x.s < m.s ? x : m), ys[0]); return { y, n: ys.length, best: b, avg: avg1(ys.map((x) => x.s)) }; });
    app.innerHTML = `
      <div class="seg" style="margin-bottom:12px">${["", ...years].map((y) => `<button type="button" data-y="${y}" class="${y === bestYear ? "on" : ""}">${y || "전체"}</button>`).join("")}</div>
      ${list.length ? `
      <div class="stat-grid">
        <div class="kpi"><div class="lbl">베스트</div><div class="val">${top[0].s}</div><div class="sub">${esc(top[0].r.date)} ${esc(top[0].r.course)}</div></div>
        ${band.map(([t, n]) => `<div class="kpi"><div class="lbl">${t}</div><div class="val">${n}</div><div class="sub">회</div></div>`).join("")}
      </div>
      <h3>베스트 10 라운드</h3>
      <div class="tbl-wrap"><table><thead><tr><th>순위</th><th class="l">일자</th><th class="l">골프장</th><th>타수</th></tr></thead><tbody>
        ${top.map((x, i) => `<tr data-rid="${esc(x.r.id)}" style="cursor:pointer"><td>${i + 1}</td><td class="l">${esc(x.r.date)}</td><td class="l">${esc(x.r.course)}</td><td><b>${x.s}</b></td></tr>`).join("")}</tbody></table></div>
      <h3>연도별 베스트</h3>
      <div class="tbl-wrap"><table><thead><tr><th class="l">연도</th><th>베스트</th><th class="l">그날</th><th>평균</th><th>라운드</th></tr></thead><tbody>
        ${byYear.map((x) => `<tr><td class="l">${x.y}</td><td><b>${x.best.s}</b></td><td class="l">${esc(x.best.r.date)} ${esc(x.best.r.course)}</td><td>${x.avg}</td><td>${x.n}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">18홀을 모두 기록한 라운드가 없습니다.</p>`}
      <p class="legend-note">18홀을 모두 기록한 라운드만 셉니다(예정 라운드 제외). 행을 누르면 그 라운드로 갑니다.</p>`;
    app.querySelectorAll("[data-y]").forEach((b) => (b.onclick = () => { bestYear = b.dataset.y; best(ctx); }));
    app.querySelectorAll("[data-rid]").forEach((tr) => (tr.onclick = () => (location.hash = "#/round/" + encodeURIComponent(tr.dataset.rid))));
  }

  // ───────── 통계 → 자주 가는 골프장 ─────────
  let freqYear = "";
  function freq(ctx) {
    const { app, esc } = ctx;
    const done = ctx.rounds().filter((r) => !r.planned);
    const years = [...new Set(done.map((r) => r.date.slice(0, 4)))].sort().reverse();
    const list = freqYear ? done.filter((r) => r.date.startsWith(freqYear)) : done;
    const m = {};
    for (const r of list) {
      const k = r.course || "-";
      const x = (m[k] = m[k] || { course: k, n: 0, sc: [], last: null, best: null, region: r.region || "" });
      x.n++;
      const s = strokes18(r);
      if (s !== null) { x.sc.push(s); if (!x.best || s < x.best.s) x.best = { s, date: r.date }; }
      if (!x.last || r.date > x.last.date) x.last = { date: r.date, s };
    }
    const rows = Object.values(m).sort((a, b) => b.n - a.n || (a.last.date < b.last.date ? 1 : -1));
    app.innerHTML = `
      <div class="seg" style="margin-bottom:12px">${["", ...years].map((y) => `<button type="button" data-y="${y}" class="${y === freqYear ? "on" : ""}">${y || "전체"}</button>`).join("")}</div>
      <div class="tbl-wrap"><table><thead><tr><th>순위</th><th class="l">골프장</th><th>방문</th><th>평균</th><th class="l">최근 방문</th><th class="l">베스트</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr data-course="${esc(x.course)}" style="cursor:pointer"><td>${i + 1}</td><td class="l"><b>${esc(x.course)}</b>${x.region ? ` <span class="muted">${esc(x.region)}</span>` : ""}</td><td>${x.n}회</td><td>${v(avg1(x.sc))}</td>
          <td class="l">${esc(x.last.date)}${x.last.s ? ` · ${x.last.s}` : ""}</td><td class="l">${x.best ? `<b>${x.best.s}</b> <span class="muted">${esc(x.best.date)}</span>` : "-"}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">기록이 없습니다.</td></tr>`}
      </tbody></table></div>
      <p class="legend-note">평균·베스트는 18홀을 모두 기록한 라운드 기준. 골프장을 누르면 그 골프장 라운드만 「라운드 기록」에서 걸러 봅니다.</p>`;
    app.querySelectorAll("[data-y]").forEach((b) => (b.onclick = () => { freqYear = b.dataset.y; freq(ctx); }));
    app.querySelectorAll("[data-course]").forEach((tr) => (tr.onclick = () => {
      try { const f = JSON.parse(localStorage.getItem("lounge.filter.v1") || "{}"); f.course = tr.dataset.course; localStorage.setItem("lounge.filter.v1", JSON.stringify(f)); } catch { /* 무시 */ }
      location.hash = "#/rounds";
    }));
  }

  // ───────── 마이페이지 ─────────
  async function profile(ctx) {
    const { app, esc, G } = ctx;
    const [{ user }, { groups }] = await Promise.all([G.api("GET", "/api/me/summary"), G.api("GET", "/api/groups")]);
    const ver = typeof APP_VERSION === "string" ? APP_VERSION : "-", build = typeof APP_BUILD === "string" ? APP_BUILD : "-";
    app.innerHTML = `
      <div class="card"><div class="profile-card">
        <div class="avatar">${esc((user.nickname || "?").slice(0, 1))}</div>
        <div><h2 class="mt0" style="margin:0">${esc(user.nickname)}</h2><span class="muted">${user.role === "admin" ? "관리자" : "회원"} · ${esc(new Date(user.created_at).toLocaleDateString("ko-KR"))} 가입${user.gender ? " · " + GENDER[user.gender] : ""}${user.birth_year ? ` · ${user.birth_year}년생` : ""}</span></div>
      </div></div>
      ${!user.gender || !user.birth_year ? `<div class="notice" style="margin-top:10px">👤 <b>성별·출생연도</b>를 넣으면 모임 대시보드 통계(인원수 합계)에 반영됩니다. <button class="link" data-open="info" type="button">지금 넣기 ›</button></div>` : ""}
      ${(user.rounds || 0) < 1 ? `<h2>🚀 시작 가이드</h2><div class="steps-mini">
          <div><b>1️⃣ 첫 라운드 기록</b>점수를 남기면 통계가 자동으로 만들어집니다. <a href="#/register">기록하기 ›</a></div>
          <div><b>2️⃣ 통계 확인</b>평균·베스트·약점을 통계 메뉴에서 봅니다.</div>
          <div><b>3️⃣ 친구·모임</b>친구를 맺고 모임에 들어가 일정을 함께 봅니다.</div></div>` : ""}
      <h2>📊 내 활동</h2>
      <div class="stat-grid">
        <div class="kpi"><div class="lbl">등록한 라운드</div><div class="val">${user.rounds || 0}</div><div class="sub">건</div></div>
        <div class="kpi"><div class="lbl">내 모임</div><div class="val">${user.groups}</div><div class="sub">곳</div></div>
        <div class="kpi"><div class="lbl">친구</div><div class="val">${user.friends}</div><div class="sub">명</div></div>
        <div class="kpi"><div class="lbl">모임 일정 참석</div><div class="val">${user.attended}</div><div class="sub">회</div></div>
      </div>
      ${groups.length ? `<div class="card" style="margin-top:12px">${groups.map((g) => `<a href="#/group/${g.id}" style="display:block;padding:6px 0;text-decoration:none"><b>👥 ${esc(g.name)}</b> <span class="muted">${g.members}명 · ${g.role === "owner" ? "모임장" : "회원"}</span></a>`).join("")}</div>` : ""}
      <h2>⚙️ 설정</h2>
      <div class="card"><ul class="menu-list">
        <li><button type="button" data-open="info">회원정보 수정 <span class="arr">›</span></button></li>
        <li><button type="button" data-open="pw">비밀번호 변경 <span class="arr">›</span></button></li>
        <li><a href="#/mypage/settings">알림 · 지표 기준 · 클럽 거리 · 백업 <span class="arr">›</span></a></li>
        <li><a href="#/mypage/activity">최근 활동 기록 <span class="arr">›</span></a></li>
        ${user.role === "admin" ? `<li><a href="/admin/">관리자 화면 <span class="arr">↗</span></a></li>` : ""}
        <li><button type="button" data-open="bye">회원 탈퇴 <span class="arr">›</span></button></li>
      </ul></div>
      <div id="pPanel"></div>
      <h2>📱 앱 정보</h2>
      <div class="card"><p class="mt0">Our Golf Lounge · 알림 받는 기기 ${user.push_devices}대</p>
        <div class="row"><button class="btn ghost" id="bCache" type="button">캐시 지우고 새로 받기</button><button class="btn danger" id="bOut" type="button">로그아웃</button></div>
        <p class="legend-note">화면이 이상하거나 새 버전이 안 보일 때 「캐시 지우고 새로 받기」를 누르세요. 기록은 서버에 있어 지워지지 않습니다.</p></div>`;
    const $ = (id) => document.getElementById(id);
    const panel = {
      info: `<div class="card"><h3 class="mt0">회원정보 수정</h3><div class="form-grid"><label>이메일(로그인 아이디)<input value="${esc(user.email)}" disabled></label><label>닉네임<input id="pNick" maxlength="20" value="${esc(user.nickname)}"></label>
          <label>성별<select id="pGender"><option value="">선택 안 함</option><option value="M" ${user.gender === "M" ? "selected" : ""}>남</option><option value="F" ${user.gender === "F" ? "selected" : ""}>여</option></select></label>
          <label>출생연도<select id="pBirth">${yearOptions(user.birth_year)}</select></label></div>
        <p class="legend-note">성별·출생연도는 모임 대시보드의 성별·나이대 통계(인원수 합계)에만 쓰입니다.</p>
        <div class="row" style="margin-top:10px"><button class="btn" id="bNick" type="button">저장</button></div></div>`,
      pw: `<div class="card"><h3 class="mt0">비밀번호 변경</h3><div class="form-grid"><label>지금 비밀번호<input id="pCur" type="password" autocomplete="current-password"></label><label>새 비밀번호(8자 이상)<input id="pNew" type="password" autocomplete="new-password" minlength="8"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="bPw" type="button">비밀번호 바꾸기</button></div></div>`,
      bye: `<div class="card" style="border-color:var(--rose)"><h3 class="mt0">회원 탈퇴</h3>
        <ul class="muted" style="margin:0 0 10px;padding-left:18px"><li>계정·라운드 기록·사진·설정이 <b>바로 삭제되며 되돌릴 수 없습니다.</b></li><li>들어간 모임에서 빠지고, 내가 모임장인 모임은 일정과 함께 삭제됩니다.</li><li>필요하면 먼저 <a href="#/mypage/settings">설정 → 백업</a>에서 기록을 내려받으세요.</li></ul>
        <div class="form-grid"><label>비밀번호 확인<input id="pBye" type="password" autocomplete="current-password"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn danger" id="bBye" type="button">탈퇴하기</button></div></div>`,
    };
    app.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => {
      $("pPanel").innerHTML = panel[b.dataset.open];
      $("pPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      if ($("bNick")) $("bNick").onclick = run(ctx, async () => { await G.api("PATCH", "/api/me", { nickname: $("pNick").value, gender: $("pGender").value || null, birthYear: $("pBirth").value ? Number($("pBirth").value) : null }); ctx.toast("회원정보를 저장했습니다."); location.reload(); });
      if ($("bPw")) $("bPw").onclick = run(ctx, async () => { await G.api("POST", "/api/me/password", { current: $("pCur").value, next: $("pNew").value }); ctx.toast("비밀번호를 바꿨습니다."); $("pPanel").innerHTML = ""; });
      if ($("bBye")) $("bBye").onclick = run(ctx, async () => {
        if (!confirm("정말 탈퇴할까요? 기록이 모두 삭제되고 되돌릴 수 없습니다.")) throw new Error("취소");
        await G.api("DELETE", "/api/me", { password: $("pBye").value });
        try { localStorage.clear(); } catch { /* 무시 */ }
        alert("탈퇴했습니다. 그동안 이용해 주셔서 감사합니다.");
        location.href = "/";
      });
    }));
    $("bCache").onclick = async () => {
      try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); const rs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of rs || []) await r.unregister(); } catch { /* 무시 */ }
      location.reload();
    };
    $("bOut").onclick = () => G.logout();
  }

  async function activity(ctx) {
    const { app, esc, G } = ctx;
    const { activity } = await G.api("GET", "/api/me/summary");
    const names = { rounds: "라운드", settings: "설정", courses: "골프장 정보", "course-requests": "골프장 요청" };
    app.innerHTML = `<h2 class="mt0">최근 활동 <span class="muted">20건</span></h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">시각</th><th class="l">구분</th><th class="l">내용</th></tr></thead><tbody>
      ${activity.map((a) => `<tr><td class="l">${esc(new Date(a.at).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</td><td class="l">${esc(names[a.name] || a.name)}</td><td class="l">${esc(a.message || "")}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">아직 없음</td></tr>`}
      </tbody></table></div>`;
  }

  // 화면 함수가 실패해도 빈 화면 대신 이유를 보여 준다
  const wrap = (f) => async (ctx) => { try { await f(ctx); } catch (x) { ctx.app.innerHTML = `<p>불러오지 못했습니다: ${ctx.esc(x.message)}</p>`; } };
  return Object.fromEntries(Object.entries({ schedule, groups, group, event, friends, links, shared, ranking, profile, activity, homeTop, best, freq }).map(([k, f]) => [k, wrap(f)]));
})();
