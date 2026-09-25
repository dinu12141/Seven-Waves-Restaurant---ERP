import net from 'net';

const SUBNET = '192.168.1';
const PORT = 4370;
const TIMEOUT = 800;

console.log(`Scanning subnet ${SUBNET}.1 to ${SUBNET}.254 on port ${PORT}...`);

function checkIp(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT);

    socket.on('connect', () => {
      console.log(`\n🎉 FOUND BIOMETRIC DEVICE at: ${ip}:${PORT}!`);
      socket.destroy();
      resolve(ip);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });

    socket.connect(PORT, ip);
  });
}

async function scan() {
  const batchSize = 25;
  const found = [];

  for (let i = 1; i <= 254; i += batchSize) {
    const promises = [];
    for (let j = i; j < i + batchSize && j <= 254; j++) {
      promises.push(checkIp(`${SUBNET}.${j}`));
    }
    const results = await Promise.all(promises);
    results.forEach((res) => {
      if (res) found.push(res);
    });
    process.stdout.write(`.` );
  }

  console.log('\n--- Scan Completed ---');
  if (found.length > 0) {
    console.log('Biometric devices found at:', found);
  } else {
    console.log('No devices responded on port 4370 on subnet 192.168.1.x.');
  }
}

scan().catch(console.error);
