export type IconName =
  | 'plus'
  | 'search'
  | 'settings'
  | 'image'
  | 'eye'
  | 'eye-off'
  | 'close'
  | 'more'
  | 'trash'
  | 'edit'
  | 'upload'
  | 'download'
  | 'folder'
  | 'check'
  | 'refresh'
  | 'layers'
  | 'inbox'
  | 'todo'
  | 'note'
  | 'timer'
  | 'flag'
  | 'external'
  | 'copy'
  | 'chevron-left'
  | 'chevron-right'
  /* 以下同时作为分组图标使用，id 与 GroupIconId 一一对应 */
  | 'grid'
  | 'star'
  | 'briefcase'
  | 'code'
  | 'terminal'
  | 'book'
  | 'film'
  | 'music'
  | 'game'
  | 'shopping'
  | 'heart'
  | 'home'
  | 'flask'
  | 'palette'
  | 'globe'
  | 'coffee'
  | 'plane'
  | 'camera'
  | 'wallet'
  | 'chat';

interface IconDef {
  paths?: string[];
  circles?: { cx: number; cy: number; r: number }[];
  rects?: { x: number; y: number; w: number; h: number; rx?: number }[];
}

/** 白名单式图标库：只有这里的静态路径会被绘制，不存在任何动态 HTML 注入 */
const ICONS: Record<IconName, IconDef> = {
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  search: { paths: ['M20 20l-3.6-3.6'], circles: [{ cx: 11, cy: 11, r: 7 }] },
  settings: {
    paths: ['M4 7h10', 'M18 7h2', 'M4 12h4', 'M12 12h8', 'M4 17h13', 'M21 17h-1'],
    circles: [
      { cx: 16, cy: 7, r: 2 },
      { cx: 10, cy: 12, r: 2 },
      { cx: 19, cy: 17, r: 2 },
    ],
  },
  image: {
    paths: ['M4 16l4.5-4.5 3.5 3.5 3-3L20 16'],
    circles: [{ cx: 8.5, cy: 8.5, r: 1.5 }],
    rects: [{ x: 3, y: 5, w: 18, h: 14, rx: 3 }],
  },
  eye: {
    paths: ['M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z'],
    circles: [{ cx: 12, cy: 12, r: 2.8 }],
  },
  'eye-off': {
    paths: [
      'M4 4l16 16',
      'M9.8 9.9A3 3 0 0 0 12 15c.9 0 1.7-.4 2.3-1.1',
      'M6.4 6.7C4.3 8 2.5 12 2.5 12s3.5 5.5 9.5 5.5c1.5 0 2.9-.4 4.1-1.1',
      'M17.6 15.3c2-1.4 3.9-3.3 3.9-3.3S18 6.5 12 6.5c-.7 0-1.4.1-2 .3',
    ],
  },
  close: { paths: ['M6 6l12 12', 'M18 6L6 18'] },
  more: {
    circles: [
      { cx: 5, cy: 12, r: 1.4 },
      { cx: 12, cy: 12, r: 1.4 },
      { cx: 19, cy: 12, r: 1.4 },
    ],
  },
  trash: {
    paths: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  },
  edit: { paths: ['M4 20h4L20 8l-4-4L4 16v4z', 'M14.5 5.5l4 4'] },
  upload: { paths: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 17v3h16v-3'] },
  download: { paths: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'] },
  folder: { paths: ['M4 8h5l2 2h9v9H4z'] },
  check: { paths: ['M4 12.5l5 5L20 6.5'] },
  refresh: { paths: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v4h-4'] },
  layers: { paths: ['M12 3l9 5-9 5-9-5 9-5z', 'M3 12.5l9 5 9-5', 'M3 17l9 5 9-5'] },
  inbox: {
    paths: [
      'M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z',
      'M3 13h4.5l1.5 3h6l1.5-3H21',
    ],
  },
  todo: {
    paths: ['M8 12.4l2.6 2.6L16.5 9'],
    rects: [{ x: 3, y: 4, w: 18, h: 16, rx: 4 }],
  },
  note: {
    paths: ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9.5 13h6', 'M9.5 17h4'],
  },
  timer: {
    paths: ['M12 13.5V8.5', 'M9.5 2.5h5'],
    circles: [{ cx: 12, cy: 13.5, r: 8 }],
  },
  flag: {
    paths: ['M5.5 21.5V3.5', 'M5.5 4.5h11.5l-2.2 4 2.2 4H5.5'],
  },
  external: {
    paths: [
      'M13 4h7v7',
      'M20 4l-9 9',
      'M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5',
    ],
  },
  copy: {
    paths: [
      'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5v-9z',
      'M15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9',
    ],
  },
  'chevron-left': { paths: ['M14 6l-6 6 6 6'] },
  'chevron-right': { paths: ['M10 6l6 6-6 6'] },

  grid: {
    rects: [
      { x: 3.5, y: 3.5, w: 7, h: 7, rx: 2 },
      { x: 13.5, y: 3.5, w: 7, h: 7, rx: 2 },
      { x: 3.5, y: 13.5, w: 7, h: 7, rx: 2 },
      { x: 13.5, y: 13.5, w: 7, h: 7, rx: 2 },
    ],
  },
  star: {
    paths: ['M12 4l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6L12 16.6 7 19.4l1.1-5.6L4 9.9l5.6-.7L12 4z'],
  },
  briefcase: {
    paths: ['M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8', 'M3 12.5h18'],
    rects: [{ x: 3, y: 8, w: 18, h: 11, rx: 2.5 }],
  },
  code: { paths: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4'] },
  terminal: {
    paths: ['M7 10l3 2.5-3 2.5', 'M12.5 15.5h5'],
    rects: [{ x: 3, y: 4, w: 18, h: 16, rx: 3.5 }],
  },
  book: {
    paths: ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4z', 'M17 20a3 3 0 0 0 3-3V4'],
  },
  film: {
    paths: ['M7 4v16', 'M17 4v16', 'M3 12h18'],
    rects: [{ x: 3, y: 4, w: 18, h: 16, rx: 3 }],
  },
  music: {
    paths: ['M9 18V6l10-2v12'],
    circles: [
      { cx: 6.5, cy: 18, r: 2.5 },
      { cx: 16.5, cy: 16, r: 2.5 },
    ],
  },
  game: {
    paths: ['M7 12h3', 'M8.5 10.5v3'],
    circles: [
      { cx: 16, cy: 11.5, r: 1 },
      { cx: 18.5, cy: 14, r: 1 },
    ],
    rects: [{ x: 2.5, y: 7, w: 19, h: 10, rx: 5 }],
  },
  shopping: {
    paths: ['M6 8h12l-1 12H7L6 8z', 'M9 8V6.5a3 3 0 0 1 6 0V8'],
  },
  heart: {
    paths: ['M12 20.2S4.5 15.6 4.5 10.8A4 4 0 0 1 12 8.4a4 4 0 0 1 7.5 2.4c0 4.8-7.5 9.4-7.5 9.4z'],
  },
  home: { paths: ['M4 11l8-7 8 7v9H4v-9z', 'M10 20v-6h4v6'] },
  flask: {
    paths: ['M9.5 3h5', 'M10.5 3v6L5.6 18a2 2 0 0 0 1.8 3h9.2a2 2 0 0 0 1.8-3L13.5 9V3'],
  },
  palette: {
    paths: [
      'M12 21a9 9 0 1 1 0-18c5 0 9 3.6 9 8 0 2.2-1.8 4-4 4h-1.6a1.9 1.9 0 0 0-1.4 3.2A1.9 1.9 0 0 1 12 21z',
    ],
    circles: [
      { cx: 8, cy: 10, r: 1.1 },
      { cx: 12, cy: 7.5, r: 1.1 },
      { cx: 16, cy: 10.5, r: 1.1 },
    ],
  },
  globe: {
    paths: ['M3.5 12h17', 'M12 3.2c2.6 2.6 2.6 15 0 17.6', 'M12 3.2c-2.6 2.6-2.6 15 0 17.6'],
    circles: [{ cx: 12, cy: 12, r: 8.6 }],
  },
  coffee: {
    paths: [
      'M5 8h11v6.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5V8z',
      'M16 9.5h2a2.5 2.5 0 0 1 0 5h-2',
    ],
  },
  plane: { paths: ['M21 3L3 10.5l7 2.5 2.5 7L21 3z', 'M10 13l4.5-4.5'] },
  camera: {
    paths: ['M9 7l1.5-3h3L15 7'],
    circles: [{ cx: 12, cy: 13, r: 4 }],
    rects: [{ x: 3, y: 7, w: 18, h: 13, rx: 3.5 }],
  },
  wallet: {
    paths: ['M3 10h18'],
    circles: [{ cx: 16.5, cy: 14.5, r: 1 }],
    rects: [{ x: 3, y: 6, w: 18, h: 13, rx: 3.5 }],
  },
  chat: {
    paths: [
      'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9.5L4 20V6.5z',
    ],
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createIcon(name: IconName, size = 18, strokeWidth = 1.7): SVGSVGElement {
  const def = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const d of def.paths ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  for (const circle of def.circles ?? []) {
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('cx', String(circle.cx));
    node.setAttribute('cy', String(circle.cy));
    node.setAttribute('r', String(circle.r));
    svg.append(node);
  }
  for (const rect of def.rects ?? []) {
    const node = document.createElementNS(SVG_NS, 'rect');
    node.setAttribute('x', String(rect.x));
    node.setAttribute('y', String(rect.y));
    node.setAttribute('width', String(rect.w));
    node.setAttribute('height', String(rect.h));
    if (rect.rx !== undefined) node.setAttribute('rx', String(rect.rx));
    svg.append(node);
  }
  return svg;
}
