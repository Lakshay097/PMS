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
These items are being processed in Phase 3E.
