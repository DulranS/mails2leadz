# cleanup-legacy.ps1
# PowerShell equivalent of cleanup-legacy.sh, for Windows users without a
# working WSL/Git Bash. Run from the project root:
#   powershell -ExecutionPolicy Bypass -File cleanup-legacy.ps1

Set-Location $PSScriptRoot

function Remove-IfExists($path) {
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path
        Write-Host "  removed $path"
    }
}

Write-Host "Removing old page routes..."
Remove-IfExists "app/crm"
Remove-IfExists "app/ai-monitoring"
Remove-IfExists "app/ai-tools"
Remove-IfExists "app/analytics"
Remove-IfExists "app/leads"

Write-Host "Removing old providers/components/hooks..."
Remove-IfExists "app/components"
Remove-IfExists "app/components_DISABLED"
Remove-IfExists "app/hooks"
Remove-IfExists "app/lib"
Remove-IfExists "app/lib_DISABLED"
Remove-IfExists "app/format_DISABLED"
Remove-IfExists "components"
Remove-IfExists "hooks"

Write-Host "Cleaning app/dashboard/ - keeping only page.js and settings/..."
if (Test-Path "app/dashboard") {
    Get-ChildItem "app/dashboard" | Where-Object {
        $_.Name -ne "page.js" -and $_.Name -ne "settings"
    } | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName
        Write-Host "  removed app/dashboard/$($_.Name)"
    }
}

Write-Host "Cleaning root lib/ - keeping only the new engine's files..."
$keepLib = @("account.js","ai.js","cronAuth.js","followup.js","gmail.js","quota.js","supabase.js","supabaseBrowser.js","supabaseServer.js","unsubscribe.js","whatsapp.js")
if (Test-Path "lib") {
    Get-ChildItem "lib" | Where-Object { $keepLib -notcontains $_.Name } | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName
        Write-Host "  removed lib/$($_.Name)"
    }
}

Write-Host "Removing old API routes not part of the rebuilt engine..."
$keepApi = @("account","campaigns","followups","inbox","leads","messages","unsubscribe","webhooks")
if (Test-Path "app/api") {
    Get-ChildItem "app/api" -Directory | Where-Object { $keepApi -notcontains $_.Name } | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName
        Write-Host "  removed app/api/$($_.Name)"
    }
}

Write-Host "Removing unrelated bundled projects and scraper output..."
Remove-IfExists "ledger"
Remove-IfExists "anemails"
Remove-IfExists "database/migrations"
Remove-IfExists "scripts"
Remove-IfExists "backend/__pycache__"

Write-Host "Removing old root-level debug scripts, doc sprawl, and data dumps..."
Get-ChildItem -Path "." -Filter "*.md" -File | Where-Object { $_.Name -ne "README.md" } | Remove-Item -Force
Get-ChildItem -Path "." -Filter "test-*.js" -File | Remove-Item -Force
Get-ChildItem -Path "." -Filter "*bracket*.js" -File | Remove-Item -Force
Remove-IfExists "analyze-syntax.js"
Remove-IfExists "temp-start.js"
Remove-IfExists "temp_check.txt"
Remove-IfExists "firebase-debug.log"
Remove-IfExists "minimal-dashboard.js"
Remove-IfExists "mails2leadz.rar"
Remove-IfExists "firestore.rules"
Remove-IfExists "package-lock.json"
Remove-IfExists "requirements.txt"
Remove-IfExists "sample-contacts.csv"
Remove-IfExists "sample-targets.csv"
Get-ChildItem -Path "." -Filter "business_leads*.csv" -File | Remove-Item -Force
Remove-IfExists "emails_output.csv"
Get-ChildItem -Path "." -Filter "google-2025*.csv" -File | Remove-Item -Force
Remove-IfExists "public/api-diagnostic.js"
Remove-IfExists "public/diagnose.js"
Remove-IfExists "app/favicon.ico"

Write-Host "Done. Run 'npm install' before your next build."
