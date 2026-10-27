# 0001 mod 이름은 spec-cycle-lens, 커맨드는 /lens

- 상태: 확정 (PRD v0.2 Q1, 2026-10-27)
- 날짜: 2026-10-27

## 맥락
spec-cycle을 관측하는 mod의 이름과 슬래시 커맨드를 정해야 했다. 이름은 대상 플러그인을 분명히 드러내야 하고, 커맨드는
세션 안에서 자주 치므로 짧아야 한다. mod 이름은 `claude-`로 시작할 수 없다.

## 결정
mod 이름은 `spec-cycle-lens`, 커맨드는 `/lens`(`/lens pin <id>`, `/lens unpin`, `/lens refresh`). 에이전트 권장안: 이 안 (채택 여부: 채택)

## 대안
- `/spec-cycle-lens`: 대상이 더 분명하지만 길어서 자주 치기 어렵다.
- `/scl`: 짧지만 뜻이 보이지 않는다.

## 영향
- `.claude-plugin/plugin.json`의 `name`, `hooks/register.tsx`의 `$.command.register({ name: 'lens' })`.
