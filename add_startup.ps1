$ws = New-Object -ComObject WScript.Shell
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath "Kho30_AutoStart.lnk"
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Users\Administrator\Downloads\TEST\chay_ngam_khoi_dong.vbs"
$shortcut.WorkingDirectory = "C:\Users\Administrator\Downloads\TEST"
$shortcut.Description = "Tu dong chay Web Kho 30 va Zalo Bot khi bat may"
$shortcut.Save()
Write-Host "Shortcut created: $(Test-Path $shortcutPath)"
