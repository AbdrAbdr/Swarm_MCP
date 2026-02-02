# MCP Swarm Agent Rules

## CRITICAL: Always Start with MCP Swarm

Before ANY coding task, you MUST:

1. **Register yourself** - Call `agent_register` to get your unique agent name
2. **Check swarm status** - Call `swarm_stop_status` to ensure swarm is active
3. **Check task list** - Call `task_list` to see available tasks
4. **Reserve files** - Before editing any file, call `file_reserve` with your agent name

## Workflow Rules

### Starting Work
```
1. agent_register → Get your name (e.g., "RadiantWolf")
2. task_list → See what needs to be done
3. task_assign → Claim a task with your agent name
4. file_reserve → Lock files you'll edit (exclusive=true)
5. Do your work
6. file_release → Unlock files
7. task_mark_done → Complete the task
8. sync_with_base_branch → Rebase before push
9. create_github_pr → Open PR for review
```

### Collaboration Rules
- **Never edit files locked by another agent** - Check `list_file_locks` first
- **Broadcast important changes** - Use `broadcast_chat` to notify team
- **Request reviews** - Use `request_cross_agent_review` before finalizing
- **Share screenshots** - Use `share_screenshot` for visual issues
- **Log your reasoning** - Use `log_swarm_thought` to explain decisions

### Safety Rules
- **Dangerous actions require voting** - Use `start_voting` before deleting files/folders
- **Check main health** - Use `check_main_health` before rebasing
- **Signal dependency changes** - Use `signal_dependency_change` after adding packages

### Ghost Mode
When no tasks are assigned to you:
- Run `patrol_mode` to check for lint errors
- Help review other agents' code
- Optimize imports and formatting

## Available Tools
- Task: task_create, task_list, task_assign, task_set_status, task_mark_done, decompose_task
- Files: file_reserve, file_release, list_file_locks, forecast_file_touches
- Git: worktree_create, sync_with_base_branch, create_github_pr, auto_delete_merged_branch
- Collab: broadcast_chat, request_cross_agent_review, share_screenshot, log_swarm_thought
- Safety: start_voting, cast_vote, check_main_health, swarm_stop
- System: agent_register, scan_system_mcps, patrol_mode, request_platform_check
