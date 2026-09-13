const [expected] = process.argv.slice(2);

if (!expected) {
  console.error('Usage: node scripts/assert-platform.mjs <win32|darwin|linux>');
  process.exit(2);
}

if (process.platform !== expected) {
  console.error(`This release target requires ${expected}, but the current platform is ${process.platform}.`);
  process.exit(1);
}
