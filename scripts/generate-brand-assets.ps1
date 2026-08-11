$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'Trace.png'
$webIconDirectory = Join-Path $projectRoot 'public\icons'
New-Item -ItemType Directory -Force $webIconDirectory | Out-Null

function Write-ResizedPng([string]$targetPath, [int]$width, [int]$height) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $width, $height)))
    } finally {
      $graphics.Dispose()
    }
    $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Write-SplashPng([string]$targetPath, [int]$width, [int]$height) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#fffcfe'))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $side = [int]([Math]::Min($width, $height) * 0.48)
      $left = [int](($width - $side) / 2)
      $top = [int](($height - $side) / 2)
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle($left, $top, $side, $side)))
    } finally {
      $graphics.Dispose()
    }
    $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

foreach ($size in @(32, 180, 192, 512)) {
  Write-ResizedPng (Join-Path $webIconDirectory "trace-icon-$size.png") $size $size
}

$legacySizes = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
$foregroundSizes = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }
foreach ($density in $legacySizes.Keys) {
  $directory = Join-Path $projectRoot "android\app\src\main\res\mipmap-$density"
  Write-ResizedPng (Join-Path $directory 'ic_launcher.png') $legacySizes[$density] $legacySizes[$density]
  Write-ResizedPng (Join-Path $directory 'ic_launcher_round.png') $legacySizes[$density] $legacySizes[$density]
  Write-ResizedPng (Join-Path $directory 'ic_launcher_foreground.png') $foregroundSizes[$density] $foregroundSizes[$density]
}

Get-ChildItem (Join-Path $projectRoot 'android\app\src\main\res') -Recurse -Filter splash.png | ForEach-Object {
  $existing = [System.Drawing.Image]::FromFile($_.FullName)
  $width = $existing.Width
  $height = $existing.Height
  $existing.Dispose()
  Write-SplashPng $_.FullName $width $height
}

Write-Output 'Generated Trace branding assets from Trace.png without altering the source file.'
