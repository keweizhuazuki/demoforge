// Dependency-free guardrail, not a replacement for provider revocation or a full secret scanner.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const patterns=[/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g,/\bgh[pousr]_[A-Za-z0-9]{25,}\b/g,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
let findings=0;
function check(text,label){for(const pattern of patterns){pattern.lastIndex=0;if(pattern.test(text)){console.error(`Potential credential in ${label} (value redacted)`);findings++;}}}
for(const file of execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)) {
  if(/(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example')) {console.error(`Forbidden environment file tracked: ${file}`);findings++;}
  check(readFileSync(file).toString('utf8'),file);
}
try {check(execFileSync('git',['log','--all','--format=','-p','--no-ext-diff'],{encoding:'utf8',maxBuffer:30*1024*1024}),'Git history');} catch(e){if(!String(e.stderr).includes('does not have any commits')) throw e;}
if(findings) process.exit(1);console.log('Secret scan passed: tracked content and Git history; matching values are never printed.');
