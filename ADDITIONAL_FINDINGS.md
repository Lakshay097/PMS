# Additional Findings During Code Quality Cleanup

## Secret Rotation Required

The following secrets were previously committed to git in commit `9c019e5a` (Sat Jun 20 12:30:47 2026):
- substitutions.txt contained real credentials
- substitutions.yaml contained real credentials

**Action Required**: Rotate these secrets immediately:
- Google Service Account credentials
- JWT_SECRET

These files have been removed from tracking in this cleanup, but the secrets remain in git history.
