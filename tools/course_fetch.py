"""골프장 정보 등록 도구 — Claude Code에서 「골프장 요청 처리해줘」 할 때 쓴다(API 비용 없음).

앱의 「새 골프장 정보 요청」은 data/course-requests.json에 status "요청"으로 쌓인다.
Claude Code가 이 도구로 홈페이지를 읽고(표는 page, 그림은 내려받아 직접 보기), 찾은 값을 JSON으로 적어 merge하면
data/courses.json에 합치고 홀 그림을 data/courses/<골프장>/에 저장한 뒤 요청을 「완료」로 바꾼다.

usage (저장소 루트에서, pip install requests pillow):
  python3 tools/course_fetch.py list                       # 대기 중인 요청
  python3 tools/course_fetch.py page <url>                 # 페이지 글·표·링크·그림 주소
  python3 tools/course_fetch.py image <url> <out.jpg>      # 그림을 읽기 좋은 크기로 내려받기
  python3 tools/course_fetch.py merge <sub.json> <요청 id> # 검증 → 병합 → 홀 그림 저장 → (날짜가 있으면) 예정 라운드 → 요청 완료
  python3 tools/course_fetch.py fail <요청 id> <이유>      # 찾을 수 없을 때

sub.json 형식(merge): {"name", "alias":[], "region", "courses":[{"name", "tee", "tee_label", "green":"좌|우|", "note",
  "holes":[{"h", "par", "hcp", "yd", "dist", "ydR", "distR", "tip", "map_url"}]}], "warnings":[]}
  - 거리는 dist(미터) 또는 yd(야드) — dist가 없으면 yd×0.9144로 계산. 투 그린은 좌그린 기준, 다른 그린은 distR/ydR
  - 같은 색 티가 여러 개면 가장 먼 티. 스코어카드 표는 그린 기준이 섞일 수 있으니 홀 그림의 Left/Right 값을 우선
  - tip은 홈페이지 공략을 자기 말로 1~3문장 요약(원문 그대로 옮기지 않기), map_url은 홀 그림 주소
"""
import datetime
import io
import json
import re
import sys
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REQUESTS = ROOT / "data/course-requests.json"
ROUNDS = ROOT / "data/rounds.json"
COURSES = ROOT / "data/courses.json"
UA = {"User-Agent": "Mozilla/5.0 (golf-lounge course fetch; personal use)"}
KST = datetime.timezone(datetime.timedelta(hours=9))


def now():
    return datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M")


def norm(s):
    return re.sub(r"(cc|gc|c\.c|컨트리클럽|골프클럽|골프장)$", "", re.sub(r"\s+", "", str(s or "").lower()))


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ───────────── 페이지 읽기 · 그림 ─────────────
def http_get(url):
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError("http(s) 주소만 열 수 있습니다")
    r = requests.get(url, headers=UA, timeout=25)
    r.raise_for_status()
    return r


def decode(r):
    # 국내 골프장 사이트는 EUC-KR이 많고 헤더에 문자셋이 없기도 하다
    m = re.search(rb'charset=["\']?([\w-]+)', r.content[:3000], re.I)
    enc = (m.group(1).decode() if m else None) or r.encoding or "utf-8"
    if enc.lower() in ("euc-kr", "ks_c_5601-1987", "x-windows-949"):
        enc = "cp949"
    return r.content.decode(enc, errors="replace")


def fetch_page(url):
    """페이지 글·표를 줄 단위로(칸은 | ), 링크·프레임·그림 주소는 목록으로."""
    r = http_get(url)
    html = decode(r)
    base = r.url
    links, images = [], []
    for m in re.finditer(r'<(a|frame|iframe|area)\b[^>]*?(href|src)=["\']([^"\'#]+)["\'][^>]*>([^<]{0,60})', html, re.I):
        u = urljoin(base, unescape(m.group(3)))
        if u.startswith("http") and not u.lower().endswith((".css", ".js")):
            text = re.sub(r"\s+", " ", unescape(m.group(4) or "")).strip()[:40]
            links.append(f"{text} -> {u}" if text else u)
    for m in re.finditer(r'<img\b[^>]*?src=["\']([^"\']+)["\'][^>]*>', html, re.I):
        alt = re.search(r'alt=["\']([^"\']*)', m.group(0), re.I)
        images.append(urljoin(base, unescape(m.group(1))) + (f"  (alt: {alt.group(1)[:30]})" if alt and alt.group(1) else ""))
    # onclick·스크립트 안의 페이지 주소(예: location.href='/course/e1.asp')도 링크로
    for m in re.finditer(r"""['"]([^'"\s]+\.(?:asp|aspx|php|jsp|html?)(?:\?[^'"\s]*)?)['"]""", html, re.I):
        links.append(urljoin(base, m.group(1)))
    body = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", html)
    body = re.sub(r"(?s)<!--.*?-->", " ", body)
    body = re.sub(r"\s+", " ", body)   # 칸 안의 줄바꿈을 없애야 표 한 행이 한 줄로 나온다
    body = re.sub(r"(?i)</(tr|p|div|li|h\d|table)>|<br\s*/?>", "\n", body)
    body = re.sub(r"(?i)</t[dh]>", " | ", body)
    text = unescape(re.sub(r"<[^>]+>", " ", body))
    text = "\n".join(re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in text.splitlines())
    text = re.sub(r"\n{2,}", "\n", text).strip()
    dedup = lambda xs: list(dict.fromkeys(xs))
    return f"[주소] {base}\n[본문]\n{text}\n\n[링크·프레임]\n" + "\n".join(dedup(links)) + "\n\n[그림]\n" + "\n".join(dedup(images))


