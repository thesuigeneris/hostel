/**
 * Static illustration of the same hostel as the 3D scene. Shown before the scene loads, when WebGL is
 * unavailable, when it fails, and as the still image for people who prefer reduced motion.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} role="presentation" aria-hidden focusable="false">
      <ellipse cx="240" cy="352" rx="210" ry="34" fill="#DDE8DF" />
      {/* building */}
      <rect x="110" y="96" width="240" height="250" rx="4" fill="#F1E7D6" />
      <rect x="350" y="112" width="40" height="234" fill="#E3D6C0" />
      <polygon points="350,96 390,112 390,346 350,346" fill="#E3D6C0" />
      <rect x="100" y="82" width="300" height="18" rx="3" fill="#1F5C46" />
      <rect x="150" y="54" width="34" height="30" rx="6" fill="#2E3A35" />
      {/* floor lines */}
      <rect x="110" y="178" width="240" height="6" fill="#D9CBB3" />
      <rect x="110" y="262" width="240" height="6" fill="#D9CBB3" />
      {/* windows: top, middle (right bay open), bottom */}
      {[
        [130, 116, true], [205, 116, false], [280, 116, true],
        [130, 200, false], [205, 200, true],
        [130, 284, true], [205, 284, true], [280, 284, false],
      ].map(([x, y, lit]) => (
        <rect key={`${x}-${y}`} x={x as number} y={y as number} width="50" height="40" rx="4" fill={lit ? '#F6C27A' : '#3A4A44'} />
      ))}
      {/* open room with bunk bed and desk */}
      <rect x="270" y="190" width="72" height="68" rx="3" fill="#FFF6E8" />
      <rect x="290" y="204" width="44" height="6" fill="#8C6A4A" />
      <rect x="290" y="200" width="44" height="4" fill="#FFFFFF" />
      <rect x="290" y="232" width="44" height="6" fill="#8C6A4A" />
      <rect x="290" y="228" width="44" height="4" fill="#FFFFFF" />
      <rect x="312" y="227" width="22" height="5" fill="#E4EFE9" />
      <rect x="288" y="200" width="3" height="56" fill="#8C6A4A" />
      <rect x="333" y="200" width="3" height="56" fill="#8C6A4A" />
      <rect x="274" y="238" width="16" height="3" fill="#B98A5E" />
      <rect x="276" y="230" width="6" height="8" fill="#F6C27A" />
      {/* tree */}
      <rect x="416" y="300" width="8" height="44" fill="#7A5A3C" />
      <circle cx="420" cy="290" r="30" fill="#4E8B6A" />
    </svg>
  );
}
