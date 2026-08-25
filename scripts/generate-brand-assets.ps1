param(
  [switch]$IconsOnly,
  [switch]$AndroidOnly,
  [switch]$HeaderLogoOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'Trace.png'
$webIconDirectory = Join-Path $projectRoot 'public\icons'
$headerLogoSourcePath = Join-Path $webIconDirectory 'trace-logo.png'
New-Item -ItemType Directory -Force $webIconDirectory | Out-Null

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$targetPath) {
  $temporaryPath = "$targetPath.$([Guid]::NewGuid().ToString('N')).tmp"
  $backupPath = "$targetPath.$([Guid]::NewGuid().ToString('N')).bak"
  $movedExisting = $false
  try {
    $bitmap.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
    if (Test-Path -LiteralPath $targetPath) {
      Move-Item -LiteralPath $targetPath -Destination $backupPath -ErrorAction Stop
      $movedExisting = $true
    }
    try {
      Move-Item -LiteralPath $temporaryPath -Destination $targetPath -ErrorAction Stop
    } catch {
      if ($movedExisting -and -not (Test-Path -LiteralPath $targetPath)) {
        Move-Item -LiteralPath $backupPath -Destination $targetPath -ErrorAction SilentlyContinue
      }
      throw
    }
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
    if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Force }
  }
}

function Write-ResizedPng([string]$targetPath, [int]$width, [int]$height) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $width, $height)))
    } finally {
      $graphics.Dispose()
    }
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Add-RoundedRectangle([System.Drawing.Drawing2D.GraphicsPath]$path, [int]$left, [int]$top, [int]$width, [int]$height, [int]$radius) {
  $diameter = $radius * 2
  $path.AddArc($left, $top, $diameter, $diameter, 180, 90)
  $path.AddArc($left + $width - $diameter, $top, $diameter, $diameter, 270, 90)
  $path.AddArc($left + $width - $diameter, $top + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($left, $top + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
}

function Write-FaviconPng([string]$targetPath, [int]$size) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
      $padding = [Math]::Max(1, [int][Math]::Round($size * 0.06))
      $radius = [Math]::Max(2, [int][Math]::Round($size * 0.2))
      $contentSize = $size - (2 * $padding)
      Add-RoundedRectangle $clip $padding $padding $contentSize $contentSize $radius
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.SetClip($clip)
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $cropSide = [int][Math]::Round($source.Width * 0.67)
      $cropLeft = [int][Math]::Round(($source.Width - $cropSide) / 2)
      $cropTop = [int][Math]::Round($source.Height * 0.145)
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle($padding, $padding, $contentSize, $contentSize)), $cropLeft, $cropTop, $cropSide, $cropSide, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $clip.Dispose()
      $graphics.Dispose()
    }
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Write-TransparentHeaderLogoPng([string]$targetPath) {
  $source = [System.Drawing.Bitmap]::FromFile($headerLogoSourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $source.Height; $y++) {
      for ($x = 0; $x -lt $source.Width; $x++) {
        $pixel = $source.GetPixel($x, $y)
        $minimum = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        $maximum = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
        # The wordmark source is on a near-white matte. Remove only neutral matte pixels
        # so the header asset stays transparent without changing the colored artwork.
        if ($minimum -gt 238 -and ($maximum - $minimum) -lt 14) {
          $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
        } else {
          $bitmap.SetPixel($x, $y, $pixel)
        }
      }
    }
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Write-AdaptiveForegroundPng([string]$targetPath, [int]$size) {
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $cropSide = [int][Math]::Round($source.Width * 0.67)
    $cropLeft = [int][Math]::Round(($source.Width - $cropSide) / 2)
    $cropTop = [int][Math]::Round($source.Height * 0.145)
    $mark = New-Object System.Drawing.Bitmap($cropSide, $cropSide, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $markGraphics = [System.Drawing.Graphics]::FromImage($mark)
    try { $markGraphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $cropSide, $cropSide)), $cropLeft, $cropTop, $cropSide, $cropSide, [System.Drawing.GraphicsUnit]::Pixel) } finally { $markGraphics.Dispose() }
    for ($y = 0; $y -lt $mark.Height; $y++) {
      for ($x = 0; $x -lt $mark.Width; $x++) {
        $pixel = $mark.GetPixel($x, $y)
        $minimum = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        $maximum = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
        if ($minimum -gt 238 -and ($maximum - $minimum) -lt 14) { $mark.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B)) }
      }
    }
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      # Keep the complete orbit comfortably inside Android's adaptive-icon safe zone.
      # The launcher supplies the white background and device-specific outer mask.
      $contentSide = [int][Math]::Round($size * 0.56)
      $offset = [int](($size - $contentSide) / 2)
      $graphics.DrawImage($mark, (New-Object System.Drawing.Rectangle($offset, $offset, $contentSide, $contentSide)))
    } finally { $graphics.Dispose() }
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
    $mark.Dispose()
  } finally {
    $source.Dispose()
  }
}

