import type { StudioModule } from './modules';

export default function StudioIcon({ module }: { module: StudioModule }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{module.icon}</svg>;
}