def load_image(url, max_side):
    im = Image.open(io.BytesIO(http_get(url).content))
    if im.mode in ("RGBA", "LA", "P"):
        # 투명 PNG 홀 그림(스톤비치)을 그냥 RGB로 바꾸면 배경이 검게 나와 흰 바탕에 얹는다
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[3])
        im = bg
    im = im.convert("RGB")
    w, h = im.size
    k = min(1.0, max_side / max(w, h))
    return (im.resize((round(w * k), round(h * k))) if k < 1 else im), (w, h)


# ───────────── 검증 · 병합 ─────────────
def check(sub, req):
    errs = []
    got = {norm(c["name"]) for c in sub["courses"]}
    errs += [f"요청한 코스 「{w}」가 결과에 없음" for w in req["courses"] if norm(w) not in got]
    for c in sub["courses"]:
        hs = c["holes"]
        if len(hs) not in (9, 18):
            errs.append(f"{c['name']}: 홀 수 {len(hs)}")
        if sorted(h["h"] for h in hs) != list(range(1, len(hs) + 1)):
            errs.append(f"{c['name']}: 홀 번호가 1~{len(hs)}이 아님")
        if any(not (3 <= h["par"] <= 6) for h in hs):
            errs.append(f"{c['name']}: Par 값 이상")
        for h in hs:
            if h.get("dist") is None and h.get("yd") is not None:
                h["dist"] = round(h["yd"] * 0.9144)
            if h.get("distR") is None and h.get("ydR") is not None:
                h["distR"] = round(h["ydR"] * 0.9144)
            if h.get("dist") is not None and not (50 <= h["dist"] <= 650):
                errs.append(f"{c['name']} {h['h']}번: 거리 {h['dist']}m 이상")
    return errs


def slug_of(req, sub):
    host = urlparse(req["url"]).hostname or ""
    parts = [p for p in host.split(".") if p not in ("www", "m", "co", "kr", "com", "net", "or")]
    s = re.sub(r"[^a-z0-9]+", "-", (parts[0] if parts else "").lower()).strip("-")
    return s or "course-" + re.sub(r"\W+", "", norm(sub["name"]))[:20]


def save_map(url, path):
    # 저장소가 커지지 않게 긴 변 1500px·JPEG 품질 70으로 줄인다(아시아나 홀맵 기준 한 장 약 180KB)
    im, _ = load_image(url, 1500)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=70, optimize=True)


def merge(sub, req):
    db = load(COURSES, [])
    club = next((c for c in db if norm(c["name"]) == norm(sub["name"]) or norm(req["name"]) in map(norm, [c["name"], *c.get("alias", [])])), None)
    if not club:
        club = {"name": sub["name"], "alias": [], "region": sub.get("region", ""), "url": req["url"], "source": "", "updated": "", "courses": []}
        db.append(club)
    club["alias"] = sorted(set(club.get("alias", [])) | set(sub.get("alias", [])) | ({req["name"]} - {club["name"]}))
    club["region"] = club.get("region") or sub.get("region", "")
    club["url"] = club.get("url") or req["url"]
    club["updated"] = datetime.date.today().isoformat()
    slug = slug_of(req, sub)
    saved, failed = 0, []
    for c in sub["courses"]:
        # 파일 이름은 영문만(한글 코스 이름은 c1, c2 …) — 주소 인코딩 문제를 피한다
        known = next((i for i, x in enumerate(club["courses"]) if norm(x["name"]) == norm(c["name"])), len(club["courses"]))
        cname = re.sub(r"[^0-9a-z]+", "", c["name"].lower()) or f"c{known + 1}"
        holes = []
        for h in sorted(c["holes"], key=lambda x: x["h"]):
            x = {k: h.get(k) for k in ("h", "par", "hcp", "dist", "distR", "yd", "ydR", "tip")}
            if h.get("map_url"):
                rel = f"data/courses/{slug}/{cname}_{h['h']:02d}.jpg"
                try:
                    save_map(h["map_url"], ROOT / rel)
                    x["map"] = rel
                    saved += 1
                except Exception as e:  # 그림 하나 실패해도 거리·공략은 등록
                    failed.append(f"{c['name']} {h['h']}번 그림: {e}")
            holes.append({k: v for k, v in x.items() if v is not None and v != ""})
        cs = next((x for x in club["courses"] if norm(x["name"]) == norm(c["name"])), None)
        if not cs:
            cs = {"name": c["name"], "holes18": len(holes) == 18, "tees": {}}
            club["courses"].append(cs)
        cs["holes18"] = len(holes) == 18
        cs["tees"][c["tee"]] = {"green": c.get("green", ""), "note": f"{c.get('tee_label', c['tee'])} · {c.get('note', '')} · 거리는 미터", "holes": holes}
    src = f"{club['name']} 홈페이지에서 옮김({datetime.date.today().isoformat()}) — 공략은 홈페이지 내용을 요약, 홀 그림 저작권은 골프장"
    if src.split("(")[0] not in club.get("source", ""):
        club["source"] = (club.get("source", "") + " / " if club.get("source") else "") + src
    save(COURSES, db)
    return saved, failed


