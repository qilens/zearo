$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -Encoding utf8 $manifestPath | ConvertFrom-Json
$version = $manifest.version

if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "manifest.json contains an invalid version: $version"
}

$runtimeFiles = @(
  "manifest.json",
  "service-worker.js",
  "core.js",
  "content.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js"
)
$runtimeDirectories = @("assets", "_locales")
$outputDirectory = Join-Path $projectRoot "dist"
$outputPath = Join-Path $outputDirectory "zearo-v$version.zip"
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("zearo-package-" + [guid]::NewGuid())

try {
  New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

  foreach ($relativePath in $runtimeFiles) {
    $source = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Required runtime file is missing: $relativePath"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stagingDirectory $relativePath)
  }

  foreach ($relativePath in $runtimeDirectories) {
    $source = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
      throw "Required runtime directory is missing: $relativePath"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stagingDirectory $relativePath) -Recurse
  }

  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  Compress-Archive -Path (Join-Path $stagingDirectory "*") -DestinationPath $outputPath -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    $requiredEntries = @(
      "manifest.json",
      "assets/icon-128.png",
      "_locales/zh_CN/messages.json"
    )
    foreach ($entryName in $requiredEntries) {
      if ($entryNames -notcontains $entryName) {
        throw "Package validation failed; missing: $entryName"
      }
    }

    $forbiddenPrefixes = @("dist/", "docs/", "tests/", ".git/", "scripts/")
    foreach ($entryName in $entryNames) {
      foreach ($prefix in $forbiddenPrefixes) {
        if ($entryName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
          throw "Package validation failed; forbidden path found: $entryName"
        }
      }
    }

    $manifestEntry = $archive.GetEntry("manifest.json")
    $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try {
      $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }
    if ($packagedManifest.version -ne $version) {
      throw "Package version does not match manifest.json"
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output $outputPath
} finally {
  if (Test-Path -LiteralPath $stagingDirectory) {
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
  }
}
