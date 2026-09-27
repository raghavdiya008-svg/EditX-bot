const { createCanvas } = require('canvas');

/**
 * High-Resolution Swiss / OLED Canvas Banner Generator
 * Renders custom Discord embed header graphics with precision typography, 
 * geometry, telemetry, and status accents.
 */
function renderBanner({
  tag = 'SYSTEM',
  title = 'NOTICE',
  subtitle = '',
  statusText = 'ONLINE',
  statusColor = '#00F0FF',
  accentStart = '#00F0FF',
  accentEnd = '#06B6D4',
  glowColor = 'rgba(0, 240, 255, 0.25)',
  telemetry = 'EDITX NETWORK // SENTINEL'
}) {
  const width = 960;
  const height = 240;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background - Deep Obsidian / OLED
  ctx.fillStyle = '#08090C';
  ctx.fillRect(0, 0, width, height);

  // Subtle isometric/orthogonal grid pattern
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

  // Accent radial glow on the left
  const glow = ctx.createRadialGradient(80, 120, 10, 80, 120, 260);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Top accent line
  const topGrad = ctx.createLinearGradient(0, 0, width, 0);
  topGrad.addColorStop(0, accentStart);
  topGrad.addColorStop(0.5, accentEnd);
  topGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, 4);

  // Right diagonal decorative geometry
  ctx.save();
  ctx.beginPath();
  ctx.rect(width - 130, 0, 130, height);
  ctx.clip();
  for (let i = -height; i < width; i += 24) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.moveTo(width - 130 + i, 0);
    ctx.lineTo(width - 130 + i + 10, 0);
    ctx.lineTo(width - 130 + i - height + 10, height);
    ctx.lineTo(width - 130 + i - height, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Category Tag Pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.strokeStyle = accentStart;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(48, 34, 210, 28, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentStart;
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(tag, 62, 53);

  // Status Badge on Right
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(width - 220, 34, 172, 28, 6);
  ctx.fill();
  ctx.stroke();

  // Status indicator dot
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(width - 202, 48, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 11px sans-serif';
  ctx.fillText(statusText, width - 188, 52);

  // Main Header Text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(title, 48, 114);

  // Subtitle
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 15px sans-serif';
  ctx.fillText(subtitle, 48, 148);

  // Bottom telemetry divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 185);
  ctx.lineTo(width - 48, 185);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '12px monospace';
  ctx.fillText(telemetry, 48, 208);

  return canvas.toBuffer('image/png');
}

function createHoneypotBanner() {
  return renderBanner({
    tag: '⚡ SENTINEL HONEYPOT',
    title: 'AUTOMATED SECURITY TRAP',
    subtitle: 'Zero-Tolerance Perimeter • Unauthorized Input Triggers Role Revocation',
    statusText: 'RESTRICTED ZONE',
    statusColor: '#EF4444',
    accentStart: '#DC2626',
    accentEnd: '#EF4444',
    glowColor: 'rgba(220, 38, 38, 0.28)',
    telemetry: 'PROTOCOL: ROGUE_BOT_NEUTRALIZE // DISPATCH: #ALERTS // SYSTEM: EDITX SENTINEL'
  });
}

function createRulesBanner() {
  return renderBanner({
    tag: '📜 COMMUNITY DIRECTIVES',
    title: 'COMMUNITY CODE & STANDARDS',
    subtitle: 'Network Etiquette • Professional Conduct • Fair Collaboration Standards',
    statusText: 'OFFICIAL v2.0 • MANDATORY',
    statusColor: '#38BDF8',
    accentStart: '#38BDF8',
    accentEnd: '#0284C7',
    glowColor: 'rgba(56, 189, 248, 0.22)',
    telemetry: 'DIRECTIVE: CODE_OF_CONDUCT // NETWORK: EDITX // REVISION: 2026.09'
  });
}

function createRolesBanner() {
  return renderBanner({
    tag: '🎨 CREATOR PROFILE STATION',
    title: 'ROLE ASSIGNMENT STATION',
    subtitle: 'Select Creative Disciplines & Software Suites To Build Your Creator Identity',
    statusText: 'INTERACTIVE • LIVE SYNC',
    statusColor: '#00F0FF',
    accentStart: '#00F0FF',
    accentEnd: '#06B6D4',
    glowColor: 'rgba(0, 240, 255, 0.25)',
    telemetry: 'SYSTEM: DYNAMIC_ROLES // INTERFACE: SELECT_MENUS // AUTO_SYNC: ENABLED'
  });
}

function createTicketsBanner() {
  return renderBanner({
    tag: '🎫 SUPPORT CONCIERGE',
    title: 'SUPPORT & INQUIRY DISPATCH',
    subtitle: 'Confidential Staff Dispatch • General Help • Member Reports • Billing',
    statusText: '24/7 ONLINE • SECURE',
    statusColor: '#10B981',
    accentStart: '#06B6D4',
    accentEnd: '#3B82F6',
    glowColor: 'rgba(6, 182, 212, 0.22)',
    telemetry: 'CONCIERGE: TICKET_DISPATCH // PROTOCOL: END_TO_END_PRIVATE // EXPORT: HTML'
  });
}

function createForHireBanner() {
  return renderBanner({
    tag: '💼 FREELANCE MARKETPLACE',
    title: 'CREATOR SHOWCASE DIRECTORY',
    subtitle: 'Verified Freelance Showcase • Connect With Clients • Submit In-App Form',
    statusText: 'VERIFIED DIRECTORY',
    statusColor: '#10B981',
    accentStart: '#10B981',
    accentEnd: '#059669',
    glowColor: 'rgba(16, 185, 129, 0.22)',
    telemetry: 'MARKETPLACE: CREATOR_DIRECTORY // MODAL: ONE_CLICK_SUBMIT // ACTIVE: LIVE'
  });
}

module.exports = {
  renderBanner,
  createHoneypotBanner,
  createRulesBanner,
  createRolesBanner,
  createTicketsBanner,
  createForHireBanner
};
