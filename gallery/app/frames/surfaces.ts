import type { PreviewSurface } from "../../gallery-types";

export const PREVIEW_SURFACE_CLASSES: Record<PreviewSurface, string> = {
  toolbar: "flex min-h-16 w-full max-w-[640px] items-center px-4",
  inspector: "w-[320px] max-w-full p-4",
  canvas: "min-h-64 w-full max-w-[680px] p-8",
  overlay: "w-[320px] max-w-full p-4 shadow-xl",
  demo: "min-h-32 w-full max-w-[680px] p-6",
};

export const PREVIEW_SURFACE_WIDTHS: Record<PreviewSurface, string> = {
  toolbar: "max-w-[640px]",
  inspector: "max-w-[320px]",
  canvas: "max-w-[680px]",
  overlay: "max-w-[320px]",
  demo: "max-w-[680px]",
};

export const HOVER_PREVIEW_SURFACE_CLASSES: Record<PreviewSurface, string> = {
  toolbar: "flex min-h-16 w-[320px] items-center px-4",
  inspector: "w-[320px] p-4",
  canvas: "flex min-h-32 w-[320px] items-center p-4",
  overlay: "w-[320px] p-4 shadow-xl",
  demo: "flex min-h-24 w-[320px] items-center p-4",
};

export const PREVIEW_SURFACE_INITIAL_HEIGHTS: Record<PreviewSurface, number> = {
  toolbar: 64,
  inspector: 96,
  canvas: 256,
  overlay: 240,
  demo: 160,
};

export const HOVER_PREVIEW_SURFACE_INITIAL_HEIGHTS: Record<PreviewSurface, number> = {
  toolbar: 64,
  inspector: 96,
  canvas: 128,
  overlay: 240,
  demo: 120,
};
