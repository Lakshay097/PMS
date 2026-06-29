# Additional Findings During Code Quality Cleanup

## Secret Rotation Required

The following secrets were previously committed to git in commit `9c019e5a` (Sat Jun 20 12:30:47 2026):
- substitutions.txt contained real credentials
- substitutions.yaml contained real credentials

**Action Required**: Rotate these secrets immediately:
- Google Service Account credentials
- JWT_SECRET

These files have been removed from tracking in this cleanup, but the secrets remain in git history.

## Phase 3D - ErrorBoundary @ts-ignore (ID-025)
**Status: SKIPPED - Flagged for human review**

The ErrorBoundary.tsx file has 4 @ts-ignore suppressions related to React 19 class component type definitions. Attempting to remove them causes TypeScript errors because React 19 changed class component types and the current type definitions don't properly support the pattern used.

The proper fix requires:
1. Researching the correct React 19 class component type pattern
2. Updating the interface definitions to match React 19's expectations
3. Testing that the ErrorBoundary still works correctly

This is a delicate fix that requires deeper investigation into React 19 type changes. Flagged for human review.

## Phase 3E - Repeated Logic (ID-030, ID-031, ID-033, ID-034, ID-037)

### ID-034 - Unified role-based task filtering
**Status: SKIPPED - Flagged for human review (HIGH RISK)**

Per previous analysis, there are two getFilteredTasks implementations:
- src/utils/taskUtils.ts: Simple filter by status, priority, search
- src/App.tsx: Complex role-based visibility filter with overdue state derivation, active/deleted status checks, and hierarchical subordinate logic

These serve different purposes and should NOT be consolidated without careful human review. This is a high-risk refactoring that could break role-based access control.

### ID-030, ID-037 - Centralize Google Sheets token error handling
**Status: SKIPPED - Flagged for human review (MEDIUM RISK)**

The `generateGoogleSheetsToken()` function is called in 15+ locations across the codebase. Each location has slightly different error handling:
- Some return false
- Some return null
- Some throw InternalServerError
- Some return early with no value

Centralizing this would require creating a wrapper function that can handle all these different error scenarios, which could introduce subtle bugs. The current pattern, while repetitive, is explicit and context-appropriate. This refactoring should be done with careful human review to ensure all error cases are handled correctly.
