# Workspace Project Rules — ATLAS

- **Commit & Redeploy Policy:** Do not automatically commit or push code changes to remote unless explicitly requested by the user.
- **Workflow & Execution Optimization:**
  - Before making changes, identify only the files directly related to the user's request.
  - Avoid repeatedly scanning the entire project, unnecessary research, excessive explanations, redundant tool calls, and unrelated modifications.
  - Reuse information from previous code inspections whenever possible.
  - Make targeted surgical edits instead of rewriting large sections of code.
  - Run only essential checks relevant to the modified files; avoid unnecessary builds or full test runs unless required to verify the changes.
  - Maintain all existing ATLAS functionality, scheduling rules, database integrity, and UI design.
  - Prioritize implementing requested changes over lengthy planning and analysis.
  - After completing each task, provide only a brief summary of what was changed and any unresolved issues.
