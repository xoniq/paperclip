# Custom Themes Directory

Place your custom `.css` stylesheets in this directory (or in `~/.paperclip/themes/`).
They will be automatically scanned by Paperclip and made selectable in **Settings → General → Themes & Custom Stylesheets**.

## Master Theme & Reference Template

Check out [`master-default.css`](./master-default.css) for the complete master theme stylesheet containing every available token in Paperclip:
- **Semantic color roles**: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- **Sidebar & navigation**: `--sidebar`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`
- **Status indicators**: `--status-agent-*`, `--status-task-*`, and high-contrast `--status-task-icon-*`
- **Chart palettes**: `--chart-1` through `--chart-5`
- **Agent capsule gradients**: `--agent-1a/b` through `--agent-10a/b`
- **Project & folder hues**: `--project-seed`, `--folder-color-*`
- **Geometry & typography**: `--radius`, `--font-sans`, `--font-mono`
- **Direct CSS component overrides**: sidebar, buttons, cards, inputs, scrollbars, dialogs

## CSS Format & Metadata Header

You can include an optional metadata header at the top of your `.css` file:

```css
/*
 * Name: My Custom Brand Theme
 * Description: High contrast theme tailored for custom branding
 * Author: Your Organization
 */

:root {
  --primary: #4f46e5;
  --ring: #6366f1;
  --radius: 0.5rem;
}

.dark {
  --background: #0b0f19;
  --foreground: #f1f5f9;
  --card: #111827;
  --primary: #8b5cf6;
  --sidebar: #0d121f;
}
```

