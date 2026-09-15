export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="AnaCode">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-node" />
        <span className="brand-trace brand-trace-left" />
        <span className="brand-trace brand-trace-right" />
      </span>
      {!compact && <span className="brand-word">AnaCode</span>}
    </span>
  );
}
