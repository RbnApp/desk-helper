// Sistem paneli (sağdaki 📊 paneli) için veriler. Yalnızca panel açıkken toplanır: renderer 'sys:start' / 'sys:stop'
// der, açıkken 2 sn'de bir 'sys:tick' gelir. Ek program gerekmez:
//  - İşlemci %, RAM, açık kalma süresi: Node'un os modülü.
//  - Windows'ta ağ, disk okuma/yazma, ekran kartı kullanımı ve belleği, diskler, en yoğun işlemler: tek bir sürekli
//    açık PowerShell'den WMI (Win32_PerfFormattedData_*; Türkçe Windows'ta da adları değişmeyen sınıflar).
//  - NVIDIA kartta sıcaklık, güç, saat hızı, fan: sürücüyle gelen nvidia-smi (yoksa bu satırlar boş kalır).
//  - Donanım bilgisi (Windows sürümü, işlemci, ekran kartı, anakart, bellek, depolama, monitör, ağ ve ses kartı):
//    panel ilk açıldığında bir kez okunur.
//  - Hava durumu: Open-Meteo (ücretsiz, hesap gerekmez); 15 dk önbellek.
// Linux'ta (yalnızca geliştirme/test) aynı veriler /proc, df ve ps'ten.
const { ipcMain, net, screen } = require('electron');
const os = require('os');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32';
let sender = null, timer = null, ps = null, psLast = null, prevCpu = null, prevNet = null, staticInfo = null;
const nvidiaSmi = () => (WIN ? 'nvidia-smi.exe' : 'nvidia-smi');

// Betik -EncodedCommand ile verilir (UTF-16LE base64): stdin'den okumada çok satırlı bloklar (while { … }) satır satır
// yorumlanıp takılabiliyor.
const psArgs = (script) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];

