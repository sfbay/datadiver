export default function ModeToggle(_: { mode: 'flow' | 'hotspots'; onChange: (next: 'flow' | 'hotspots') => void }) {
  return <div className="font-mono text-[10px] text-paper-500">[FLOW · HOTSPOTS]</div>
}
