# SPDX-License-Identifier: GPL-2.0-or-later
# Run from the repository root with PowerShell 7, Node.js and JDK 21 available.
$ErrorActionPreference = 'Stop'
$circuitRevision = '5bdb1296ce6a82f79515f4f1dd1b9a86e03236f7'
$circuitBuild = Join-Path (Get-Location) 'build/circuitjs'
$circuitOutput = Join-Path (Get-Location) 'public/circuitjs'
New-Item -ItemType Directory -Force -Path $circuitBuild,$circuitOutput | Out-Null
$circuitInputs = @(
  @{ Name='source.zip'; Url="https://codeload.github.com/pfalstad/circuitjs1/zip/$circuitRevision"; Hash='d1a16f7aa89d39ece858238040b0cdf867f2058731d79e90ef13609045c971e5' },
  @{ Name='gwt-2.12.2.zip'; Url='https://github.com/gwtproject/gwt/releases/download/2.12.2/gwt-2.12.2.zip'; Hash='32c17bbc8e98548c0be433aab36a3b8ba7428cfc70a26c41c4af4e0d6ecff1e1' }
)
foreach ($circuitInput in $circuitInputs) {
  $circuitArchive = Join-Path $circuitBuild $circuitInput.Name
  if (!(Test-Path -LiteralPath $circuitArchive)) { Invoke-WebRequest -Uri $circuitInput.Url -OutFile $circuitArchive }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $circuitArchive).Hash.ToLowerInvariant() -ne $circuitInput.Hash) { throw "Input hash mismatch: $($circuitInput.Name)" }
  Expand-Archive -LiteralPath $circuitArchive -DestinationPath $circuitBuild -Force
}
$circuitSource = Join-Path $circuitBuild "circuitjs1-$circuitRevision"
$circuitSdk = Join-Path $circuitBuild 'gwt-2.12.2'
$circuitClasses = Join-Path $circuitBuild 'classes'
node scripts/patch-circuitjs-api.mjs $circuitSource
if ($LASTEXITCODE -ne 0) { throw 'API patch failed.' }
$circuitClasspath = "$circuitSdk/gwt-dev.jar;$circuitSdk/gwt-user.jar"
javac -cp $circuitClasspath -d $circuitClasses "$circuitSource/src/com/lushprojects/circuitjs1/rebind/ElementFactoryGenerator.java"
if ($LASTEXITCODE -ne 0) { throw 'GWT generator compilation failed.' }
java "-Dgwt.persistentunitcachedir=$circuitBuild/cache" -Xmx3072m -cp "$circuitClasses;$circuitClasspath;$circuitSource/src" com.google.gwt.dev.Compiler -war $circuitOutput -localWorkers 2 -style OBF -optimize 9 -sourceLevel 17 com.lushprojects.circuitjs1.circuitjs1
if ($LASTEXITCODE -ne 0) { throw 'GWT compilation failed.' }
# GWT emits server/debug metadata beside the browser assets. This static app
# needs no servlet policies or symbol maps; keep that directory out of releases.
$circuitOutputResolved = (Resolve-Path -LiteralPath $circuitOutput).Path
$circuitPrivateOutput = Join-Path $circuitOutputResolved 'WEB-INF'
if (Test-Path -LiteralPath $circuitPrivateOutput) {
  $circuitPrivateResolved = (Resolve-Path -LiteralPath $circuitPrivateOutput).Path
  if ($circuitPrivateResolved -ne (Join-Path $circuitOutputResolved 'WEB-INF') -or (Get-Item -LiteralPath $circuitPrivateResolved).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe GWT metadata cleanup path.' }
  Remove-Item -LiteralPath $circuitPrivateResolved -Recurse -Force
}
Get-ChildItem -LiteralPath "$circuitSource/war" | Where-Object { $_.Name -notin @('WEB-INF','service-worker.js','service-worker.orig','update-service-worker.sh','manifest.json','shortrelay.php') } | Copy-Item -Destination $circuitOutput -Recurse -Force
Copy-Item -LiteralPath "$circuitSource/COPYING.txt" -Destination "$circuitOutput/COPYING.txt"
Copy-Item -LiteralPath "$circuitSdk/COPYING" -Destination "$circuitOutput/GWT-COPYING.txt"
Copy-Item -LiteralPath "$circuitBuild/source.zip" -Destination "$circuitOutput/upstream-source.zip"
Copy-Item -LiteralPath 'scripts/patch-circuitjs-api.mjs','scripts/build-circuitjs.ps1' -Destination $circuitOutput
$circuitHtml = Get-Content -LiteralPath "$circuitOutput/circuitjs.html" -Raw
$circuitHtml = $circuitHtml.Replace('<link rel="manifest" href="/circuit/manifest.json">','').Replace('<title></title>','<title>CircuitJS1 · AnaCode schematic editor</title>')
$circuitHtml = [regex]::Replace($circuitHtml, '(?s)<script>\s*if \(''serviceWorker'' in navigator\).*?</script>', '<!-- AnaCode: local application assets are versioned by the hosting build. -->')
Set-Content -LiteralPath "$circuitOutput/circuitjs.html" -Value $circuitHtml -Encoding utf8
node scripts/audit-circuitjs.mjs --record
if ($LASTEXITCODE -ne 0) { throw 'Artifact manifest failed.' }
