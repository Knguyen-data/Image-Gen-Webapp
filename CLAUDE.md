# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `./.claude/rules/primary-workflow.md`
- Development rules: `./.claude/rules/development-rules.md`
- Orchestration protocols: `./.claude/rules/orchestration-protocol.md`
- Documentation management: `./.claude/rules/documentation-management.md`
- And other workflows: `./.claude/rules/*`

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** You must follow strictly the development rules in `./.claude/rules/development-rules.md` file.
**IMPORTANT:** Before you plan or proceed any implementation, always read the `./README.md` file first to get context.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.

## Hook Response Protocol

### Privacy Block Hook (`@@PRIVACY_PROMPT@@`)

When a tool call is blocked by the privacy-block hook, the output contains a JSON marker between `@@PRIVACY_PROMPT_START@@` and `@@PRIVACY_PROMPT_END@@`. **You MUST use the `AskUserQuestion` tool** to get proper user approval.

**Required Flow:**

1. Parse the JSON from the hook output
2. Use `AskUserQuestion` with the question data from the JSON
3. Based on user's selection:
   - **"Yes, approve access"** → Use `bash cat "filepath"` to read the file (bash is auto-approved)
   - **"No, skip this file"** → Continue without accessing the file

**Example AskUserQuestion call:**
```json
{
  "questions": [{
    "question": "I need to read \".env\" which may contain sensitive data. Do you approve?",
    "header": "File Access",
    "options": [
      { "label": "Yes, approve access", "description": "Allow reading .env this time" },
      { "label": "No, skip this file", "description": "Continue without accessing this file" }
    ],
    "multiSelect": false
  }]
}
```

**IMPORTANT:** Always ask the user via `AskUserQuestion` first. Never try to work around the privacy block without explicit user approval.

## Python Scripts (Skills)

When running Python scripts from `.claude/skills/`, use the venv Python interpreter:
- **Linux/macOS:** `.claude/skills/.venv/bin/python3 scripts/xxx.py`
- **Windows:** `.claude\skills\.venv\Scripts\python.exe scripts\xxx.py`

This ensures packages installed by `install.sh` (google-genai, pypdf, etc.) are available.

**IMPORTANT:** When scripts of skills failed, don't stop, try to fix them directly.

## [IMPORTANT] Consider Modularization
- If a code file exceeds 200 lines of code, consider modularizing it
- Check existing modules before creating new
- Analyze logical separation boundaries (functions, classes, concerns)
- Use kebab-case naming with long descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)
- Write descriptive code comments
- After modularization, continue with main task
- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./CLAUDE.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*

## Context Management (MANDATORY FIRST STEP)

**⚠️ CRITICAL REQUIREMENT - READ BEFORE ANY WORK:**

Before starting ANY task, you MUST complete these context management steps IN ORDER:

### Step 1: Read Existing Context (MANDATORY)
```bash
# ALWAYS run these commands FIRST, before doing anything else:
bd ready                    # Check available Beads tasks
mcp__memora__memory_list limit=10           # Recent memories
mcp__memora__memory_semantic_search query="current task"  # Find relevant context
```

**Purpose:** Understand existing work, avoid duplicates, maintain continuity.

### Step 2: Create/Update Task Tracking (MANDATORY)
```bash
# For NEW work - create Beads task BEFORE implementing:
bd create "Task title" --priority P2 --description "Detailed description"

# For EXISTING task - update status BEFORE starting:
bd update <id> --status in_progress

# Also checkpoint in Memora:
mcp__memora__memory_create content="ACTIVE TASK: <goal>, <context>, <decisions>"
```

**Purpose:** Track work across sessions, enable collaboration.

### Step 3: Execute Work
Now proceed with the actual task implementation.

### Step 4: Update Context After Work (MANDATORY)
```bash
# After completing ANY significant work, update BOTH systems:

# 1. Store learnings/decisions in Memora
mcp__memora__memory_create content="<what was done, decisions made, files changed>"

# 2. Close Beads task and sync
bd close <id> --reason "Completed: <summary>"
bd sync                          # Persist to .beads/issues.jsonl
```

**Purpose:** Preserve knowledge for future sessions, track completion.

---

## Context Management Rules (STRICTLY ENFORCED)

