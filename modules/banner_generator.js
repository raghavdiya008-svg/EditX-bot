const { createCanvas } = require('canvas');

/**
 * EDITX Studio Ultra-High-Definition Canvas Banner Generator
 * Master visual identity engine for EDITX | The Creative Network.
 * Integrates cyber cyan (#00E5FF), electric magenta (#D946EF), metallic 3D chrome typography,
 * geometric soundwave/keyframe patterns, and glassmorphic telemetry indicators.
 */
function renderBanner({
  tag = 'EDITX NETWORK',
  title = 'NOTICE',
  subtitle = '',
  statusText = 'ONLINE',
  statusColor = '#00E5FF',
  accentStart = '#00E5FF',
  accentEnd = '#D946EF',
  glowColor = 'rgba(0, 229, 255, 0.28)',
  telemetry = 'EDITX // THE CREATIVE NETWORK • OFFICIAL SYSTEM',
  badgeIcon = '✦'
}) {
  const width = 960;
  const height = 260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Deep Obsidian / Carbon Studio Background
  ctx.fillStyle = '#08090E';
  ctx.fillRect(0, 0, width, height);

  // 2. Isometric / Studio Grid Pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  const gridSize = 24;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 3. Cyber Cyan Left Glow
  const leftGlow = ctx.createRadialGradient(90, 130, 10, 90, 130, 290);
  leftGlow.addColorStop(0, glowColor);
  leftGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, width, height);

  // 4. Electric Magenta Right Ambient Glow
  const rightGlow = ctx.createRadialGradient(width - 120, 130, 10, width - 120, 130, 270);
  rightGlow.addColorStop(0, 'rgba(217, 70, 239, 0.20)');
  rightGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, width, height);

  // 5. Stylized Background Geometric "X" Brand Watermark (Right Side)
  ctx.save();
  ctx.translate(width - 140, 130);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-60, -60);
  ctx.lineTo(60, 60);
  ctx.moveTo(60, -60);
  ctx.lineTo(-60, 60);
  ctx.stroke();

  // Outer HUD Ring around watermark
  ctx.beginPath();
  ctx.arc(0, 0, 75, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Waveform ticks
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const r1 = 80;
    const r2 = 86;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.strokeStyle = 'rgba(217, 70, 239, 0.15)';
    ctx.stroke();
  }
  ctx.restore();

  // 6. Top Gradient Neon Rule
  const topGrad = ctx.createLinearGradient(0, 0, width, 0);
  topGrad.addColorStop(0, accentStart);
  topGrad.addColorStop(0.5, accentEnd);
  topGrad.addColorStop(1, accentStart);
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, 4);

  // 7. Glassmorphic Category Tag Pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.strokeStyle = accentStart;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(48, 34, 250, 30, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentStart;
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`${badgeIcon}  ${tag}`, 62, 54);

  // 8. Glassmorphic Status Pill (Right Side)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(width - 230, 34, 182, 30, 8);
  ctx.fill();
  ctx.stroke();

  // Status Glowing Indicator Dot
  ctx.fillStyle = statusColor;
  ctx.shadowColor = statusColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(width - 212, 49, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0; // reset

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 11px sans-serif';
  ctx.fillText(statusText, width - 198, 53);

  // 9. Main Chrome / High-Contrast Header Title
  const titleGrad = ctx.createLinearGradient(48, 80, 48, 130);
  titleGrad.addColorStop(0, '#FFFFFF');
  titleGrad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(title, 48, 120);

  // 10. Subtitle Description
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 15px sans-serif';
  ctx.fillText(subtitle, 48, 156);

  // 11. Bottom Glass Divider & Telemetry Footer
  const dividerGrad = ctx.createLinearGradient(48, 0, width - 48, 0);
  dividerGrad.addColorStop(0, 'rgba(0, 229, 255, 0.3)');
  dividerGrad.addColorStop(0.5, 'rgba(217, 70, 239, 0.3)');
  dividerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.strokeStyle = dividerGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 195);
  ctx.lineTo(width - 48, 195);
  ctx.stroke();

  // Telemetry code
  ctx.fillStyle = '#64748B';
  ctx.font = '12px monospace';
  ctx.fillText(telemetry, 48, 222);

  return canvas.toBuffer('image/png');
}

