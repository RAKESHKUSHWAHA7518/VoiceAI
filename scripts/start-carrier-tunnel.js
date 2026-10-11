#!/usr/bin/env node
// ============================================================================
// Phase 11: Real Twilio PSTN Phone Carrier Tunnel Helper
// Bridges real phone calls from Twilio PSTN to your local VoiceAI server
// ============================================================================

const { spawn, execSync } = require('child_process');

const PORT = process.env.PORT || 8000;

console.log('================================================================');
console.log('  VoiceAI — Real Twilio PSTN Carrier Tunnel Launcher');
console.log('================================================================');
console.log(`Brdiging real telephone network calls to http://localhost:${PORT}`);
console.log('');

// Check available tunnel tools
let tunnelTool = 'cloudflared';
try {
  execSync('cloudflared --version', { stdio: 'ignore' });
} catch {
  try {
    execSync('ngrok --version', { stdio: 'ignore' });
    tunnelTool = 'ngrok';
  } catch {
    tunnelTool = 'npx-cloudflared';
  }
}

console.log(`[Tunnel] Using carrier bridge tool: ${tunnelTool}`);

if (tunnelTool === 'cloudflared' || tunnelTool === 'npx-cloudflared') {
  console.log(`Starting Cloudflare Quick Tunnel to port ${PORT}...`);
  const cmd = tunnelTool === 'cloudflared' ? 'cloudflared' : 'npx';
  const args = tunnelTool === 'cloudflared'
    ? ['tunnel', '--url', `http://localhost:${PORT}`]
    : ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`];

  const tunnelProcess = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });

  tunnelProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
      const publicUrl = urlMatch[0];
      console.log('');
      console.log('================================================================');
      console.log('  🎉 LIVE TWILIO CARRIER WEBHOOK IS READY!');
      console.log('================================================================');
      console.log(`Public URL:     ${publicUrl}`);
      console.log(`Twilio Webhook: ${publicUrl}/api/telephony/inbound`);
      console.log(`Media Stream:   wss://${publicUrl.replace('https://', '')}/media-stream`);
      console.log('');
      console.log('CONFIGURATION STEPS:');
      console.log('1. Go to Twilio Console -> Phone Numbers -> Active Numbers');
      console.log('2. Click your phone number');
      console.log(`3. Under "A CALL COMES IN", select "Webhook" (HTTP POST) and enter:`);
      console.log(`   ${publicUrl}/api/telephony/inbound`);
      console.log('4. Click Save.');
      console.log('5. Call your number from your mobile phone to speak with Maya!');
      console.log('================================================================');
      console.log('');
    }
  });

  tunnelProcess.on('close', (code) => {
    console.log(`Tunnel closed with exit code ${code}`);
  });

} else if (tunnelTool === 'ngrok') {
  console.log(`Starting ngrok tunnel to port ${PORT}...`);
  const ngrokProcess = spawn('ngrok', ['http', String(PORT)], { stdio: 'inherit' });
  ngrokProcess.on('close', (code) => {
    console.log(`ngrok closed with exit code ${code}`);
  });
}
