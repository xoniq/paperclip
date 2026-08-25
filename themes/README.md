# Custom Themes Directory

Place your custom `.css` stylesheets in this directory (or in `~/.paperclip/themes/`).
They will be automatically scanned by Paperclip and made selectable in **Settings → General → Themes & Custom Stylesheets**.

## CSS Format & Metadata Header

You can include an optional metadata header at the top of your `.css` file:

```css
/*
 * Name: My Custom Brand Theme
 * Description: High contrast theme tailored for custom branding
 * Author: Your Organization
 */

:root, .dark {
  --background: #0d1117;
  --foreground: #c9d1d9;
  --card: #161b22;
  --card-foreground: #c9d1d9;
  --popover: #161b22;
  --popover-foreground: #c9d1d9;
  --primary: #58a6ff;
  --primary-foreground: #0d1117;
  --secondary: #21262d;
  --secondary-foreground: #c9d1d9;
  --muted: #21262d;
  --muted-foreground: #8b949e;
  --accent: #1f6feb;
  --accent-foreground: #f0f6fc;
  --destructive: #f85149;
  --destructive-foreground: #ffffff;
  --border: #30363d;
  --input: #30363d;
  --ring: #58a6ff;
  --sidebar: #010409;
  --sidebar-foreground: #c9d1d9;
  --sidebar-primary: #58a6ff;
  --sidebar-primary-foreground: #0d1117;
  --sidebar-accent: #21262d;
  --sidebar-accent-foreground: #c9d1d9;
  --sidebar-border: #30363d;
}
```