function createRulesBanner() {
  return renderBanner({
    tag: 'COMMUNITY DIRECTIVES',
    title: 'RULES & GUIDELINES',
    subtitle: 'Creator Etiquette • Zero Scam Tolerance • Constructive Feedback Standards',
    statusText: 'MANDATORY PROTOCOL',
    statusColor: '#00E5FF',
    accentStart: '#00E5FF',
    accentEnd: '#D946EF',
    glowColor: 'rgba(0, 229, 255, 0.28)',
    telemetry: 'EDITX // CODE_OF_CONDUCT • VERIFIED WORKSPACE • LEVEL 2 BOOSTED',
    badgeIcon: '📜'
  });
}

function createRolesBanner() {
  return renderBanner({
    tag: 'CREATOR IDENTITY STATION',
    title: 'SELECT CREATIVE ROLES',
    subtitle: 'Equip Your Editing Software, Creative Disciplines & Notification Pings',
    statusText: 'INTERACTIVE • LIVE SYNC',
    statusColor: '#D946EF',
    accentStart: '#D946EF',
    accentEnd: '#00E5FF',
    glowColor: 'rgba(217, 70, 239, 0.28)',
    telemetry: 'EDITX // AUTO_ROLE_STATION • LIVE TOGGLE • HARDWARE ACCELERATED',
    badgeIcon: '🎭'
  });
}

function createTicketsBanner() {
  return renderBanner({
    tag: 'STAFF CONCIERGE',
    title: 'SUPPORT & DISPATCH',
    subtitle: 'Confidential Staff Inquiries • Member Reports • Project Collaborations',
    statusText: '24/7 ONLINE • SECURE',
    statusColor: '#10B981',
    accentStart: '#00E5FF',
    accentEnd: '#10B981',
    glowColor: 'rgba(0, 229, 255, 0.25)',
    telemetry: 'EDITX // SUPPORT_DISPATCH • END_TO_END_PRIVATE • TRANSCRIPT READY',
    badgeIcon: '🎟️'
  });
}

function createAssetVaultBanner() {
  return renderBanner({
    tag: 'LEVEL 2 ASSET VAULT',
    title: 'CREATIVE ASSET VAULT',
    subtitle: 'Curated 50MB Direct Uploads • SFX Packs • Cinema LUTs • Presets & Overlays',
    statusText: '50MB UPLOADS ACTIVE',
    statusColor: '#F59E0B',
    accentStart: '#F59E0B',
    accentEnd: '#D946EF',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    telemetry: 'EDITX // RESOURCE_ARCHIVE • ROYALTY_FREE • STUDIO PRESETS',
    badgeIcon: '📦'
  });
}

function createBoosterLoungeBanner() {
  return renderBanner({
    tag: 'VIP SANCTUARY',
    title: 'BOOSTER LOUNGE',
    subtitle: 'Exclusive VIP Creator Suite • 256kbps Ultra Audio • Prioritized Feedback',
    statusText: 'LEVEL 2 PERKS ACTIVE',
    statusColor: '#F47FFF',
    accentStart: '#F47FFF',
    accentEnd: '#00E5FF',
    glowColor: 'rgba(244, 127, 255, 0.3)',
    telemetry: 'EDITX // VIP_BOOSTER_LOUNGE • LEVEL_2_ACCESS • PRIORITY FEEDBACK',
    badgeIcon: '💎'
  });
}

function createHoneypotBanner() {
  return renderBanner({
    tag: 'SENTINEL DEFENSE PERIMETER',
    title: 'DO NOT TYPE IN THIS CHANNEL',
    subtitle: 'Automated Intrusion Detection • Any Message Triggers Immediate Quarantine',
    statusText: 'RESTRICTED HONEYPOT',
    statusColor: '#EF4444',
    accentStart: '#DC2626',
    accentEnd: '#EF4444',
    glowColor: 'rgba(220, 38, 38, 0.35)',
    telemetry: 'EDITX // HONEYPOT_TRAP • ZERO_TOLERANCE • AUTO_DEFENSE ACTIVE',
    badgeIcon: '🚨'
  });
}

module.exports = {
  renderBanner,
  createRulesBanner,
  createRolesBanner,
  createTicketsBanner,
  createAssetVaultBanner,
  createBoosterLoungeBanner,
  createHoneypotBanner
};
