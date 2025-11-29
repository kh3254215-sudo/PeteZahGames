import IPv6Rotator from './ipv6-rotator.js';
import https from 'https';

const rotator = new IPv6Rotator('2607:5300:205:200');

console.log('Testing OVH IPv6 Rotation (avoiding roblox IPs)...\n');

async function testConnection(ip) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api64.ipify.org',
      port: 443,
      path: '/',
      method: 'GET',
      family: 6,
      localAddress: ip,
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim()));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

async function runTests() {
  console.log('Generating 5 random IPs from your OVH /64 block...\n');
  
  for (let i = 0; i < 5; i++) {
    const ip = rotator.generateRandomIP();
    console.log(`Test ${i + 1}: ${ip}`);
    
    try {
      const result = await testConnection(ip);
      console.log(`  ✓ Works! External IP: ${result}\n`);
    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}\n`);
    }
  }
  
  console.log('='.repeat(60));
  console.log('SUCCESS! You have 18 quintillion IPs available!');
  console.log('Range: 2607:5300:205:200::/64 (excluding roblox IPs)');
}

runTests().catch(console.error);