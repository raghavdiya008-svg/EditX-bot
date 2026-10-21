const AIChatModule = require('../modules/ai_chat');
const mockClient = { user: { id: 'bot_id', username: 'EditX' } };
const mockDb = { config: {}, utility: { get: () => null, set: () => null } };
const aiChat = new AIChatModule(mockClient, mockDb);

const testCases = [
  { text: 'can u write a python script for me', expected: true },
  { text: 'write a script to dismantle this server', expected: true },
  { text: 'can u write a script that can create a 3d 1hr animaiton?', expected: true },
  { text: 'write me a script', expected: true },
  { text: 'can you code a discord bot for me', expected: true },
  { text: 'do my python homework', expected: true },
  { text: 'write a python script for blender bpy', expected: true },
  { text: 'can u do my work for me', expected: true },
  { text: 'how do i export 4k in premiere pro', expected: false },
  { text: 'what bitrate should i use for youtube', expected: false },
  { text: 'how do i make a smooth speed ramp in capcut', expected: false }
];

let failed = 0;
for (const tc of testCases) {
  const result = aiChat.isScriptOrWorkRequest(tc.text);
  if (result !== tc.expected) {
    console.error(`FAIL on: "${tc.text}" -> got ${result}, expected ${tc.expected}`);
    failed++;
  } else {
    console.log(`PASS: "${tc.text}" -> ${result ? 'REFUSED' : 'ALLOWED'}`);
  }
}

if (failed === 0) {
  console.log('\nAll 11 Guardrail Verification Tests PASSED!');
  console.log('\nRefusal response sample:\n' + aiChat.getScriptRefusalReply({}));
  process.exit(0);
} else {
  process.exit(1);
}