**MANDATORY BEHAVIORS:**

1. **Every user prompt triggers context check:**
   - Run `bd ready` + `mcp__memora__memory_list limit=10` FIRST
   - Even for small fixes, UI tweaks, or documentation updates
   - No exceptions - this is NON-NEGOTIABLE

2. **Every task gets a Beads issue:**
   - Create issue BEFORE starting work
   - Update description with implementation details
   - Close with detailed completion summary
   - Run `bd sync` after every update

3. **Every completion stores to Memora:**
   - Create memory with what was done, decisions, files changed
   - Use `mcp__memora__memory_create` for new knowledge
   - Use `mcp__memora__memory_update` to update existing memories
   - Use `mcp__memora__memory_create_todo` for open tasks

4. **Never skip context management:**
   - Even if user says "quick fix" or "just a small change"
   - Even if you think the change is trivial
   - Even if you're in the middle of other work
   - ALWAYS update both Beads and Memora

**VIOLATION CONSEQUENCES:**
- Lost work context across sessions
- Duplicate efforts
- Forgotten edge cases
- Broken team collaboration
- User frustration from repeated questions

---

## Session Workflow (ENFORCED ORDER)

```
┌─────────────────────────────────────────┐
│ 1. USER SENDS PROMPT                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 2. MANDATORY: Read Context              │
│    - bd ready                           │
│    - mcp__memora__memory_list limit=10  │
│    - mcp__memora__memory_semantic_search │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 3. MANDATORY: Create/Update Task        │
│    - bd create (new) OR                 │
│    - bd update <id> --status in_progress│
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 4. Execute Implementation               │
│    - Code changes                       │
│    - Tests                              │
│    - Documentation                      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ 5. MANDATORY: Update Context            │
│    - mcp__memora__memory_create          │
│    - bd close <id> --reason "..."       │
│    - bd sync                            │
└─────────────────────────────────────────┘
```

**This workflow is MANDATORY for EVERY user interaction.**

---

## Beads (Persistent Task Tracking)

**Essential Commands:**
```bash
bd ready                                  # List tasks with no blockers
bd list --all                             # List all including closed
bd create "Title" --priority P2           # Create (P0=critical, P4=low)
bd show <id>                              # View task details
bd update <id> --status in_progress       # Update status
bd update <id> --description "..."        # Update description
bd close <id> --reason "Completed: ..."   # Close with summary
bd sync                                   # Commit and persist
```

**Rules:**
- NEVER use `bd edit` (requires interactive editor)
- ALWAYS run `bd sync` after updates
- ALWAYS include detailed descriptions
- ALWAYS close with completion summary

---

## Memora (Persistent Memory - Cloud)

**Memora** is the primary memory system backed by Cloudflare D1 with OpenAI embeddings.

**Essential Operations:**
```bash
mcp__memora__memory_list limit=10                    # Recent memories
mcp__memora__memory_semantic_search query="..."       # Semantic search
mcp__memora__memory_hybrid_search query="..."         # Keyword + semantic
mcp__memora__memory_create content="..."              # Store new memory
mcp__memora__memory_update memory_id=X content="..."  # Update existing
mcp__memora__memory_create_todo content="..." priority=high  # Create TODO
mcp__memora__memory_create_issue content="..." severity=major  # Create issue
mcp__memora__memory_find_duplicates                   # Find duplicates
mcp__memora__memory_insights period=7d                # Get insights
```

**Best Practices:**
- Store decisions, architecture notes, and learnings
- Create TODOs for pending work
- Search before creating to avoid duplicates
- Update memories when context changes
- Use semantic search to find related context

---

## Task Management Systems

| System | Scope | Persistence | Use For |
|--------|-------|-------------|---------|
| **Claude Code Tasks** (TodoWrite) | Current session | Ephemeral - lost when session ends | Intra-session progress tracking |
| **Beads** (`bd` CLI) | Cross-session | Persistent in `.beads/` | Cross-session tasks, collaboration |
| **Memora** (MCP) | Project-wide | Persistent in Cloudflare D1 | Project knowledge, decisions, architecture |

**Use ALL THREE systems appropriately:**
- TodoWrite: For breaking down current work into steps
- Beads: For tracking tasks across sessions
- Memora: For preserving project knowledge