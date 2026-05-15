export interface SectionDraft {
  id: string;
  isNew: boolean;
  code: string;
  name: string;
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
  rotation: number;
  total_bays: number;
  total_levels: number;
  color: string;
  sort_order: number;
}

export interface DetectedSection {
  code: string;
  name: string;
  x: number; // 0-1 ratio
  y: number;
  width: number;
  height: number;
  approximate_bays: number;
  approximate_levels: number;
}
