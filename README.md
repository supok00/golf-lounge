# My Golf Lounge

골프 라운드 기록·분석 웹 — 파스텔 톤 화면. 기능은 [MyGolf](https://github.com/supok00/mygolf)와 같고, 골프라운지(golflounge.co.kr) 화면 분위기를 참고해 모양을 새로 만들었습니다(제휴·공식 서비스 아님).

**주소**: https://supok00.github.io/golf-lounge/

- 아이콘 탭 메뉴, 파스텔 요약 카드, 「📊 이렇게 집계했어요」 안내 상자, 파스텔 차트
- 공통 필터, 스코어 유형, 안정성, 베스트 TOP 10, 추이 자동 집계, 인사이트, 홀·파·상세 분석
- 스마트스코어 붙여넣기 등록, 홀별 17개 항목 직접 입력
- 📖 사용자 가이드 메뉴

## 데이터
`data/rounds.json`을 golf-lounge · mygolf · golf-round-web 세 저장소에 두고, 저장할 때 같은 변경을 세 곳에 적용해 동기화합니다.
저장에는 세 저장소 모두 Contents 읽기/쓰기 권한이 있는 fine-grained 토큰이 필요합니다.

## 다른 사람이 쓰려면 (Fork)
1. GitHub 계정으로 이 저장소를 **Fork**
2. 내 복사본의 **Settings → Pages → main / (root)** 저장 → `https://내아이디.github.io/golf-lounge/`
3. 내 복사본에만 권한이 있는 fine-grained 토큰(Contents: Read and write)을 만들어 사이트 설정에 입력

- 페이지 주소에서 저장소를 알아내므로 코드를 고칠 필요가 없습니다.
- Fork한 사람의 기록은 `data/users/아이디/`에 저장되고 빈 기록으로 시작합니다. 원래 주인의 `data/`는 쓰지 않습니다.
- 원래 저장소의 새 기능은 **Sync fork → Update branch**로 받습니다. 기록 파일이 달라 충돌하지 않습니다.
- 세 저장소 동기화(mygolf, golf-round-web)는 원래 주인(supok00) 사이트에서만 동작합니다.
- 자세한 순서는 사이트의 📖 가이드 → 「처음 쓰는 분」에 있습니다.
