# 0006 구현 언어는 TypeScript(TSX)

- 상태: 확정 (PRD v0.2 Q6, 2026-10-27)
- 날짜: 2026-10-27

## 맥락
hooks 모듈을 JavaScript로 쓸지 TypeScript로 쓸지 정해야 했다. 엔진이 mod를 로드할 때 `.claude-plugin/types/`에
API 선언(`claude-code/index.d.ts`)을 생성하고, 테스트 키트(`claude-code/testing`)도 TS 기준이다.

## 결정
TypeScript(TSX)로 쓴다. `tsconfig.json`은 API 선언 파일 머리말의 설정을 따르고 `tsc -p .`로 타입 검사한다.
에이전트 권장안: TypeScript (채택 여부: 채택)

## 대안
- JavaScript + JSDoc: 빌드 단계가 없지만 `PluginState` 계약과 surface별 element 타입을 잃는다.

## 영향
- `hooks/register.tsx`, `types/index.d.ts`, `tests/*.test.tsx`. `$`는 구조분해하지 않고 `$.noun.method`로 풀어 쓴다(정적 분석 요구).
