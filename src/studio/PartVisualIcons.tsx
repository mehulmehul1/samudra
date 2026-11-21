import React from 'react';

interface PartIconProps {
  variantId: string;
  active?: boolean;
}

export const BellSilhouetteIcon: React.FC<PartIconProps> = ({ variantId, active }) => {
  const stroke = active ? '#7CF0FF' : '#94A3B8';
  const fill = active ? 'rgba(124, 240, 255, 0.16)' : 'rgba(148, 163, 184, 0.08)';

  return (
    <svg viewBox="0 0 64 48" className="w-14 h-10 shrink-0" aria-hidden="true">
      {variantId === 'scallopedCrystal' && (
        <>
          <path d="M12 31 C12 13, 52 13, 52 31 C48 34, 44 29, 40 33 C36 35, 32 30, 28 33 C24 35, 20 29, 16 33 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx="32" cy="23" r="6" fill="none" stroke={stroke} strokeWidth="1.1" opacity="0.65" />
          <path d="M23 19 L27 16 L31 19 L31 23 L27 25 L23 23 Z" fill="none" stroke={stroke} strokeWidth="0.9" opacity="0.65" />
        </>
      )}
      {variantId === 'lotusCalyx' && (
        <>
          <path d="M8 20 C16 31, 24 33, 32 31 C40 33, 48 31, 56 20 C49 26, 42 22, 32 25 C22 22, 15 26, 8 20 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M26 24 L23 11 M30 24 L29 8 M34 24 L35 8 M38 24 L41 11" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="23" cy="10" r="1.4" fill={stroke} />
          <circle cx="29" cy="7.5" r="1.4" fill={stroke} />
          <circle cx="35" cy="7.5" r="1.4" fill={stroke} />
          <circle cx="41" cy="10" r="1.4" fill={stroke} />
        </>
      )}
      {variantId === 'orchidCrown' && (
        <>
          <path d="M10 29 C16 25, 18 14, 23 8 C26 17, 29 14, 32 6 C35 14, 38 17, 41 8 C46 14, 48 25, 54 29 C46 34, 39 30, 32 33 C25 30, 18 34, 10 29 Z" fill={fill} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="25" cy="22" r="1" fill={stroke} opacity="0.8" />
          <circle cx="38" cy="20" r="1" fill={stroke} opacity="0.8" />
          <circle cx="32" cy="26" r="1.1" fill={stroke} opacity="0.8" />
        </>
      )}
      {variantId === 'opalMantle' && (
        <>
          <path d="M32 6 L48 18 C43 22, 39 22, 38 24 L37 40 C35 42, 29 42, 27 40 L26 24 C25 22, 21 22, 16 18 Z" fill={fill} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M32 8 L32 40" stroke={stroke} strokeWidth="1" opacity="0.55" />
        </>
      )}
      {variantId === 'flutedUmbrella' && (
        <>
          <path d="M10 32 C10 12, 54 12, 54 32 C46 36, 18 36, 10 32 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M18 33 C20 20, 26 14, 32 14 M25 34 C26 21, 29 14, 32 14 M39 34 C38 21, 35 14, 32 14 M46 33 C44 20, 38 14, 32 14" fill="none" stroke={stroke} strokeWidth="1.1" opacity="0.65" />
        </>
      )}
      {variantId === 'medusa' && (
        <path d="M12 34 C12 14, 52 14, 52 34 C46 38, 18 38, 12 34 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
      )}
      {variantId === 'parasol' && (
        <path d="M6 31 C8 16, 56 16, 58 31 C48 35, 16 35, 6 31 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
      )}
      {variantId === 'starCrown' && (
        <path d="M32 8 L40 20 L54 22 L43 31 L46 39 L32 34 L18 39 L21 31 L10 22 L24 20 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {variantId === 'egg' && (
        <>
          <ellipse cx="32" cy="24" rx="15" ry="18" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M24 9 C20 18, 20 30, 24 39 M40 9 C44 18, 44 30, 40 39" fill="none" stroke={stroke} strokeWidth="1.1" opacity="0.65" />
        </>
      )}
      {variantId === 'ruffledRim' && (
        <path d="M12 30 C13 13, 51 13, 52 30 C54 35, 48 38, 44 34 C40 39, 36 39, 32 34 C28 39, 24 39, 20 34 C16 38, 10 35, 12 30 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      )}
    </svg>
  );
};

export const SkirtSilhouetteIcon: React.FC<PartIconProps> = ({ variantId, active }) => {
  const stroke = active ? '#7CF0FF' : '#94A3B8';
  const fill = active ? 'rgba(124, 240, 255, 0.16)' : 'rgba(148, 163, 184, 0.08)';
  const bellGhost = 'rgba(148, 163, 184, 0.28)';

  return (
    <svg viewBox="0 0 64 48" className="w-14 h-10 shrink-0" aria-hidden="true">
      <path d="M14 17 C16 8, 48 8, 50 17" fill="none" stroke={bellGhost} strokeWidth="1.2" strokeDasharray="2 2" />
      {variantId === 'concentricFrill' && (
        <>
          <path d="M16 17 C20 25, 44 25, 48 17" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <path d="M19 22 C24 32, 40 32, 45 22" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <path d="M23 28 C27 36, 37 36, 41 28" fill="none" stroke={stroke} strokeWidth="1.3" />
        </>
      )}
      {variantId === 'velvetCollar' && (
        <path d="M19 17 C18 28, 25 32, 28 27 C30 33, 34 33, 36 27 C39 32, 46 28, 45 17 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
      )}
      {variantId === 'gastricFlower' && (
        <path d="M18 17 C16 25, 22 29, 26 24 C29 31, 35 31, 38 24 C42 29, 48 25, 46 17 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      )}
      {variantId === 'emeraldVeils' && (
        <path d="M20 17 L18 40 L25 34 L32 42 L39 34 L46 40 L44 17 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {variantId === 'innerBell' && (
        <path d="M17 17 C16 25, 20 32, 24 35 C28 32, 36 32, 40 35 C44 32, 48 25, 47 17 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
      )}
      {variantId === 'flaredApron' && (
        <path d="M18 17 C15 24, 11 32, 10 38 C20 34, 44 34, 54 38 C53 32, 49 24, 46 17 Z" fill={fill} stroke={stroke} strokeWidth="1.6" />
      )}
      {variantId === 'none' && (
        <path d="M22 27 L42 27 M25 22 L39 32" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      )}
    </svg>
  );
};

export const OralArmsSilhouetteIcon: React.FC<PartIconProps> = ({ variantId, active }) => {
  const stroke = active ? '#7CF0FF' : '#94A3B8';
  const fill = active ? 'rgba(124, 240, 255, 0.14)' : 'rgba(148, 163, 184, 0.08)';
  const bellGhost = 'rgba(148, 163, 184, 0.28)';

  return (
    <svg viewBox="0 0 64 48" className="w-14 h-10 shrink-0" aria-hidden="true">
      <path d="M16 12 C20 6, 44 6, 48 12" fill="none" stroke={bellGhost} strokeWidth="1.2" strokeDasharray="2 2" />
      {variantId === 'turingRibbons' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round">
          <path d="M25 12 C18 18, 30 24, 20 31 C16 36, 26 40, 24 44" />
          <path d="M32 12 C39 19, 26 26, 36 33 C40 38, 30 41, 33 45" />
          <path d="M39 12 C46 18, 35 24, 44 31 C48 36, 39 40, 41 44" />
        </g>
      )}
      {variantId === 'kelpFronds' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d="M26 12 L21 24 C15 28, 15 38, 22 39 C27 38, 26 28, 25 24 Z" />
          <path d="M32 12 L32 23 C26 29, 27 42, 32 44 C37 42, 38 29, 32 23 Z" />
          <path d="M38 12 L43 24 C49 28, 49 38, 42 39 C37 38, 38 28, 39 24 Z" />
        </g>
      )}
      {variantId === 'cauliflowerClusters' && (
        <path d="M20 13 C12 18, 13 28, 21 29 C23 35, 31 35, 32 30 C33 35, 41 35, 43 29 C51 28, 52 18, 44 13 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      )}
      {variantId === 'flowingMane' && (
        <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round">
          <path d="M22 12 C14 22, 18 33, 21 44" />
          <path d="M28 12 C23 23, 32 33, 27 45" />
          <path d="M36 12 C41 23, 32 33, 37 45" />
          <path d="M42 12 C50 22, 46 33, 43 44" />
        </g>
      )}
      {variantId === 'helicalSpirals' && (
        <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round">
          <path d="M26 12 C20 16, 32 20, 22 25 C16 29, 30 33, 23 38 C19 41, 27 43, 25 45" />
          <path d="M38 12 C44 16, 32 20, 42 25 C48 29, 34 33, 41 38 C45 41, 37 43, 39 45" />
        </g>
      )}
      {variantId === 'petalCalyx' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.5">
          <path d="M28 12 C16 16, 12 29, 20 38 C25 32, 28 22, 30 12 Z" />
          <path d="M36 12 C48 16, 52 29, 44 38 C39 32, 36 22, 34 12 Z" />
          <path d="M32 12 C26 22, 26 34, 32 42 C38 34, 38 22, 32 12 Z" />
        </g>
      )}
      {variantId === 'frilledLace' && (
        <path d="M22 12 C16 17, 13 24, 17 28 C21 31, 25 27, 29 31 C33 34, 37 28, 41 31 C45 27, 49 23, 45 17 L42 12 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      )}
      {variantId === 'ribbons' && (
        <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round">
          <path d="M26 12 C22 22, 28 31, 24 43" />
          <path d="M32 12 C35 23, 29 33, 33 44" />
          <path d="M38 12 C42 22, 36 31, 40 43" />
        </g>
      )}
      {variantId === 'none' && (
        <path d="M22 27 L42 27 M25 22 L39 32" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      )}
    </svg>
  );
};

export const TentaclesSilhouetteIcon: React.FC<PartIconProps> = ({ variantId, active }) => {
  const stroke = active ? '#7CF0FF' : '#94A3B8';
  const bellGhost = 'rgba(148, 163, 184, 0.28)';

  return (
    <svg viewBox="0 0 64 48" className="w-14 h-10 shrink-0" aria-hidden="true">
      <path d="M14 12 C18 6, 46 6, 50 12" fill="none" stroke={bellGhost} strokeWidth="1.2" strokeDasharray="2 2" />
      {variantId === 'crystalTendrils' && (
        <g fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 12 L15 41" />
          <path d="M27 12 L25 44" />
          <path d="M37 12 L39 44" />
          <path d="M46 12 L49 41" />
        </g>
      )}
      {variantId === 'stippledCurtain' && (
        <g stroke={stroke} strokeWidth="1.4" strokeDasharray="1.5 2.5" strokeLinecap="round">
          <path d="M20 12 L21 44" />
          <path d="M28 12 L28 45" />
          <path d="M36 12 L36 45" />
          <path d="M44 12 L43 44" />
        </g>
      )}
      {variantId === 'bulbFilaments' && (
        <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round">
          <path d="M20 12 C16 22, 23 30, 17 40" />
          <path d="M32 12 C28 24, 36 32, 32 42" />
          <path d="M44 12 C48 22, 41 30, 47 40" />
          <circle cx="17" cy="41.5" r="2.2" fill="#FF521B" stroke="none" />
          <circle cx="32" cy="43.5" r="2.2" fill="#FF521B" stroke="none" />
          <circle cx="47" cy="41.5" r="2.2" fill="#FF521B" stroke="none" />
        </g>
      )}
      {variantId === 'beadedArms' && (
        <g fill="none" stroke={stroke} strokeWidth="2.1" strokeLinecap="round">
          <path d="M22 12 C11 22, 14 35, 24 43" />
          <path d="M32 12 L32 44" />
          <path d="M42 12 C53 22, 50 35, 40 43" />
          <circle cx="16" cy="24" r="1.2" fill="#E8FFF8" stroke="none" />
          <circle cx="16" cy="31" r="1.2" fill="#E8FFF8" stroke="none" />
          <circle cx="48" cy="24" r="1.2" fill="#E8FFF8" stroke="none" />
          <circle cx="48" cy="31" r="1.2" fill="#E8FFF8" stroke="none" />
        </g>
      )}
      {variantId === 'filaments' && (
        <g fill="none" stroke={stroke} strokeWidth="1.15" strokeLinecap="round">
          <path d="M16 12 C12 24, 20 34, 15 45" />
          <path d="M26 12 C23 25, 29 35, 26 45" />
          <path d="M38 12 C41 25, 35 35, 38 45" />
          <path d="M48 12 C52 24, 44 34, 49 45" />
        </g>
      )}
      {variantId === 'curtainVeil' && (
        <g fill="none" stroke={stroke} strokeWidth="1.35" strokeLinecap="round">
          <path d="M17 12 C15 23, 21 33, 18 44" />
          <path d="M26 12 C24 23, 28 33, 26 44" />
          <path d="M38 12 C40 23, 36 33, 38 44" />
          <path d="M47 12 C49 23, 43 33, 46 44" />
        </g>
      )}
      {variantId === 'articulatedTubes' && (
        <g fill="none" stroke={stroke} strokeWidth="2.3" strokeLinecap="round">
          <path d="M18 12 C16 23, 22 33, 19 43" />
          <path d="M32 12 C34 24, 29 33, 33 44" />
          <path d="M46 12 C48 23, 42 33, 45 43" />
        </g>
      )}
      {variantId === 'none' && (
        <path d="M22 27 L42 27 M25 22 L39 32" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      )}
    </svg>
  );
};

export const OpticalBaseIcon: React.FC<{ baseId: number; active?: boolean }> = ({ baseId, active }) => {
  const ring = active ? '#7CF0FF' : 'rgba(226,232,240,0.22)';
  const palettes: Array<[string, string, string]> = [
    ['#FFE58F', '#22E8FF', '#FF7A1A'], // 0 Prismatic Crystal
    ['#C8FF4D', '#29E3FF', '#1C1466'], // 1 Abyssal Biolume
    ['#FF8E7A', '#A8F5E6', '#0A6E54'], // 2 Botanical Glass
    ['#D5FFA8', '#2EC976', '#0A3B22'], // 3 Phosphor Flora
    ['#FFB4A8', '#52CCFF', '#7B3EFF'], // 4 Frosted Cosmic
    ['#E8FFF8', '#3B82FF', '#DF46FF'], // 5 Opal Iridescence
  ];
  const [c0, c1, c2] = palettes[baseId] ?? palettes[0];
  const gid = `opt-orb-${baseId}`;

  return (
    <svg viewBox="0 0 44 44" className="w-9 h-9 shrink-0" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="36%" cy="32%" r="68%">
          <stop offset="0%" stopColor={c0} />
          <stop offset="52%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
      </defs>
      <circle cx="22" cy="22" r="17" fill={`url(#${gid})`} stroke={ring} strokeWidth={active ? '2' : '1'} />
      {baseId === 0 && <path d="M12 16 Q22 10 32 16" fill="none" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.85" strokeLinecap="round" />}
      {baseId === 4 && (
        <>
          <circle cx="17" cy="18" r="1.3" fill="#FFF" />
          <circle cx="27" cy="16" r="1" fill="#FFF" />
          <circle cx="24" cy="26" r="1.2" fill="#FFF" />
        </>
      )}
      {baseId === 5 && <ellipse cx="22" cy="22" rx="11" ry="6" transform="rotate(-24 22 22)" fill="none" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.7" />}
    </svg>
  );
};

export const PatternIcon: React.FC<{ patternId: number; active?: boolean }> = ({ patternId, active }) => {
  const stroke = active ? '#7CF0FF' : '#94A3B8';
  return (
    <svg viewBox="0 0 44 44" className="w-9 h-9 shrink-0" aria-hidden="true">
      <rect x="4" y="4" width="36" height="36" rx="9" fill="rgba(15, 20, 36, 0.9)" stroke={active ? '#7CF0FF' : 'rgba(226,232,240,0.14)'} strokeWidth="1.3" />
      {patternId === 0 && (
        <path d="M9 17 Q16 11 22 17 T35 17 M9 26 Q16 20 22 26 T35 26" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      )}
      {patternId === 1 && (
        <path d="M15 14 L21 11 L27 14 L27 21 L21 24 L15 21 Z M21 24 L27 21 L33 24 L33 31 L27 34 L21 31 Z" fill="none" stroke={stroke} strokeWidth="1.3" />
      )}
      {patternId === 2 && (
        <path d="M11 15 C16 15, 16 22, 22 22 C28 22, 28 14, 33 14 M11 28 C17 28, 17 21, 22 28 C27 34, 33 28, 33 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      )}
      {patternId === 3 && (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M22 35 L22 10 M22 24 L13 17 M22 20 L31 14 M22 30 L14 26" fill="none" />
          <circle cx="13" cy="17" r="1.6" fill={stroke} />
          <circle cx="31" cy="14" r="1.6" fill={stroke} />
          <circle cx="22" cy="10" r="1.8" fill={stroke} />
        </g>
      )}
      {patternId === 4 && (
        <g fill={stroke}>
          <circle cx="14" cy="14" r="1.5" />
          <circle cx="29" cy="13" r="1.1" />
          <circle cx="22" cy="22" r="2" />
          <circle cx="13" cy="29" r="1.2" />
          <circle cx="31" cy="28" r="1.6" />
          <circle cx="24" cy="33" r="1" />
        </g>
      )}
      {patternId === 5 && (
        <g fill={stroke} opacity="0.85">
          <circle cx="16" cy="17" r="5" opacity="0.35" />
          <circle cx="28" cy="25" r="6" opacity="0.35" />
          <circle cx="15" cy="16" r="1.2" />
          <circle cx="19" cy="19" r="1" />
          <circle cx="27" cy="24" r="1.3" />
          <circle cx="30" cy="27" r="1" />
        </g>
      )}
      {patternId === 6 && (
        <g fill={stroke}>
          <circle cx="14" cy="14" r="2.2" />
          <circle cx="24" cy="13" r="2.4" />
          <circle cx="32" cy="18" r="1.8" />
          <circle cx="18" cy="24" r="2.5" />
          <circle cx="29" cy="29" r="2.2" />
          <circle cx="14" cy="32" r="1.7" />
        </g>
      )}
      {patternId === 7 && (
        <path d="M13 10 L13 34 M19 10 L19 34 M25 10 L25 34 M31 10 L31 34" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
};

export const ColorwaySwatchIcon: React.FC<{
  coreColor: string;
  bellColor: string;
  accentColor: string;
  tipColor: string;
  active?: boolean;
}> = ({ coreColor, bellColor, accentColor, tipColor, active }) => (
  <div
    className={`w-9 h-9 rounded-full shrink-0 border ${active ? 'border-[#7CF0FF] ring-2 ring-[#7CF0FF]/35' : 'border-[#E2E8F0]/20'}`}
    style={{
      background: `conic-gradient(from 210deg, ${coreColor} 0deg 90deg, ${bellColor} 90deg 185deg, ${accentColor} 185deg 275deg, ${tipColor} 275deg 360deg)`,
    }}
    aria-hidden="true"
  />
);
