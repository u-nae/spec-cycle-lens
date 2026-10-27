# 0004 status.json은 git에서 무시한다

- 상태: 확정 (PRD v0.2 Q4, 2026-10-27)
- 날짜: 2026-10-27

## 맥락
`.spec-cycle/status.json`을 커밋할지 정해야 했다. 파일은 run 디렉터리와 작업 항목 목록에서 완전히 파생되고,
`inputs[].mtime_ms`는 기기마다 다르다.

## 결정
무시한다(`.gitignore`). `resolve-inputs`의 `gitignore_hint`와 spec-cycle README가 이 줄을 권장한다.
에이전트 권장안: 무시 (채택 여부: 채택)

## 대안
- 커밋: 클론 직후에도 band가 보이지만, 체크아웃마다 mtime이 어긋나 `⚠ 스냅숏 오래됨`이 항상 뜨고 커밋마다 잡음이 생긴다.

## 영향
- 클론 직후에는 스냅숏이 없으므로 mod는 `spec-cycle: 스냅숏 없음 · /lens refresh`를 보인다(PRD §6.2).
