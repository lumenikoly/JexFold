import type { CSSProperties } from 'react';

type Name =
  | 'folder'
  | 'file'
  | 'shield'
  | 'plus'
  | 'arrow'
  | 'check'
  | 'stop'
  | 'pause'
  | 'refresh'
  | 'settings'
  | 'language'
  | 'chevronDown'
  | 'help'
  | 'github'
  | 'close';
const paths: Record<Name, string> = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 14h8M8 17h5',
  shield: 'M12 3 3 7v5c0 5 6 8 9 9 3-1 9-4 9-9V7ZM8 12l3 3 5-6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  stop: 'M6 6h12v12H6Z',
  pause: 'M8 5v14M16 5v14',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-2v-.48a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.56-1.04H7v-2h.84A1.7 1.7 0 0 0 9.4 10.9a1.7 1.7 0 0 0-.34-1.88L9 8.96l1.42-1.42.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 13.4 6.4V6h2v.4a1.7 1.7 0 0 0 1.04 1.54 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06A1.7 1.7 0 0 0 19.4 10.9a1.7 1.7 0 0 0 1.56 1.06H22v2h-1.04A1.7 1.7 0 0 0 19.4 15Z',
  language:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.2 2.4 3.4 5.4 3.4 9S14.2 18.6 12 21c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3Z',
  chevronDown: 'm7 10 5 5 5-5',
  help: 'M9.1 9a3 3 0 1 1 5.4 1.8c-.8 1.1-2.5 1.3-2.5 3.2M12 17.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  github:
    'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.5 5.5 0 0 0 19.3 4 5.1 5.1 0 0 0 19.1.5S17.9.1 15 2a13.4 13.4 0 0 0-7 0C5.1.1 3.9.5 3.9.5A5.1 5.1 0 0 0 3.7 4a5.5 5.5 0 0 0-1.5 3.5c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4M8 19c-3 .9-3-1.5-4.2-2',
  close: 'M6 6l12 12M18 6 6 18',
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: Name;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