function cpuPercent() {
  const c = os.cpus();
  const sum = c.reduce((a, x) => { const t = x.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { idle: 0, total: 0 });
  const prev = prevCpu; prevCpu = sum;
  if (!prev || sum.total === prev.total) return null;
  return Math.max(0, Math.min(100, 100 * (1 - (sum.idle - prev.idle) / (sum.total - prev.total))));
}

// --- Windows: sürekli açık PowerShell (her 2 sn bir JSON satırı) ---
const PS_LOOP = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$cores = [Environment]::ProcessorCount
while ($true) {
  $net = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Measure-Object -Property BytesReceivedPersec, BytesSentPersec -Sum
  $dk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
  $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
  $g3d = ($eng | Where-Object { $_.Name -like '*engtype_3D*' } | Measure-Object -Property UtilizationPercentage -Sum).Sum
  $gmem = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | Measure-Object -Property DedicatedUsage -Sum).Sum
  $vols = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ id = $_.DeviceID; name = $_.VolumeName; size = [double]$_.Size; free = [double]$_.FreeSpace } }
  $procs = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } |
    Group-Object { $_.Name -replace '#\d+$', '' } | ForEach-Object {
      @{ name = $_.Name; cpu = [math]::Round((($_.Group | Measure-Object PercentProcessorTime -Sum).Sum) / $cores, 1); mem = [double](($_.Group | Measure-Object WorkingSetPrivate -Sum).Sum) }
    }
  $topMem = $procs | Sort-Object { $_.mem } -Descending | Select-Object -First 6
  $topCpu = $procs | Sort-Object { $_.cpu } -Descending | Select-Object -First 6
  @{ rx = [double]$net.Sum[0]; tx = [double]$net.Sum[1]; dr = [double]$dk.DiskReadBytesPersec; dw = [double]$dk.DiskWriteBytesPersec;
     dbusy = [double]$dk.PercentDiskTime; gpu = [double]$g3d; gmem = [double]$gmem; vols = @($vols); topMem = @($topMem); topCpu = @($topCpu) } | ConvertTo-Json -Compress -Depth 4
  Start-Sleep -Milliseconds 1700
}`;

function startPs() {
  if (!WIN || ps) return;
  ps = spawn('powershell.exe', psArgs(PS_LOOP), { windowsHide: true });
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('{')) try { psLast = JSON.parse(line); } catch {}
    }
  });
  ps.on('exit', () => { ps = null; });
  ps.on('error', () => { ps = null; });
}
function stopPs() { try { ps?.kill(); } catch {} ps = null; psLast = null; }

// --- Linux (geliştirme/test) ---
function linuxDynamic() {
  const out = {};
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).filter((l) => l.trim() && !l.trim().startsWith('lo:'));
    const tot = lines.reduce((a, l) => { const f = l.split(':')[1].trim().split(/\s+/).map(Number); a.rx += f[0]; a.tx += f[8]; return a; }, { rx: 0, tx: 0 });
    const now = Date.now();
    if (prevNet) { const s = (now - prevNet.t) / 1000; out.rx = Math.max(0, (tot.rx - prevNet.rx) / s); out.tx = Math.max(0, (tot.tx - prevNet.tx) / s); }
    prevNet = { ...tot, t: now };
  } catch {}
  return new Promise((res) => {
    execFile('df', ['-B1', '--output=target,size,avail', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'overlay'], (e1, df) => {
      out.vols = (df || '').split('\n').slice(1).filter(Boolean).map((l) => { const [id, size, free] = l.trim().split(/\s+/); return { id, size: +size, free: +free }; })
        .filter((v) => v.size > 1e9).slice(0, 4);
      execFile('ps', ['-eo', 'comm,rss,pcpu', '--sort=-rss'], (e2, p) => {
        const rows = (p || '').split('\n').slice(1).filter(Boolean).map((l) => { const m = l.trim().match(/^(.*?)\s+(\d+)\s+([\d.]+)$/); return m && { name: m[1], mem: +m[2] * 1024, cpu: +m[3] }; }).filter(Boolean);
        out.topMem = rows.slice(0, 6);
        out.topCpu = [...rows].sort((a, b) => b.cpu - a.cpu).slice(0, 6);
        res(out);
      });
    });
  });
}

function nvidia() {
  return new Promise((res) => {
    execFile(nvidiaSmi(), ['--query-gpu=name,temperature.gpu,power.draw,clocks.gr,fan.speed,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 1500, windowsHide: true }, (err, out) => {
        if (err || !out) return res(null);
        const f = out.split('\n')[0].split(',').map((x) => x.trim());
        const n = (x) => (Number.isFinite(+x) ? +x : null);
        res({ name: f[0], temp: n(f[1]), power: n(f[2]), clock: n(f[3]), fan: n(f[4]), util: n(f[5]), memUsed: n(f[6]) * 1048576, memTotal: n(f[7]) * 1048576 });
      });
  });
}
let hasNvidia = true;

async function tick() {
  if (!sender || sender.isDestroyed()) { stop(); return; }
  const d = { t: Date.now(), cpu: cpuPercent(), memTotal: os.totalmem(), memFree: os.freemem(), uptime: os.uptime(), host: os.hostname() };
  Object.assign(d, WIN ? (psLast || {}) : await linuxDynamic());
  if (hasNvidia) { const g = await nvidia(); if (g) d.nv = g; else hasNvidia = false; }
  try { sender.send('sys:tick', d); } catch {}
}
function start(wc) {
  sender = wc;
  if (timer) return;
  startPs();
  cpuPercent();
  tick();
  timer = setInterval(tick, 2000);
}
function stop() { clearInterval(timer); timer = null; stopPs(); }

// --- Donanım bilgisi (bir kez) ---
const PS_STATIC = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$os = Get-CimInstance Win32_OperatingSystem
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notlike '*Basic*' -and $_.Name -notlike '*Remote*' } | ForEach-Object { $_.Name }
$bb = Get-CimInstance Win32_BaseBoard
$ram = Get-CimInstance Win32_PhysicalMemory
$disk = Get-CimInstance Win32_DiskDrive | ForEach-Object { @{ model = $_.Model; size = [double]$_.Size } }
$mon = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object { (($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join '').Trim() }
$nic = Get-CimInstance Win32_NetworkAdapter -Filter 'PhysicalAdapter=True' | Where-Object { $_.NetEnabled } | ForEach-Object { $_.Name }
$snd = Get-CimInstance Win32_SoundDevice | ForEach-Object { $_.Name }
$kb = Get-CimInstance Win32_Keyboard | ForEach-Object { $_.Description }
$ms = Get-CimInstance Win32_PointingDevice | ForEach-Object { $_.Name }
@{ os = $os.Caption; display = $cv.DisplayVersion; build = "$($cv.CurrentBuild).$($cv.UBR)";
   cpu = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors;
   gpu = @($gpu); board = "$($bb.Manufacturer) $($bb.Product)".Trim();
   ram = @($ram | ForEach-Object { @{ cap = [double]$_.Capacity; speed = $_.ConfiguredClockSpeed; maker = $_.Manufacturer } });
   disks = @($disk); monitors = @($mon); nics = @($nic); sound = @($snd); keyboards = @($kb); mice = @($ms) } | ConvertTo-Json -Compress -Depth 4`;

