import type { CSSProperties } from 'react';

type Name = 'folder' | 'file' | 'shield' | 'plus' | 'arrow' | 'check' | 'stop' | 'pause' | 'refresh';
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
};
export function Icon({ name, size = 18, style }: { name: Name; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
