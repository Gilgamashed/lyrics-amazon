import { LayoutPreset, LayoutPresetId } from '../types/lyrics';

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'compact',
    name: 'Compact',
    description: 'Narrow, dense surface for a small footprint.',
    width: 460,
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced width for everyday viewing.',
    width: 680,
  },
  {
    id: 'wide',
    name: 'Wide',
    description: 'Expansive surface for karaoke and full-sheet reading.',
    width: 900,
  },
];

export function layoutWidthFor(id: LayoutPresetId): number {
  return (LAYOUT_PRESETS.find((preset) => preset.id === id) ?? LAYOUT_PRESETS[1]).width;
}
