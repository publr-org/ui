export interface BoxControlPreviewOption {
  label: string;
  active: boolean | string;
}

export interface BoxControlPreviewRow {
  rangeIndex: number;
  rangeMax: number;
  thumbPosition: string;
  valueLabel: string;
  options: BoxControlPreviewOption[];
}

/** Align the visual thumb with the center of the native 16px range thumb. */
export function boxControlThumbPosition(index: number, max: number): string {
  const boundedMax = Math.max(1, max);
  const boundedIndex = Math.max(0, Math.min(boundedMax, index));
  return `calc(8px + (100% - 16px) * ${boundedIndex / boundedMax})`;
}

/** Apply the shared live-preview semantics used by shell and demo stores. */
export function previewBoxControlRow(row: BoxControlPreviewRow, index: number): void {
  const next = Math.max(0, Math.min(row.rangeMax, index));
  row.rangeIndex = next;
  row.thumbPosition = boxControlThumbPosition(next, row.rangeMax);
  row.valueLabel = next > 0 ? (row.options[next - 1]?.label ?? "None") : "None";
  row.options.forEach((option, optionIndex) => {
    option.active = next > 0 && optionIndex < next;
  });
}
