Add-Type -AssemblyName System.Drawing

$outputDir = Join-Path $PSScriptRoot '..\public\assets\pwa'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function New-RoundedPath([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
  $path.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-SpudnautIcon([string]$path, [int]$size, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::FromArgb(5, 7, 13))

  if (-not $maskable) {
    $background = New-RoundedPath 0 0 $size $size ($size * 0.19)
    $graphics.FillPath([System.Drawing.Brushes]::Black, $background)
    $background.Dispose()
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(5, 7, 13))
    $background = New-RoundedPath 2 2 ($size - 4) ($size - 4) ($size * 0.18)
    $graphics.FillPath($brush, $background)
    $background.Dispose()
    $brush.Dispose()
  }

  $scale = if ($maskable) { $size / 64.0 * 0.75 } else { $size / 64.0 }
  $offset = ($size - 64 * $scale) / 2
  $graphics.TranslateTransform([single]$offset, [single]$offset)
  $graphics.ScaleTransform([single]$scale, [single]$scale)

  $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(11, 13, 16), 2)
  $suit = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(224, 232, 236))
  $potato = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(239, 125, 13))
  $visor = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(72, 179, 205))
  $shine = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(232, 251, 255), 1.5)

  $graphics.FillEllipse($suit, 5, 30, 12, 17)
  $graphics.DrawEllipse($outline, 5, 30, 12, 17)
  $graphics.FillEllipse($suit, 47, 30, 12, 17)
  $graphics.DrawEllipse($outline, 47, 30, 12, 17)

  $bootLeft = New-RoundedPath 18 42 13 13 4
  $graphics.FillPath($suit, $bootLeft)
  $graphics.DrawPath($outline, $bootLeft)
  $bootLeft.Dispose()
  $bootRight = New-RoundedPath 33 42 13 13 4
  $graphics.FillPath($suit, $bootRight)
  $graphics.DrawPath($outline, $bootRight)
  $bootRight.Dispose()

  $body = New-Object System.Drawing.Drawing2D.GraphicsPath
  $body.StartFigure()
  $body.AddBezier(32, 8, 45, 8, 51, 17, 51, 31)
  $body.AddLine(51, 42, 51, 42)
  $body.AddBezier(51, 42, 51, 49, 47, 52, 41, 52)
  $body.AddLine(23, 52, 23, 52)
  $body.AddBezier(23, 52, 17, 52, 13, 49, 13, 42)
  $body.AddLine(13, 31, 13, 31)
  $body.AddBezier(13, 31, 13, 17, 19, 8, 32, 8)
  $body.CloseFigure()
  $graphics.FillPath($potato, $body)
  $graphics.DrawPath($outline, $body)
  $body.Dispose()

  $graphics.FillEllipse([System.Drawing.Brushes]::White, 23, 21, 25, 19)
  $graphics.DrawEllipse($shine, 23, 21, 25, 19)
  $visorPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $visorPath.StartFigure()
  $visorPath.AddBezier(35, 22, 43, 22, 47, 26, 47, 32)
  $visorPath.AddBezier(47, 32, 47, 37, 42, 40, 35, 40)
  $visorPath.AddBezier(35, 40, 30, 40, 26, 38, 24, 35)
  $visorPath.AddBezier(24, 35, 23, 33, 23, 30, 26, 27)
  $visorPath.AddBezier(26, 27, 28, 24, 31, 22, 35, 22)
  $visorPath.CloseFigure()
  $graphics.FillPath($visor, $visorPath)
  $graphics.DrawPath($shine, $visorPath)
  $visorPath.Dispose()

  $outline.Dispose()
  $suit.Dispose()
  $potato.Dispose()
  $visor.Dispose()
  $shine.Dispose()
  $graphics.Dispose()
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

New-SpudnautIcon (Join-Path $outputDir 'icon-192.png') 192 $false
New-SpudnautIcon (Join-Path $outputDir 'icon-512.png') 512 $false
New-SpudnautIcon (Join-Path $outputDir 'icon-maskable-512.png') 512 $true
New-SpudnautIcon (Join-Path $outputDir 'apple-touch-icon.png') 180 $false
