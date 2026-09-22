// The design system's icon adapter: the shared package, re-exported by path.
// Every icon is a `<use>` into the page's sprite, which the server writes and
// the browser extends; see ../../icons/README.md.
import { ICONS as SHARED_ICONS } from "../../icons/src/index.ts";

export { ICON_VIEWBOX, ensureIcon, icon, iconSvg, sprite } from "../../icons/src/index.ts";

export const ICONS = { ...SHARED_ICONS } as const;
export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS).sort((a, b) => a.localeCompare(b)) as IconName[];
