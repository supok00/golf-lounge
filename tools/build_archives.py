"""이전 버전 화면을 저장소 안의 vX.Y/ 폴더로 만든다 — https://계정.github.io/저장소/v1.0 처럼 볼 수 있게.

git 태그(vX.Y)마다 그 시점의 화면 파일(index.html, css, js, icons)을 꺼내고,
지금 데이터를 망가뜨리지 않도록 '보기 전용'으로 고친다:
  - 저장 버튼이 동작하지 않게(canWrite → false)
  - 서비스 워커·앱 설치를 끄고(최신 앱과 캐시가 섞이지 않게)
  - 화면 맨 위에 '이전 버전 · 최신 버전으로' 안내 줄
현재 버전(js/version.js의 APP_VERSION) 태그는 만들지 않는다 — 최신은 저장소 루트가 보여 준다.

usage: python3 tools/build_archives.py        (저장소 루트에서)
"""
import io
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["index.html", "css", "js", "icons"]

ARCHIVE_CSS = """
/* 이전 버전 보기 안내 줄 */
.archive-bar { position: sticky; top: 0; z-index: 30; background: #fff4cf; color: #5c4b00; border-bottom: 1px solid #f0e2a0;
  padding: 8px 16px; font-size: 13px; font-weight: 700; text-align: center; }
.archive-bar a { color: #3654b8; }
"""


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], check=True, capture_output=True).stdout


def current_version():
    m = re.search(r'APP_VERSION = "([\d.]+)"', (ROOT / "js/version.js").read_text(encoding="utf-8"))
    return m.group(1)


def sub_once(text, old, new, what):
    if old not in text:
        raise SystemExit(f"패치 실패({what}): '{old[:50]}' 를 찾지 못함")
    return text.replace(old, new, 1)


def build(tag, ver):
    out = ROOT / tag
    if out.exists():
        shutil.rmtree(out)
    data = git("archive", "--format=tar", tag, *FILES)
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        tf.extractall(out, filter="data")

    gh = out / "js/github.js"
    gh.write_text(sub_once(gh.read_text(encoding="utf-8"), "const canWrite = () => !!cfg().token;",
                           "const canWrite = () => false;   // 이전 버전은 보기 전용", "github.js"), encoding="utf-8")

    app = out / "js/app.js"
    t = app.read_text(encoding="utf-8")
    t = sub_once(t, '"serviceWorker" in navigator', 'false && "serviceWorker" in navigator', "app.js 서비스 워커")
    # 최신 앱의 '업데이트됨' 안내가 다시 뜨지 않게, 본 버전 기록 키를 따로 쓴다
    t = t.replace('.seenVersion"', '.seenVersion.archive"')
    app.write_text(t, encoding="utf-8")

    idx = out / "index.html"
    h = idx.read_text(encoding="utf-8")
    h = re.sub(r'\s*<link rel="manifest"[^>]*>', "", h)
    h = sub_once(h, "<body>", f'<body>\n<div class="archive-bar">📦 이전 버전 {tag} 화면입니다 (보기 전용, 저장 안 됨) · <a href="../">최신 버전으로 가기</a></div>', "index.html")
    # 같은 사이트라 브라우저 저장소를 최신 앱과 같이 쓴다. 이전 버전 화면에서 토큰·임시 저장·캐시를
    # 지우거나 덮어쓰지 않도록, 이 페이지의 localStorage를 'archive.vX.Y:' 이름표가 붙은 별도 공간으로 바꾼다.
    isolate = f"""<script>
(() => {{
  const P = "archive.{tag}:", real = window.localStorage;
  const box = {{
    getItem: (k) => real.getItem(P + k), setItem: (k, v) => real.setItem(P + k, v), removeItem: (k) => real.removeItem(P + k),
    clear: () => {{ for (let i = real.length - 1; i >= 0; i--) {{ const k = real.key(i); if (k && k.startsWith(P)) real.removeItem(k); }} }},
    key: () => null, get length() {{ return 0; }},
  }};
  try {{ Object.defineProperty(window, "localStorage", {{ value: box, configurable: true }}); }} catch (e) {{ /* 지원 안 되면 저장 차단만 유지 */ }}
}})();
</script>
"""
    first_script = h.find("<script")
    h = h[:first_script] + isolate + h[first_script:]
    h = h.replace("<title>", f"<title>[{tag}] ", 1)
    idx.write_text(h, encoding="utf-8")

    css = out / "css/style.css"
    css.write_text(css.read_text(encoding="utf-8") + ARCHIVE_CSS, encoding="utf-8")


def main():
    cur = current_version()
    tags = [t for t in git("tag", "--list", "v*").decode().split() if re.fullmatch(r"v\d+\.\d+", t)]
    built = []
    for tag in sorted(tags, key=lambda t: [int(x) for x in t[1:].split(".")]):
        if tag == f"v{cur}":
            continue
        build(tag, tag[1:])
        built.append(tag)
    print("만든 이전 버전:", ", ".join(built) or "없음", f"(현재 v{cur}은 루트)")


if __name__ == "__main__":
    main()
