// Sürüm kuralına göre bir sonraki sürüme geç (bkz. VERSIONING.md).
// Kullanım: npm run bump          -> 0.3.8 -> 0.3.9 -> 0.4.0 -> 0.4.1 ... 0.9.9 -> 1.0.0
//           npm run bump -- --dry -> yalnızca ne olacağını yazar
const fs = require('fs');
const path = require('path');

function next(version) {
  let [major, minor, patch] = version.split('.').map(Number);
  if (![major, minor, patch].every(Number.isInteger)) throw new Error(`Geçersiz sürüm: ${version}`);
  patch += 1;
  if (patch > 9) { patch = 0; minor += 1; }
  if (minor > 9) { minor = 0; major += 1; }
  return `${major}.${minor}.${patch}`;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const to = next(pkg.version);
  console.log(`${pkg.version} -> ${to}`);
  if (!process.argv.includes('--dry')) {
    pkg.version = to;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    const lockPath = path.join(root, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      lock.version = to;
      if (lock.packages?.['']) lock.packages[''].version = to;
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    }
  }
}

module.exports = { next };
