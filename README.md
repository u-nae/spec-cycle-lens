# spec-cycle-lens

[spec-cycle](https://github.com/u-nae/spec-cycle) 프로젝트의 진행 상태를 Claude Code 화면 안에서 보여 주는
읽기 전용 mod입니다. 프롬프트 위 한 줄(band), `/lens` 패널, 다음 명령 제안, 판정 변경 토스트의 네 가지로
이루어져 있고, spec-cycle이 남기는 `.spec-cycle/status.json` 하나만 읽습니다.

이 mod는 프롬프트를 대신 제출하지 않고, 작업 항목 상태를 바꾸지 않으며, spec-cycle 파일을 쓰지 않습니다.
spec-cycle은 이 mod 없이도 이전과 똑같이 동작합니다.

- 확인한 환경: Claude Code 2.1.311 (mod API, early access), spec-cycle 0.4.0
- 요구 사항: Claude Code 2.1.287 이상, spec-cycle 0.4.0 이상

## 화면에서 보이는 것

**Band (프롬프트 위 한 줄).** 활성 작업 항목과 게이트 단계, revision 횟수, 완료 미터를 한 줄로 보여 줍니다.

```text
◇ W23 체크포인트 이미지 첨부  대기  ━━━━━━━─ 24/29 done
```

단계 칩은 `대기`, `작성/비평 중`, `REVISE r1/2`, `질문 1개`, `한도 도달`, `READY`, `입력 변경됨`, `구현 중 · cov 3/8`,
`완료`, `보류` 중 하나입니다. 스냅숏을 만든 뒤 기준 문서(PRD 등)가 바뀌면 `⚠ 스냅숏 오래됨`이 붙습니다.
터미널 폭이 좁으면 미터, 제목 순으로 줄여 그립니다. band를 누르면 패널이 열립니다.

**`/lens` 패널.** 탭 세 개입니다.

| 탭 | 키 | 내용 |
| --- | --- | --- |
| Items | `1` | 작업 항목 카드 목록. 카드를 누르면 선택, `p`는 선택 항목 고정/해제 |
| Run | `2` | 선택 항목의 run: route, revision, 비평 pass 수, 판정, findings 수, 미응답 질문(권장안과 근거), handoff 오류·경고, 테스트 커버리지 |
| Docs | `3` | run의 brief, handoff, spec 파일, 비평 보고, 결정 기록, verification. 누르면 패널 안에서 Markdown이나 코드로 읽고, `b` 뒤로, `c` 경로 복사, `o` 편집기 열기(설정 시) |

**다음 명령 제안.** 빈 프롬프트에 다음 spec-cycle 명령이 흐리게 보이고 Tab으로 가져옵니다. 입력 중에는
힌트 줄에 같은 명령이 붙습니다. 제안은 상태가 바뀔 때마다 한 번만 나오고 절대 자동 제출되지 않습니다.

| 상태 | 제안 |
| --- | --- |
| `.spec-cycle/config.yaml` 없음 | `/spec-cycle:init` |
| 작업 항목 없음 | `/spec-cycle:work-items` |
| 대기 중, run 없음 | `/spec-cycle:run <id>` |
| NEEDS_HUMAN (질문 있음) | `/spec-cycle:run <id>` (답한 뒤 다시 실행) |
| READY, handoff 사용 가능 | `/spec-cycle:implement <id>` |
| READY인데 입력이 바뀜 | `/spec-cycle:run <id>` |
| 구현 중 | `/spec-cycle:verify <id>` |
| 완료, 다음 후보 있음 | `/spec-cycle:run <다음 id>` |

**토스트.** 판정이 바뀔 때 한 번 알립니다. `W05 READY · /spec-cycle:implement W05`, `W05 질문 1개 · 권장안 A`,
`W05 revision 한도 도달`, `W05 완료 · 다음 W06`. 세션의 첫 읽기는 기준만 잡고 알리지 않습니다.

## 설치

spec-cycle이 먼저 설치되어 있어야 합니다. 둘 다 Claude Code 프롬프트에서 설치합니다. 마켓플레이스를 추가할지
물으면 `y`, 그다음 범위(user 권장)를 고릅니다.

```text
/plugin install spec-cycle --marketplace u-nae/spec-cycle
/plugin install spec-cycle-lens --marketplace u-nae/spec-cycle-lens
```

셸에서는 `claude plugin install spec-cycle-lens --marketplace u-nae/spec-cycle-lens`로 같은 일을 합니다.
데스크톱 앱에서는 프롬프트 옆 `+` → Plugins → Add marketplace에 `u-nae/spec-cycle-lens` → Add plugin입니다.

설치 뒤 새 세션을 열면 mod가 올라옵니다. 이미 열린 세션에서는 `/reload-plugins`를 치면 됩니다.

## 처음 쓰는 순서

1. spec-cycle을 쓰는 프로젝트 디렉터리에서 Claude Code를 엽니다.
   spec-cycle이 처음이면 band 대신 `/spec-cycle:init`이 제안되니 그것부터 실행합니다.
2. spec-cycle 0.4.0 이상의 명령을 하나 실행합니다(`/spec-cycle:run W01` 등). 상태를 바꾸는 모든 서브커맨드가
   끝날 때 `.spec-cycle/status.json`을 다시 씁니다. 이 파일이 생기면 band가 뜹니다.
   기존 프로젝트에서 지금 바로 만들려면 셸에서 한 번 실행합니다.

   ```sh
   node <spec-cycle 설치 경로>/scripts/spec-cycle.mjs status --json --write
   ```

3. 그 뒤로는 평소처럼 `run → implement → verify`를 돌립니다. 각 명령이 끝나는 턴에 band와 제안이 갱신됩니다.
4. 자세히 보려면 `/lens`를 치거나 band를 누릅니다.

`status.json`은 생성물이므로 `.gitignore`에 넣는 것을 권합니다. spec-cycle 0.4.0의 `init`이 안내하는
gitignore 목록에도 포함되어 있습니다.

## `/lens` 명령

| 명령 | 동작 |
| --- | --- |
| `/lens` | 패널을 엽니다 |
| `/lens pin W05` | band와 패널이 W05를 따라갑니다. 프로젝트별로 세션을 넘어 기억합니다 |
| `/lens unpin` | 고정을 풀고 다시 스냅숏의 활성 항목을 따릅니다 |
| `/lens refresh` | `status.json`을 다시 읽습니다. `specCycleScript`가 설정되어 있으면 먼저 `status --json --write`를 실행해 파일을 새로 만듭니다 |

활성 항목은 고정이 없을 때 run이 가장 최근인 `in-progress` → run이 있고 `done`이 아닌 항목(최근 갱신 순) →
의존성이 모두 끝난 첫 `pending` 순으로 고릅니다. 모두 `done`이면 band에 `모두 완료 n/n`이 뜹니다.

## 갱신 시점

mod는 파일을 감시하지 않고 다음 때에만 `status.json`을 읽습니다. 파일 크기와 수정 시각이 같으면 다시 파싱하지
않습니다.

- 세션 시작, 턴 종료
- 턴이 진행되는 동안 2초마다(명령이 끝나는 즉시 band가 바뀌도록)
- 1분마다(기준 문서가 바뀌었는지 확인해 `⚠ 스냅숏 오래됨` 표시)
- `/lens refresh`

## 설정 (`/config` 또는 `/plugin configure spec-cycle-lens@spec-cycle-lens`)

| 키 | 값 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `band` | `on`, `off` | `on` | 프롬프트 위 한 줄 |
| `suggest` | `on`, `off` | `on` | 다음 명령 제안 |
| `toasts` | `on`, `off` | `on` | 판정 변경 토스트 |
| `icons` | `unicode`, `nerd`, `emoji` | `unicode` | band와 패널의 글리프. Nerd Font를 쓰면 `nerd` |
| `snapshotPath` | 프로젝트 기준 상대 경로 | `.spec-cycle/status.json` | `config.yaml`이 같은 디렉터리에 있어야 합니다 |
| `openInEditor` | `off`, `auto`, `tmux-nvim` | `off` | Docs 탭의 `o`. `off`는 경로 복사만, `auto`는 창이 있는 `$VISUAL`/`$EDITOR` → `TERM_PROGRAM`에 맞는 `code`/`cursor` → macOS `open` 순, `tmux-nvim`은 새 tmux 창에 nvim |
| `specCycleScript` | `spec-cycle.mjs` 절대 경로 | 비움 | 설정하면 `/lens refresh`가 `node <경로> status --json --write`를 실행 |

기본값에서는 호스트에서 어떤 프로세스도 실행하지 않습니다. `openInEditor`를 `off` 외로 두거나 `specCycleScript`를
채울 때만 프로세스를 띄웁니다.

## 문제가 생기면

| 증상 | 확인할 것 |
| --- | --- |
| band가 안 보임 | `.spec-cycle/status.json`이 있는지. 없으면 spec-cycle 명령을 하나 실행하거나 위의 `status --json --write`를 돌립니다. `band`가 `off`인지도 확인 |
| `/spec-cycle:init`이 제안됨 | 프로젝트에 `.spec-cycle/config.yaml`이 없는 상태입니다. spec-cycle을 쓰지 않는 프로젝트라면 `suggest`를 `off`로 두면 됩니다 |
| `spec-cycle: 스냅숏 없음 · /lens refresh` | `config.yaml`은 있는데 `status.json`이 없습니다. spec-cycle 0.4.0 미만이면 올린 뒤 명령을 한 번 실행합니다 |
| `⚠ 스냅숏 오래됨` | 스냅숏 뒤에 PRD 같은 기준 문서가 바뀌었습니다. 다음 spec-cycle 명령이 끝나면 사라집니다. `/lens refresh`로 지금 지울 수도 있습니다 |
| 명령이 끝났는데 band가 그대로 | 턴 종료 시 다시 읽습니다. 바로 보려면 `/lens refresh` |
| 패널이 너무 좁음 | 패널은 터미널 폭에 맞춰 카드 테두리와 세부 줄을 생략합니다. 창을 넓히거나 데스크톱 앱에서 쓰면 전부 보입니다 |
| 수정한 mod가 반영 안 됨 | `/reload-plugins` 또는 새 세션 |

## 개발

소스 폴더를 바로 붙여 실행합니다.

```sh
claude --plugin-dir /path/to/spec-cycle-lens
```

검사는 다음 세 가지입니다.

```sh
claude plugin validate . --strict   # gatingHooks가 비어 있어야 함. process.run/env.get은 openInEditor·specCycleScript 뒤에만 나타남
claude plugin test .                # 모듈마다 테스트 파일 하나
tsc -p .                            # 세션이 mod를 한 번 올리면 .claude-plugin/types/ 아래에 타입이 깔림
```

```text
hooks/register.tsx    이벤트·타이머·/lens 명령 배선
hooks/host.ts         $ 호출 (fs 포트, pin 저장)
hooks/snapshot.ts     status.json 읽기: 파싱, mtime:size 캐시, 오래됨 판정
hooks/active.ts       활성 항목 선택 (PRD 6.1)
hooks/next-command.ts 다음 명령 표 (PRD 6.2)
hooks/band.tsx        band 모델과 폭 맞춤
hooks/pane.tsx        Items·Run·Docs 탭
hooks/transitions.ts  판정 변경 → 토스트 (PRD 6.7)
hooks/editor.ts       편집기 후보 (PRD 6.8)
hooks/icons.ts, hooks/text.ts
docs/decisions/       0001-0006, PRD에서 확정한 선택
```

설계 문서는 spec-cycle 저장소의 `docs/superpowers/specs/2026-10-27-spec-cycle-lens-prd.md`입니다.
2·3단계(인수 기준 A11-A20, Docs 탭, 토스트, 편집기, 스크립트를 쓰는 `/lens refresh`)까지 들어 있고,
4단계(편집 가드, 후보 목록 밖의 `tmux-nvim`, prismantis)는 결정 기록을 기다립니다.

## 라이선스

MIT
