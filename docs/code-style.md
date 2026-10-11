# Code style

Conventions for TypeScript and SolidJS code. Formatting is left to Prettier.

## File order

1. File header
2. Imports: external packages, types, constants, components, utils, styles
3. Exported constants
4. Local types, constants and functions
5. Exported functions

## TypeScript

- Avoid `any`; use unions and generics.
- Prefer `interface` for object shapes, and `type` only where an interface can't express
  the shape.
- Type components as `Component<Props>`.

## SolidJS

- Use fine-grained reactivity (`createSignal`, `createMemo`, `createEffect`), and keep
  side effects out of render functions.
- Avoid refs unless no signal-based alternative exists.
- Clean up timers, workers and listeners with `onCleanup`.

## Ark UI and icons

- Use `@ark-ui/solid` for behaviour such as focus traps, keyboard navigation and ARIA
  rather than hand-rolling it. Style its parts with classes and theme mixins, never with
  Ark's inline `style` props.
- Wrap a primitive used in more than one place in a component (usually under
  `src/components/common/`) rather than importing Ark parts ad hoc.
- Take icons from `lucide-solid`, imported individually. Size and colour them from CSS
  (`currentColor`), not with `size`/`stroke` props.

## Browser storage

- Use `localStorage`, with every JSON parse and serialise in try/catch.
- Put a schema `version` in stored JSON so it can be migrated.
- Exports are `.json` files with ISO timestamps.
