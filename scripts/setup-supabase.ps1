<#
  WatchDeck — one-shot Supabase provisioning for Windows / PowerShell.

  Creates (or reuses) a Supabase project via the Management API, waits for it
  to become healthy, applies supabase/migrations/0001_init.sql, enables
  email auto-confirm, then writes .env.local (UTF-8, no BOM) with the URL +
  anon + service_role keys.

  Usage (from the repo root):
    powershell -ExecutionPolicy Bypass -File .\scripts\setup-supabase.ps1 -Token "sbp_xxx"

  The token is only ever used in request headers — it is never written to disk.
  Rotate it in the Supabase dashboard once setup succeeds.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$ProjectName = "watchdeck",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$api = "https://api.supabase.com"
$headers = @{ Authorization = "Bearer $Token" }

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Invoke-Sb($method, $path, $body) {
  $uri = "$api$path"
  try {
    if ($null -ne $body) {
      return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -ContentType "application/json" -Body $body
    } else {
      return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers
    }
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "$method $path -> $detail"
  }
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$migPath  = Join-Path $repoRoot "supabase\migrations\0001_init.sql"
$envPath  = Join-Path $repoRoot ".env.local"
if (-not (Test-Path $migPath)) { Fail "migration not found at $migPath (run this from the repo)" }

Write-Host "==> Finding organization..."
$orgs = Invoke-Sb GET "/v1/organizations" $null
if (-not $orgs) { Fail "no organizations for this token" }
$orgId = $orgs[0].id
Write-Host "    org: $($orgs[0].name)  ($orgId)"

Write-Host "==> Looking for existing '$ProjectName' project..."
$projects = Invoke-Sb GET "/v1/projects" $null
$proj = $projects | Where-Object { $_.name -eq $ProjectName } | Select-Object -First 1
if ($proj) {
  Write-Host "    reusing: $($proj.id)"
} else {
  $chars = (48..57) + (65..90) + (97..122)
  $dbPass = -join ($chars | Get-Random -Count 28 | ForEach-Object { [char]$_ })
  $body = @{ name = $ProjectName; organization_id = $orgId; region = $Region; db_pass = $dbPass } | ConvertTo-Json
  Write-Host "==> Creating project (region $Region)..."
  $proj = Invoke-Sb POST "/v1/projects" $body
  Write-Host "    created: $($proj.id)"
}
$ref = $proj.id
if (-not $ref) { Fail "could not determine project ref" }

Write-Host "==> Waiting for ACTIVE_HEALTHY (a few minutes on a fresh project)..."
do {
  Start-Sleep -Seconds 15
  $p = Invoke-Sb GET "/v1/projects/$ref" $null
  Write-Host "    status: $($p.status)"
} until ($p.status -eq "ACTIVE_HEALTHY")

Write-Host "==> Enabling email auto-confirm..."
try {
  Invoke-Sb PATCH "/v1/projects/$ref/config/auth" (@{ mailer_autoconfirm = $true } | ConvertTo-Json) | Out-Null
  Write-Host "    ok"
} catch {
  Write-Host "    skipped: $($_.Exception.Message)"
}

Write-Host "==> Applying migration 0001_init.sql..."
$sql = Get-Content -Raw $migPath
$qbody = @{ query = $sql } | ConvertTo-Json
$applied = $false
for ($i = 1; $i -le 6 -and -not $applied; $i++) {
  try {
    Invoke-Sb POST "/v1/projects/$ref/database/query" $qbody | Out-Null
    $applied = $true
    Write-Host "    applied"
  } catch {
    if ($_.Exception.Message -match "already exists") {
      Write-Host "    already applied (existing project)"
      $applied = $true
    } else {
      Write-Host "    attempt $i failed, retrying in 15s..."
      Start-Sleep -Seconds 15
    }
  }
}
if (-not $applied) {
  Write-Host "    !! migration did not apply — paste supabase\migrations\0001_init.sql into the SQL editor manually" -ForegroundColor Yellow
}

Write-Host "==> Fetching API keys..."
$keys = Invoke-Sb GET "/v1/projects/$ref/api-keys?reveal=true" $null
$anon    = ($keys | Where-Object { $_.name -eq "anon" }).api_key
$service = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $anon -or -not $service) { Fail "could not read anon / service_role keys from the API" }

$lines = @(
  "NEXT_PUBLIC_SUPABASE_URL=https://$ref.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon",
  "SUPABASE_SERVICE_ROLE_KEY=$service",
  "TRANSCRIPT_TMP_DIR=./tmp/watchdeck-transcripts"
)
# WriteAllText => UTF-8 without BOM (a BOM would corrupt the first env var name).
[IO.File]::WriteAllText($envPath, ($lines -join "`n") + "`n")

Write-Host ""
Write-Host "DONE  ->  https://$ref.supabase.co" -ForegroundColor Green
Write-Host ".env.local written (no BOM)."
Write-Host "Next:  pnpm install   then   pnpm dev"
Write-Host "Reminder: rotate your Supabase access token now that setup is complete."
