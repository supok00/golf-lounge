/* 골프장 지역(시·도). 라운드 데이터에는 지역이 없어서, 아는 골프장은 기본값을 두고
 * 사용자가 설정 → 골프장 지역에서 고친 값(settings.regions)을 우선한다.
 * 기본값 중 확실하지 않은 곳은 guess(추정)로 표시한다. */
const Regions = (() => {
  // 한국 시·도 타일 지도 배치 [이름, 열, 행] — 대략적인 위치만 맞춘 칸 지도
  const TILES = [
    ["경기", 1, 0], ["강원", 2, 0],
    ["인천", 0, 1], ["서울", 1, 1], ["충북", 2, 1], ["경북", 3, 1],
    ["충남", 0, 2], ["세종", 1, 2], ["대전", 2, 2], ["대구", 3, 2],
    ["전북", 1, 3], ["경남", 2, 3], ["울산", 3, 3],
    ["광주", 0, 4], ["전남", 1, 4], ["부산", 3, 4],
    ["제주", 1, 5],
  ];
  const NAMES = [...TILES.map((t) => t[0]), "해외"];

  // 기본값: [지역, 추정 여부]
  const DEFAULTS = {
    "라헨느": ["제주"], "해비치": ["제주"], "엘리시안제주": ["제주"],
    "빅토리아CC": ["경기"], "더헤븐CC": ["경기"], "레이크사이드CC": ["경기"], "솔라고CC": ["충남"], "시그너스": ["충북"],
    "골프존카운티 안성W": ["경기"], "로제비앙 곤지암": ["경기"], "신라CC": ["경기"], "캐슬파인GC": ["경기"],
    "마이다스레이크 이천": ["경기"], "뉴서울CC": ["경기"], "기흥CC": ["경기"], "오크힐스CC": ["강원"], "양주CC": ["경기"],
    "안성베네스트GC": ["경기"], "인천그랜드CC": ["인천"], "포웰CC 안성": ["경기"], "드림파크CC": ["인천"],
    "에덴블루CC": ["경기", true], "무등산CC": ["광주", true], "벨라45CC": ["강원", true], "아세코밸리GC": ["경기", true],
    "남여주GC": ["경기"], "써닝포인트CC": ["경기"], "센추리21CC": ["강원"], "양지파인CC": ["경기"], "은화삼CC": ["경기"],
  };

  function of(course, settings) {
    const custom = settings && settings.regions && settings.regions[course];
    if (custom) return { region: custom, guess: false, custom: true };
    const d = DEFAULTS[course];
    if (d) return { region: d[0], guess: !!d[1], custom: false };
    // 기본값에 없는 골프장: 이름에 시·도 이름이 들어 있으면 그것으로 추정(예: '엘리시안제주' → 제주)
    const hit = NAMES.find((n) => String(course).includes(n));
    return hit ? { region: hit, guess: true, custom: false } : { region: "미지정", guess: false, custom: false };
  }

  /* 지역별 집계: { 지역: { courses: [{course, n, avg, best, last, lastScore}], rounds } } */
  function summarize(rs, settings) {
    const S = GolfStats;
    const out = {};
    for (const r of rs) {
      const reg = of(r.course, settings).region;
      (out[reg] = out[reg] || { rounds: 0, byCourse: new Map() }).rounds++;
      const m = out[reg].byCourse;
      if (!m.has(r.course)) m.set(r.course, []);
      m.get(r.course).push(r);
    }
    for (const reg of Object.keys(out)) {
      out[reg].courses = [...out[reg].byCourse].map(([course, list]) => {
        const recent = S.byRecent(list), fulls = list.filter((x) => x.full);
        return { course, n: list.length, avg: S.avg(fulls.map((x) => x.strokes)), best: fulls.length ? Math.min(...fulls.map((x) => x.strokes)) : null, last: recent[0].date, lastScore: recent[0].strokes };
      }).sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1));
      delete out[reg].byCourse;
    }
    return out;
  }

  return { TILES, NAMES, DEFAULTS, of, summarize };
})();
