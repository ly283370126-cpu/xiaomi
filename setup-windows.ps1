$ErrorActionPreference = 'Stop'
$repo = 'ly283370126-cpu/xiaomi'
Write-Host '仅在本机输入此仓库 Contents 读写权限的 GitHub Token；不会显示或上传凭据。'
$secret = Read-Host 'GitHub Token' -AsSecureString
if ($secret.Length -eq 0) { throw '未输入凭据，未修改定时任务。' }
$tokenFile = Join-Path $PSScriptRoot 'github-token.dpapi'
$secret | ConvertFrom-SecureString | Set-Content -LiteralPath $tokenFile
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'config.example.json') -Destination (Join-Path $PSScriptRoot 'config.json')
$node = (Get-Command node.exe).Source
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'node-path.txt') -Value $node
$pwsh = (Get-Process -Id $PID).Path
$runner = Join-Path $PSScriptRoot 'run-upload.ps1'
$action = New-ScheduledTaskAction -Execute $pwsh -Argument ('-NoProfile -WindowStyle Hidden -File "' + $runner + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 55) -StartWhenAvailable
Register-ScheduledTask -TaskName 'CodexGitHubWatch' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host '已注册 CodexGitHubWatch；每分钟执行，电脑关机或用户注销后停止。'
