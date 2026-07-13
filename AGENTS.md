# AGENTS.md — Bot Zalo

> 3 quy tắc cho mọi task: (1) check env trước khi sửa code, (2) push `origin main` sau khi validate (an toàn, không force-push, không push `bun.lock`/`.env`), (3) update `README.md` trước khi push.

---

## Rule #1 — Env check

```bash
which bun || npm install -g bun
cd apps/bot && npx --no-install tsc --version 2>/dev/null || npm install --save-dev typescript
node --version
ls apps/bot/node_modules/@google/genai/dist/genai.d.ts
cd apps/bot && npx tsc --noEmit 2>&1 | tail -5
```

| Thiếu | Cài |
|---|---|
| `bun` | `npm install -g bun` |
| `tsc` | `cd apps/bot && npm install --save-dev typescript` |
| `biome` | `cd apps/bot && npm install --save-dev @biomejs/biome` |
| test deps | `bun install` |

---

## Rule #2 — Auto-push toàn bộ

Sau khi sửa code/doc và validate xong → commit + push `origin main`:

```bash
cd /workspaces/botzalo
git config user.email >/dev/null || { echo "❌ no email — STOP, ask user"; exit 1; }
git config user.name  >/dev/null || { echo "❌ no name — STOP, ask user"; exit 1; }
git remote -v | grep -q origin || { echo "❌ no origin — STOP"; exit 1; }
git pull --rebase origin main 2>/dev/null || { git rebase --abort 2>/dev/null || true; }
git add -A
git diff --cached --name-only | grep -q '^bun\.lock$' && git restore --staged bun.lock
leaked=$(git diff --cached --name-only | grep -E '(\.env($|\.)|/secrets?(/|$)|\.secret($|\.)|\.key($|\.))' || true)
[ -n "$leaked" ] && { echo "❌ secret staged — STOP"; echo "$leaked"; exit 1; }
git commit -m "<type(scope)>: <summary>" -m "<body what+why>"
git push origin main || { echo "❌ push failed (no force-push) — STOP"; exit 1; }
```

**Push**: source code, doc, config. **Không push**: `bun.lock`, `.env`, bất cứ file nào match `\.env|/secrets?/|\.secret|\.key`.

Safety: NO force-push, NO fake identity, skip khi user nói "stay local", STOP nếu non-fast-forward.

---

## Rule #3 — README-first

**Update `README.md` trước khi push** (README = source-of-truth). Không tạo `.md` mới khi README đã cover.

Update README khi đổi: module/tool/env var, status dự án, file `.github/*`, page dashboard, table DB, header/footer tone.

**Order**: change → validate → update README → check orphan refs + file integrity → Rule #2 push.

Bỏ qua README update cho: refactor nội bộ, tests, `bun.lock`, build/CI, meta-docs (`AGENTS.md` chính nó).
