<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI components (shadcn/ui + Base UI)

The `apps/web` UI layer uses **shadcn/ui** with the **Base UI** implementation (`style: base-nova` in `components.json`). Primitives come from `@base-ui/react`; wrappers live under `src/components/ui/`.

When composing triggers and overlays, follow **Base UI** patterns (for example the `render` prop on `PopoverTrigger`, `TooltipTrigger`, etc.), not Radix-only APIs such as `asChild` unless a local wrapper explicitly documents it.

Workspace-wide UX and component rules for this stack are in `.cursor/rules/web-ui-ux-shadcn.mdc`.
