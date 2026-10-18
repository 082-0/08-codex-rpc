Add-Type -AssemblyName System.Drawing

$assets = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
$family = [System.Drawing.FontFamily]::new('Arial')

function New-IconPng([int]$size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::White)
    $path.AddString('08', $family, [int][System.Drawing.FontStyle]::Bold, 100, [System.Drawing.PointF]::new(0, 0), [System.Drawing.StringFormat]::GenericDefault)
    $bounds = $path.GetBounds()
    $scale = [Math]::Min(($size * 0.78) / $bounds.Width, ($size * 0.62) / $bounds.Height)
    $transform = [System.Drawing.Drawing2D.Matrix]::new()
    $transform.Scale([single]$scale, [single]$scale)
    $path.Transform($transform)
    $transform.Dispose()
    $bounds = $path.GetBounds()
    $transform = [System.Drawing.Drawing2D.Matrix]::new()
    $transform.Translate([single](($size - $bounds.Width) / 2 - $bounds.X), [single](($size - $bounds.Height) / 2 - $bounds.Y))
    $path.Transform($transform)
    $transform.Dispose()
    $graphics.FillPath([System.Drawing.Brushes]::Black, $path)
    $stream = [System.IO.MemoryStream]::new()
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally { $stream.Dispose() }
  } finally {
    $path.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

[System.IO.File]::WriteAllBytes((Join-Path $assets '08.png'), (New-IconPng 1024))
$sizes = @(16, 32, 48, 256)
$images = @($sizes | ForEach-Object { New-IconPng $_ })
$file = [System.IO.File]::Create((Join-Path $assets '08.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$sizes.Count)
  $offset = 6 + $sizes.Count * 16
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $writer.Write([byte]($sizes[$i] % 256))
    $writer.Write([byte]($sizes[$i] % 256))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length)
    $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
  }
  foreach ($image in $images) { $writer.Write([byte[]]$image) }
} finally { $writer.Dispose() }
