// ZKWAConnect brand logo component
// Usage: <Logo size={32} /> or <Logo size={48} showText />

interface LogoProps {
  size?:     number
  showText?: boolean
  textSize?: number
  className?: string
}

export function Logo({ size = 32, showText = false, textSize, className = '' }: LogoProps) {
  const ts = textSize || Math.round(size * 0.44)
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} style={{ lineHeight: 1 }}>
      {/* Icon mark */}
      <span
        style={{
          width:           size,
          height:          size,
          borderRadius:    Math.round(size * 0.22),
          background:      'linear-gradient(145deg, #128C7E 0%, #075E54 60%)',
          display:         'inline-flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          boxShadow:       '0 2px 8px rgba(7,94,84,0.35)',
          overflow:        'hidden',
          position:        'relative',
        }}>
        {/* ZK text mark */}
        <span style={{
          fontFamily:  'Arial, Helvetica, sans-serif',
          fontSize:    Math.round(size * 0.42),
          fontWeight:  700,
          lineHeight:  1,
          letterSpacing: -0.5,
          display:     'flex',
          gap:         0,
          userSelect:  'none',
        }}>
          <span style={{ color: '#FFFFFF' }}>Z</span>
          <span style={{ color: '#25D366' }}>K</span>
        </span>
        {/* Green tick accent bottom-right */}
        <span style={{
          position:   'absolute',
          bottom:     Math.round(size * 0.06),
          right:      Math.round(size * 0.07),
          fontSize:   Math.round(size * 0.22),
          lineHeight: 1,
          color:      '#25D366',
        }}>✓</span>
      </span>

      {/* Wordmark */}
      {showText && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{
            fontFamily:  'Arial, Helvetica, sans-serif',
            fontSize:    ts,
            fontWeight:  700,
            color:       '#075E54',
            lineHeight:  1.15,
            letterSpacing: -0.3,
          }}>
            ZKWAConnect
          </span>
          <span style={{
            fontFamily:  'Arial, Helvetica, sans-serif',
            fontSize:    Math.round(ts * 0.58),
            fontWeight:  400,
            color:       '#128C7E',
            lineHeight:  1.2,
            letterSpacing: 0.3,
          }}>
            Business API
          </span>
        </span>
      )}
    </span>
  )
}

// Icon-only (no text) — shorthand
export function LogoIcon({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <Logo size={size} showText={false} className={className} />
}

// Full lockup with text
export function LogoLockup({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <Logo size={size} showText className={className} />
}
