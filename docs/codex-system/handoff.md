# Vestora Handoff

Snapshot: 2026-10-16 after AWS rollout. Verify Git and live state before continuing.
Repository: C:/GitHub/Vestora, not the older OneDrive planning copy.

- Phase 9.6 implementation and local tests completed; [verification](../report/phase-09-6-verification.md).
- Source commit `f56ac76` and preceding implementation commits were pushed before deployment. Check Git for later documentation changes.
- AWS DB migration and API/worker rollout completed; [deployment evidence](../report/phase-09-6-aws-deployment.md).
- API revision 3 / worker revision 4; final snapshot: running 1 each, checkpoints 11926271 matched, lag 0.
- API URL at deployment: http://15.135.223.4:3001 (ephemeral; recheck before use).
- Next: update frontend API URL and restart/rebuild, then user-signed transaction verification with approval.
- Worker rollout briefly overlapped old/new revisions and was corrected. Keep desired count 0 until only the new deployment is stable, then scale to 1 separately; see [runbook](../roadmap/phases/phase-09-6-recovery-consistency.md).
- Preserve operating events/cursors and the retained RDS backup. Contracts settle; backend projects.
- Future cloud/DB changes and signing need approval. No automatic push or Obsidian commit.

Fresh-chat prompt:
"Work in C:/GitHub/Vestora. Read AGENTS.md and docs/codex-system/handoff.md.
Confirm current status, then help with <one bounded task>.
Do not change AWS or production DB without approval."
