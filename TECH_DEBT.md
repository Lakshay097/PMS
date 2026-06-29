# Technical debt log

## TD-001
File: src/lib/dbService.ts (lines 4-6)
Issue: All writes happen client-side via dbService directly to Google Sheets. Ideal architecture would have server-side controllers handling writes and broadcasting SSE events. Deferred — requires full API layer refactor.
Priority: Medium

## TD-002
File: src/lib/dbService.ts (lines 8-9)
Issue: syncQueue.ts is implemented but not integrated. Wire into dbService.ts write failures for retry on network errors.
Priority: Low

## TD-003
File: src/App.tsx (lines 75-77)
Issue: Main bundle still 407kb (gzip 127kb). Run npx vite-bundle-visualizer and inspect index chunk for large deps that could be lazy loaded or replaced.
Priority: Low
