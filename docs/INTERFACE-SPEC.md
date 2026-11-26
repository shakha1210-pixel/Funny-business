# Funny Business Interface Specification

Status: Draft — implementation follows the domain and interaction contracts below.

## Product intent

Rebuild the useful interaction model of a modern AI workspace while keeping Funny Business visually and structurally independent. The interface is a client of host-owned domain services; it must not become the owner of Workspace, filesystem, Session, or permission state.

## Primary application frame

- **Left rail:** global navigation for Workspaces, repositories, models, notebooks, extensions, and settings. Keep it compact and persistent.
- **Workspace navigator:** switch between workspaces, inspect attached repositories/projects, browse Sessions, search, pin, and archive. Manual Workspace order is distinct from recent activity.
- **Main work surface:** the active artifact or task. It may host files, diffs, notebooks, terminal output, previews, or a welcome/overview state.
- **Agent panel:** conversation and task execution associated with the selected Workspace. Show task state, tool activity, approvals, and outputs as structured events rather than a single opaque spinner.
- **Bottom utility area:** terminal, logs, diagnostics, and background task status. It must be collapsible and must not steal focus unexpectedly.

## Core interaction flows

### First launch
1. Explain local-first behavior and the permission model.
2. Offer to create a Workspace, open an existing folder, or connect a repository.
3. Ask for folder access only when the user chooses a folder; do not scan the whole machine.
4. Show an empty-state overview with clear next actions.

### Workspace switching
1. Present title and optional repository/path context.
2. Switching changes the active Workspace context, not the user's filesystem permissions.
3. Preserve independent navigation state where useful.
4. Keep Session order stable unless the user explicitly changes it; recency is a separate sort mode.

### Workspace management
- Create from an existing directory.
- Rename, pin, archive, unarchive, and unregister.
- Unregister must clearly state that it removes the Workspace record only; it does not delete project files or Session history.
- Show empty, loading, error, and permission-revoked states explicitly.

### Agent and tool activity
- Display the current task, elapsed state, tool name, resource scope, and whether approval is required.
- Destructive/external actions require explicit approval.
- Permission loss must reconcile the visible Workspace state; never silently imply that data was deleted.
- Cancellation must be available for long-running operations and reflected in the UI.

## State ownership

| Concern | Owner |
|---|---|
| Workspace identity, canonical path, Session membership | Host Workspace Registry |
| Files and file versions | Filesystem provider |
| Access grants and revocation | Permission broker |
| Process/notebook isolation | Sandbox supervisor |
| Navigation, expanded tree, selected tab | UI client |
| Search results and grouped/flat views | Derived UI projection |
| Session metadata and lifecycle | Host Session Registry |
| Conversation/task execution | Agent runtime (not implemented) |

The UI may cache and project host state but must not invent authoritative state or bypass access checks.

## Visual direction

- Dark-first neutral workspace with restrained accent color.
- Dense but readable developer-tool layout; prioritize information hierarchy over decoration.
- Clear active/hover/focus states and keyboard navigation.
- Consistent spacing, typography, iconography, and semantic status colors.
- Responsive behavior: collapsible navigation and agent panel on narrow screens.
- Accessibility: semantic controls, visible focus, sufficient contrast, reduced-motion support.

## Non-goals for the first UI milestone

- No unrestricted shell or filesystem access.
- No arbitrary plugin execution in the renderer.
- No hard dependency on a native directory picker; it is an optional host capability.
- No desktop-shell decision until a working UI/domain prototype provides evidence.

## First implementation milestones

1. Workspace Registry domain contract and tests. (Implemented)
2. Durable atomic JSON snapshot adapter. (Initial implementation; migration journal and cross-process locking remain open)
3. Loopback host API for Workspace list/create/rename/unregister. (Implemented)
4. Responsive UI shell and Workspace registration/list integration. (Prototype implemented)
5. Session list/create/resume navigation backed by host metadata. (Prototype implemented; selected state is in-memory; live updates now arrive through a reconnecting host event stream)
6. Add filesystem tree and agent activity only after permission and cancellation contracts exist.