def add_planned(sub, req):
    """요청에 라운드 날짜가 있으면 그 날짜의 예정 라운드를 만든다(앱의 「골프장 정보 불러오기」와 같은 Par·핸디캡·거리).
    코스가 두 개면 첫 번째가 전반(1~9), 두 번째가 후반(10~18). 18홀 코스 하나면 그 코스 1~18. 같은 날짜·골프장 라운드가 있으면 건너뜀."""
    date = req.get("date")
    if not date:
        return ""
    rounds = load(ROUNDS, [])
    if any(r.get("date") == date and norm(r.get("course")) in (norm(sub["name"]), norm(req["name"])) for r in rounds):
        return f"{date} 라운드가 이미 있어 예정 라운드는 만들지 않음"
    db = load(COURSES, [])
    club = next(c for c in db if norm(c["name"]) == norm(sub["name"]))
    names = req["courses"][:2] or [sub["courses"][0]["name"]]
    front, back = names[0], names[-1]
    def tee_holes(name):
        cs = next(x for x in club["courses"] if norm(x["name"]) == norm(name))
        t = cs["tees"].get(req["tee"]) or next(iter(cs["tees"].values()))
        return t["holes"]
    fh = tee_holes(front)
    src = fh if len(fh) == 18 else fh[:9] + [dict(h, h=h["h"] + 9) for h in tee_holes(back)[:9]]
    holes = [{k: h[k] for k in ("h", "par", "dist", "hcp") if h.get(k) is not None} for h in src]
    rounds.append({"id": f"r{date.replace('-', '')}-plan", "date": date, "course": club["name"], "front": front, "back": back,
                   "tee": req["tee"], "region": club.get("region", ""), "memo": "", "planned": True, "holes": holes})
    save(ROUNDS, rounds)
    return f"{date} 예정 라운드 등록"


def find_req(reqs, rid):
    r = next((x for x in reqs if x.get("id") == rid), None)
    if not r:
        raise SystemExit(f"요청 {rid} 없음")
    return r


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "list"
    if cmd == "list":
        todo = [r for r in load(REQUESTS, []) if r.get("status") == "요청"]
        for r in todo:
            print(f"{r['id']}  {r['name']}  {r['url']}  코스 {', '.join(r['courses'])}  티 {r['tee']}  날짜 {r.get('date') or '-'}  {r.get('memo', '')}")
        print(f"대기 {len(todo)}건")
    elif cmd == "page":
        print(fetch_page(argv[2]))
    elif cmd == "image":
        im, (w, h) = load_image(argv[2], 1600)
        im.save(argv[3], "JPEG", quality=88)
        print(f"{argv[3]} (원본 {w}x{h})")
    elif cmd == "merge":
        sub = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        reqs = load(REQUESTS, [])
        req = find_req(reqs, argv[3])
        errs = check(sub, req)
        if errs:
            raise SystemExit("검증 실패:\n" + "\n".join(errs))
        saved, failed = merge(sub, req)
        plan = add_planned(sub, req)
        warn = list(sub.get("warnings", [])) + failed
        req.update(status="완료", club=sub["name"], done=now(),
                   message=f"{', '.join(c['name'] + '코스 ' + str(len(c['holes'])) + '홀' for c in sub['courses'])} 등록, 홀 그림 {saved}장" + (f" · {plan}" if plan else "") + (f" · 확인 필요: {' / '.join(warn[:4])}" if warn else ""))
        save(REQUESTS, reqs)
        print(req["message"])
    elif cmd == "fail":
        reqs = load(REQUESTS, [])
        find_req(reqs, argv[2]).update(status="실패", message=" ".join(argv[3:])[:300], done=now())
        save(REQUESTS, reqs)
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
