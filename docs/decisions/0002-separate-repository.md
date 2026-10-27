# 0002 mod는 별도 저장소 u-nae/spec-cycle-lens에 둔다

- 상태: 확정 (PRD v0.2 Q2, 2026-10-27)
- 날짜: 2026-10-27

## 맥락
mod를 spec-cycle 저장소 안의 하위 폴더에 둘지, 별도 저장소에 둘지 정해야 했다. PRD 원칙 P4는 "spec-cycle은 mod를
모른다"이고, 두 플러그인의 최소 Claude Code 버전이 다르다(spec-cycle 2.1.231, mod API 2.1.287).

## 결정
별도 저장소 `https://github.com/u-nae/spec-cycle-lens`(원격 생성 완료)에 둔다. 에이전트 권장안: 별도 저장소 (채택 여부: 채택)

## 대안
- spec-cycle 저장소의 `mods/lens/` 하위 폴더: 한 저장소에서 같이 고칠 수 있지만, spec-cycle 마켓플레이스가 mod의
  버전 요구를 끌어안게 되고 P4가 흐려진다.

## 영향
- spec-cycle 쪽 변경은 `status --json` 스냅숏 계약 하나로 끝난다. mod는 스냅숏 파일만 읽는다.
- 이 저장소의 README가 확인한 Claude Code 버전(2.1.311)을 명시한다.
