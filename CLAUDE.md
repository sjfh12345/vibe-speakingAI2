# CLAUDE.md

## 언어

- 모든 답변은 한국어(한글)로 작성한다.
- 코드, 명령어, 파일 경로, 에러 메시지 원문은 그대로 두되 설명은 한국어로 한다.

## 파일 생성 규칙

- 새 파일을 생성할 때는 첫 번째 줄에 프로젝트 루트 기준 파일 경로를 주석으로 남긴다.
  - 주석 문법은 파일 형식에 맞춘다.
    - JS/TS: `// src/lib/server/supabase.js`
    - Svelte/HTML: `<!-- src/routes/db-test/+page.svelte -->`
    - CSS: `/* src/routes/layout.css */`
    - SQL: `-- supabase/migrations/001_init.sql`
  - JSON처럼 주석을 지원하지 않는 파일은 예외로 한다.
