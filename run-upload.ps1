$ErrorActionPreference = 'Stop'
$secret = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'github-token.dpapi') -Raw | ConvertTo-SecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $env:CODEX_WATCH_GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $node = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'node-path.txt') -Raw).Trim()
    & $node (Join-Path $PSScriptRoot 'collector.mjs') --once
    $result = $LASTEXITCODE
} finally {
    Remove-Item Env:\CODEX_WATCH_GITHUB_TOKEN -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
exit $result
