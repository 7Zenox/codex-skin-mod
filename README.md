# codex-skin

A Claude Code mod that makes the TUI look like OpenAI Codex's.

## What it changes

| Area | Result |
|---|---|
| Your messages | Shaded `#2A2A2A` block with a `›` prefix |
| Replies | `•` bullet, indented body, plain paragraphs fully justified |
| Bash | `• Ran <cmd>` / `└ output`, long output cut with `+ N lines` |
| Edit / Write | `• Edited path (+a -r)` with a unified diff |
| TodoWrite | `• Updated Plan` with `□` / `✔` items |
| Read / Grep / Glob groups | `• Explored` / `└ Read file` / `Search pattern` |
| Spacing | One blank line between blocks |
| Turn end | `Worked for 1m 26s • 9:09 PM` |
| Spinner word | `Working` |
| Footer | colored `model · cwd · repo`, hints on one row |
| Theme | **Codex** (ChatGPT blue accent, grey rules) |

## Install

Needs Claude Code 2.1.287 or later (mods).

```
/plugin marketplace add /path/to/codex-skin-mod
/plugin install codex-skin@codex-skin-mod
/reload-plugins
```

Then pick the theme: `/theme` → **Codex**.

Try it for one session without installing:

```
claude --plugin-dir /path/to/codex-skin-mod
```

## Limits (engine-owned, no mod or theme can change them)

- The startup header: mascot, version and model lines
- The composer's `❯` and its placeholder text (it can't be a filled block; only the rule colors change)
- The `▸▸ auto mode on` pill
- The `/resume` picker and the permission dialog
- The font, which your terminal draws

## Notes

- Justification covers paragraphs and list items, including `code`, **bold** and links. Tables, headings, quotes and fenced code keep the normal renderer.
- Wide characters (CJK, emoji) can make a justified line slightly off.
- The theme sets the session-color-independent rule colors. If the prompt rules are orange, clear the session color with `/color default`.
- Constants live at the top of `hooks/register.tsx` (`ACCENT`, `DIM`, `USER_BG`, `MAX_OUTPUT_LINES`, `MAX_GAP`).

## License

[MIT](LICENSE). Not affiliated with or endorsed by OpenAI or Anthropic.
