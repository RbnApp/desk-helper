# Desk Helper'ı winget'e gönderir. PowerShell'de tek satır:
#   irm https://raw.githubusercontent.com/RbnApp/desk-helper/claude/project-thread-cpahcg/winget/gonder.ps1 | iex
# Token gerekmez: wingetcreate tarayıcıda GitHub girişi açar, sen onaylarsın, PR'ı kendisi açar.
$ErrorActionPreference = 'Stop'
$ver = '0.3.9'
$base = "https://raw.githubusercontent.com/RbnApp/desk-helper/claude/project-thread-cpahcg/winget/manifests/r/RbnApp/DeskHelper/$ver"
$dir = Join-Path $env:TEMP "DeskHelper-winget-$ver"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "1/3 Manifest dosyaları indiriliyor..."
foreach ($f in 'RbnApp.DeskHelper.yaml', 'RbnApp.DeskHelper.installer.yaml',
               'RbnApp.DeskHelper.locale.en-US.yaml', 'RbnApp.DeskHelper.locale.tr-TR.yaml') {
  Invoke-WebRequest -UseBasicParsing "$base/$f" -OutFile (Join-Path $dir $f)
}

$wc = Get-Command wingetcreate -ErrorAction SilentlyContinue
if (-not $wc) {
  Write-Host "2/3 wingetcreate kuruluyor..."
  winget install -e --id Microsoft.WingetCreate --accept-source-agreements --accept-package-agreements
  $wc = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wingetcreate.exe'
} else { $wc = $wc.Source; Write-Host "2/3 wingetcreate zaten kurulu." }

Write-Host "3/3 Gönderiliyor. Tarayıcıda GitHub girişi açılırsa onayla (RbnCore hesabı)."
& $wc submit $dir
Write-Host "Bitti. Yukarıdaki PR adresini Claude'a gönderebilirsin."