function Write-LegacyLauncherPng([string]$targetPath, [int]$size) {
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $cropSide = [int][Math]::Round($source.Width * 0.67)
    $cropLeft = [int][Math]::Round(($source.Width - $cropSide) / 2)
    $cropTop = [int][Math]::Round($source.Height * 0.145)
    $mark = New-Object System.Drawing.Bitmap($cropSide, $cropSide, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $markGraphics = [System.Drawing.Graphics]::FromImage($mark)
    try { $markGraphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $cropSide, $cropSide)), $cropLeft, $cropTop, $cropSide, $cropSide, [System.Drawing.GraphicsUnit]::Pixel) } finally { $markGraphics.Dispose() }
    for ($y = 0; $y -lt $mark.Height; $y++) {
      for ($x = 0; $x -lt $mark.Width; $x++) {
        $pixel = $mark.GetPixel($x, $y)
        $minimum = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        $maximum = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
        if ($minimum -gt 238 -and ($maximum - $minimum) -lt 14) { $mark.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B)) }
      }
    }
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $contentSide = [int][Math]::Round($size * 0.56)
      $offset = [int](($size - $contentSide) / 2)
      $graphics.DrawImage($mark, (New-Object System.Drawing.Rectangle($offset, $offset, $contentSide, $contentSide)))
    } finally { $graphics.Dispose() }
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
    $mark.Dispose()
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
    Save-Png $bitmap $targetPath
    $bitmap.Dispose()
  } finally {
    $source.Dispose()
  }
}

if ($HeaderLogoOnly) {
  Write-TransparentHeaderLogoPng (Join-Path $webIconDirectory 'trace-header-logo.png')
} elseif (-not $AndroidOnly) {
  foreach ($size in @(32, 180, 192, 512)) {
    Write-ResizedPng (Join-Path $webIconDirectory "trace-icon-$size.png") $size $size
  }
  foreach ($size in @(16, 32)) {
    Write-FaviconPng (Join-Path $webIconDirectory "trace-favicon-$size.png") $size
  }
  Write-ResizedPng (Join-Path $webIconDirectory 'trace-icon-maskable-512.png') 512 512
}

if (-not $HeaderLogoOnly) {
  $legacySizes = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
  $foregroundSizes = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }
  foreach ($density in $legacySizes.Keys) {
    $directory = Join-Path $projectRoot "android\app\src\main\res\mipmap-$density"
    Write-LegacyLauncherPng (Join-Path $directory 'ic_trace_launcher.png') $legacySizes[$density]
    Write-LegacyLauncherPng (Join-Path $directory 'ic_trace_launcher_round.png') $legacySizes[$density]
    Write-AdaptiveForegroundPng (Join-Path $directory 'ic_trace_launcher_foreground.png') $foregroundSizes[$density]
  }
}

if (-not $HeaderLogoOnly -and -not $IconsOnly -and -not $AndroidOnly) {
  Get-ChildItem (Join-Path $projectRoot 'android\app\src\main\res') -Recurse -Filter splash.png | ForEach-Object {
    $existing = [System.Drawing.Image]::FromFile($_.FullName)
    $width = $existing.Width
    $height = $existing.Height
    $existing.Dispose()
    Write-SplashPng $_.FullName $width $height
  }
}

$assetKind = if ($HeaderLogoOnly) { 'transparent header logo' } elseif ($AndroidOnly) { 'Android app icon' } elseif ($IconsOnly) { 'app icon' } else { 'branding' }
Write-Output "Generated Trace $assetKind assets from Trace.png without altering the source file."
