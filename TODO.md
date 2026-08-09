# TaskDrawer Dark Mode Fix - TODO

## Plan Steps

- [x] `src/components/features/tasks/TaskDrawer.tsx`
  - [x] Import `useTheme` from `'../../../contexts/ThemeContext'`
  - [x] Replace the `isDarkMode` prop with `const { isDarkMode } = useTheme();` inside the component body
  - [x] Remove `isDarkMode?: boolean;` from the `TaskDrawerProps` interface
  - [x] Remove `isDarkMode = false` from the destructured parameters

## Refactor: Use Semantic Design Tokens

- [ ] `src/components/features/tasks/TaskDrawer.tsx`
  - [ ] Replace hardcoded `bg-[#0F141F]`, `bg-[#1E293B]`, `bg-slate-XXX` with semantic tokens (`bg-surface`, `bg-surface-1`, `bg-surface-2`, `bg-app`)
  - [ ] Replace hardcoded `text-slate-XXX`, `text-[#64748B]` etc. with semantic text tokens (`text-primary`, `text-secondary`, `text-muted`)
  - [ ] Replace hardcoded `border-[#XXX]`, `border-slate-XXX` with `border-token` / `border-token-strong`
  - [ ] Remove `isDarkMode ?` ternaries where semantic tokens handle both themes automatically
  - [ ] Keep `isDarkMode` only for status/priority badges that need distinct transparent treatment

## Followup Steps

- [ ] Verify the changes compile correctly (`npx tsc --noEmit`)
- [ ] Test the TaskDrawer in both light and dark modes
