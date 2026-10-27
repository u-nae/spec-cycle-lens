# 0003 스냅숏은 상태를 바꾸는 모든 서브커맨드가 갱신한다

- 상태: 확정 (PRD v0.2 Q3, 2026-10-27)
- 날짜: 2026-10-27

## 맥락
`.spec-cycle/status.json`을 언제 다시 쓸지 정해야 했다. run 커맨드의 중간 상태(REVISE, NEEDS_HUMAN)가 band에 보이려면
비평 패스가 끝나는 시점에도 갱신되어야 한다. 반면 읽기 전용 서브커맨드까지 쓰면 fixture 검증처럼 프로젝트 밖에서 도는
호출이 파일을 남긴다.

## 결정
PRD §5.2의 상태 변경 서브커맨드 전부(`init`, `import-taskmaster`, `resolve-inputs`, `normalize`, `validate-author`,
`validate-critic`, `validate-decisions`, `build-handoff`, `render-brief`, `set-status`, `verify-obligations`)가 성공적으로
끝날 때 갱신한다. `validate-*`는 파일을 쓰지 않지만 run 단계가 넘어가는 시점이라 포함한다. `verify-obligations`는
미커버로 실패해도 보고서를 쓰므로 갱신한다. 읽기 전용 서브커맨드는 쓰지 않는다. 에이전트 권장안: 전부 (채택 여부: 채택)

## 대안
- `set-status`·`build-handoff`·`verify-obligations`만: 구현이 작지만 비평 중간 판정이 band에 보이지 않는다.
- 쓰기를 모두 mod에 맡김(`/lens refresh`만): 사람이 매번 눌러야 하고 P5(프로세스 실행 제한)와 충돌한다.

## 영향
- spec-cycle 0.4.0 `scripts/spec-cycle.mjs`의 dispatch와 `scripts/lib/status.mjs`의 `refreshStatusSnapshot`.
- 아티팩트 경로만 받는 서브커맨드는 `.spec-cycle/config.yaml`을 가진 가장 가까운 상위 디렉터리를 프로젝트로 본다.
  없으면(fixture 검증) 아무것도 쓰지 않는다.
