import { spawn } from 'node:child_process';
const p = spawn('npx', ['electron', '.\\dist\\electron\\UnPackaged', '--enable-logging'], { shell: true });
p.stdout.on('data', d => console.log('OUT:', d.toString()));
p.stderr.on('data', d => console.log('ERR:', d.toString()));
p.on('close', c => console.log('CODE:', c));
