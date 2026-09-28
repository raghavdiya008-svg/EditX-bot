require('dotenv').config();
const { createCanvas } = require('canvas');
const fs = require('fs');
const https = require('https');
const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');

const EDITX_GUILD_ID = '1538957031455596544';
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Helper to download binary from URL
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url} (HTTP ${res.statusCode})`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 1. Role Icon Canvas Generator
function createRoleIcon(type) {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  if (type === 'admin') {
    // Imperial Gold Crown
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#FFE066');
    grad.addColorStop(1, '#D4AF37');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFF8DC';
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👑', 32, 35);
  } else if (type === 'mod') {
    // Cobalt Blue Cyber Shield
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#bae6fd';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛡️', 32, 35);
  } else if (type === 'staff') {
    // Silver Star
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#64748b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', 32, 35);
  } else if (type === 'video') {
    // Neon Film Slate
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#f43f5e');
    grad.addColorStop(1, '#881337');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fda4af';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎬', 32, 35);
  } else if (type === 'photo') {
    // Camera Lens
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(1, '#164e63');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a5f3fc';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📸', 32, 35);
  } else if (type === 'graphics') {
    // Vector Pen / Palette
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(1, '#78350f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎨', 32, 35);
  } else if (type === 'animator') {
    // Animator Diamond / Star
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#a855f7');
    grad.addColorStop(1, '#581c87');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e9d5ff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💫', 32, 35);
  } else if (type === 'motion') {
    // Motion Designer Keyframe
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#00d2ff');
    grad.addColorStop(1, '#0047ff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#bbf2f6';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', 32, 35);
  } else if (type === 'client') {
    // Gold Briefcase
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a7f3d0';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💼', 32, 35);
  } else if (type === 'ae') {
    // After Effects Box
    ctx.fillStyle = '#00005B';
    ctx.fillRect(4, 4, 56, 56);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#D291FF';
    ctx.strokeRect(4, 4, 56, 56);

    ctx.fillStyle = '#D291FF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ae', 32, 34);
  } else if (type === 'pr') {
    // Premiere Pro Box
    ctx.fillStyle = '#300030';
    ctx.fillRect(4, 4, 56, 56);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#EA77FF';
    ctx.strokeRect(4, 4, 56, 56);

    ctx.fillStyle = '#EA77FF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Pr', 32, 34);
  } else if (type === 'ps') {
    // Photoshop Box
    ctx.fillStyle = '#001E36';
    ctx.fillRect(4, 4, 56, 56);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#31A8FF';
    ctx.strokeRect(4, 4, 56, 56);

    ctx.fillStyle = '#31A8FF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ps', 32, 34);
  } else if (type === 'davinci') {
    // DaVinci Resolve Radial Badge
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff4d4d';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎛️', 32, 35);
  } else if (type === 'capcut') {
    // CapCut Minimalist Badge
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📱', 32, 35);
  }

  return canvas.toBuffer('image/png');
}

// 2. Custom Creator Emojis (128x128 PNG)
function createCreatorEmoji(name) {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  if (name === 'w_edit') {
    // Bright glowing neon green W
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(1, '#15803d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#86efac';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', 64, 68);
  } else if (name === 'fire_cut') {
    // Fire Reel
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#f97316');
    grad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fed7aa';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔥', 64, 68);
  } else if (name === 'render_error') {
    // Render Warning
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fca5a5';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', 64, 68);
  } else if (name === 'render_100') {
    // 100% check
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#93c5fd';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100%', 64, 68);
  } else if (name === 'timeline_keyframe') {
    // Glowing Keyframe Diamond
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(64, 16);
    ctx.lineTo(112, 64);
    ctx.lineTo(64, 112);
    ctx.lineTo(16, 64);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#e0f2fe';
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

// 3. Custom Editor Sticker (320x320 PNG)
function createEditorSticker(name) {
  const canvas = createCanvas(320, 320);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 320, 320);

  if (name === 'w_edit_sticker') {
    // Big round verified W Edit badge
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(160, 160, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#bbf7d0';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 130px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', 160, 150);

    ctx.fillStyle = '#bbf7d0';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('EDIT VERIFIED', 160, 230);
  } else if (name === 'ae_not_responding') {
    // Windows Error Modal Sticker
    ctx.fillStyle = '#202020';
    ctx.fillRect(20, 40, 280, 240);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(20, 40, 280, 240);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(20, 40, 280, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AfterFX.exe Error', 160, 72);

    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.fillText('Not Responding', 160, 140);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Render queue crashed :(', 160, 180);

    ctx.fillStyle = '#334155';
    ctx.fillRect(90, 215, 140, 45);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Close Program', 160, 243);
  } else if (name === 'one_last_revision') {
    // Client sticky note
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(30, 30, 260, 260);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ca8a04';
    ctx.strokeRect(30, 30, 260, 260);

    ctx.fillStyle = '#854d0e';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLIENT SAYS:', 160, 90);

    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('"Can you make', 160, 150);
    ctx.fillText('it POP?!"', 160, 190);

    ctx.font = 'italic 20px sans-serif';
    ctx.fillStyle = '#854d0e';
    ctx.fillText('(Revision #47)', 160, 250);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  createRoleIcon,
  createCreatorEmoji,
  createEditorSticker,
  downloadFile
};
