// Quick diagnostic script to test backend issues
const https = require('https');

const backendUrl = 'https://aca-ai-chat-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io';

console.log('Testing backend endpoints...\n');

// Test health endpoint
https.get(`${backendUrl}/api/health`, (res) => {
  console.log(`Health endpoint status: ${res.statusCode}`);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Health response:', data));
}).on('error', (e) => {
  console.error('Health endpoint error:', e.message);
});

// Test threads endpoint
setTimeout(() => {
  https.get(`${backendUrl}/api/threads`, (res) => {
    console.log(`\nThreads endpoint status: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Threads response:', data));
  }).on('error', (e) => {
    console.error('Threads endpoint error:', e.message);
  });
}, 1000);