function readStatic() {
  const base = { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model?.trim(), threads: os.cpus().length, memTotal: os.totalmem() };
  const displays = screen.getAllDisplays().map((d) => ({ w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), hz: d.displayFrequency }));
  if (!WIN) return Promise.resolve({ ...base, displays });
  return new Promise((res) => {
    const p = spawn('powershell.exe', psArgs(PS_STATIC), { windowsHide: true });
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    const done = () => { let j = {}; try { j = JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop() || '{}'); } catch {} res({ ...base, ...j, displays }); };
    p.on('exit', done); p.on('error', done);
    setTimeout(() => { try { p.kill(); } catch {} }, 20000);
  });
}

// --- Hava durumu (Open-Meteo) ---
const GEO = process.env.DH_WEATHER_TEST ? process.env.DH_WEATHER_TEST + '/geo' : 'https://geocoding-api.open-meteo.com/v1/search';
const FC = process.env.DH_WEATHER_TEST ? process.env.DH_WEATHER_TEST + '/fc' : 'https://api.open-meteo.com/v1/forecast';
const wCache = new Map();
const TR = require('./tr-cities');
// Yurt dışı şehir araması (Türkiye'nin 81 ili uygulamada hazır; listede yoksa Open-Meteo'ya sorulur).
async function geoSearch(q, lang) {
  if (String(q || '').trim().length < 2) return [];
  const g = await (await net.fetch(`${GEO}?name=${encodeURIComponent(q)}&count=6&language=${lang === 'en' ? 'en' : 'tr'}&format=json`)).json();
  return (g.results || []).map((r) => ({ name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
}
// geo: seçilen şehrin koordinatı {lat, lon}. Yoksa 81 il listesine, o da yoksa Open-Meteo'nun aramasına bakılır.
async function weather(city, lang, geo) {
  const key = String(city || '').trim().toLocaleLowerCase('tr') + (geo ? `@${geo.lat},${geo.lon}` : '');
  if (!String(city || '').trim()) return { error: 'city' };
  const c = wCache.get(key);
  if (c && Date.now() - c.t < 15 * 60000) return c.v;
  let pl = null;
  const tr = TR.find(city);
  if (geo && Number.isFinite(+geo.lat) && Number.isFinite(+geo.lon)) pl = { name: city, latitude: +geo.lat, longitude: +geo.lon };
  else if (tr) pl = { name: tr.name, latitude: tr.lat, longitude: tr.lon };
  else {
    const g = await (await net.fetch(`${GEO}?name=${encodeURIComponent(city)}&count=1&language=${lang === 'en' ? 'en' : 'tr'}&format=json`)).json();
    pl = g.results?.[0];
  }
  if (!pl) return { error: 'notfound' };
  const q = `latitude=${pl.latitude}&longitude=${pl.longitude}&timezone=auto&forecast_days=3`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset';
  const f = await (await net.fetch(`${FC}?${q}`)).json();
  const v = { place: pl.name, current: f.current, daily: f.daily };
  wCache.set(key, { t: Date.now(), v });
  return v;
}

ipcMain.on('sys:start', (e) => start(e.sender));
ipcMain.on('sys:stop', () => stop());
ipcMain.handle('sys:static', async () => (staticInfo ||= await readStatic()));
ipcMain.handle('sys:geo', async (_e, q, lang) => { try { return await geoSearch(q, lang); } catch { return []; } });
ipcMain.handle('sys:weather', async (_e, city, lang, geo) => { try { return await weather(city, lang, geo); } catch (err) { return { error: 'net', message: err?.message }; } });

module.exports = { stop };
