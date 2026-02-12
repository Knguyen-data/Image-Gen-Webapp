# Git Branch Strategy

## Active Branches

### Production & Deployment
- **master** - Main production branch, stable releases
- **deploy/comfyui-v2-final** - ComfyUI worker v2 deployment branch (current active development)

### Feature Branches
- **feat/opencut-editor** - OpenCut video editor integration

### Experimental Branches
- **spicy_mode** - Spicy mode feature experimentation
- **spicy_mode_video_gen** - Spicy mode video generation variant

## Remote Branches
- **origin/main** - Remote main branch
- **origin/master** - Remote production branch
- **origin/deploy/comfyui-v2-final** - Remote deployment branch
- **origin/spicy_mode** - Remote experimental branch
- **origin/spicy_mode_video_gen** - Remote experimental branch

## Branch Cleanup History (2026-02-12)

### Deleted Branches
Removed 19 stale/obsolete branches:

**Backup branches:**
- backup/unified-video-types-with-wan

**Cascade/temporary branches:**
- cascade/workspace-c-users-ikiuc-clawd-1-enable-4566bf
- cascade/workspace-c-users-ikiuc-clawd-1-enable-b54b0a
- cascade/workspace-c-users-ikiuc-clawd-1-enable-e7c41d

**Copilot branches:**
- copilot/vscode-mlhe10nx-iry6
- copilot/vscode-mlhe1rh4-53wr

**Deployment branches:**
- deploy/comfyui-v2-clean (superseded by v2-final)

**Feature branches:**
- feat/ui-theme-upgrade
- feat/unified-video-gallery
- feat/unified-video-system
- feat/unified-video-types
- feat/test-file
- feature/comfyui-worker-v2
- feature/ui-redesign
- feature/ui-wireframe

**Fix branches:**
- fix/indexeddb-compat
- fix/comfyui-worker-sync

**Refactor branches:**
- refactor/folder-structure

**WIP branches:**
- wip-veo3-amt-features

### Worktrees Removed
All worktrees removed and pruned:
- C:/etc/passwd/Image Gen Webapp-test-file
- C:/Users/ikiuc/.windsurf/worktrees/... (2 cascade worktrees)
- C:/Users/ikiuc/Documents/webapp-bugfix
- C:/Users/ikiuc/Documents/webapp-wireframe

## Workflow Guidelines

### Creating New Branches
- Use conventional naming: `feat/`, `fix/`, `refactor/`, `docs/`
- Create from master for production features
- Create from deploy/* for deployment-specific work

### Merging Strategy
- Feature branches merge to master via PR
- Deploy branches sync with master regularly
- Experimental branches (spicy_mode) remain isolated

### Branch Lifecycle
- Delete branches after successful merge
- Keep deploy branches until fully deployed
- Archive experimental branches if successful

## Notes
- No worktrees currently in use
- All development happens in main repository
- Clean state: no uncommitted changes
