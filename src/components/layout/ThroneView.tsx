import type { ComponentChildren } from 'preact';

interface ThroneViewProps {
  header: ComponentChildren;
  grooveCircle: ComponentChildren;
  panels: ComponentChildren;
  footer?: ComponentChildren;
}

export function ThroneView({ header, grooveCircle, panels, footer }: ThroneViewProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg-dark, #0a0c14)',
      color: 'var(--text-primary, #f0f4f8)',
      overflow: 'hidden',
    }}>
      <div style={{ flex: '0 0 auto', padding: '24px' }}>
        {header}
      </div>
      
      <main style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '0 24px',
        gap: '24px'
      }}>
        {/* The groove circle is perfectly centered in this flex container if we give panels flex: 1 and it flex: 0 or similar, but the easiest is flex row with center alignment. */}
        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
          {grooveCircle}
        </div>
        <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
          {panels}
        </div>
      </main>
      
      <div style={{ flex: '0 0 auto', padding: '24px' }}>
        {footer}
      </div>
    </div>
  );
}
