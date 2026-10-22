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
