@echo off
setlocal DisableDelayedExpansion
title AnaCode - Owner setup
set "ANACODE_SETUP_FILE=%~f0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$source=[IO.File]::ReadAllText($env:ANACODE_SETUP_FILE); $parts=$source -split '(?m)^# ANACODE_POWERSHELL\r?$',2; & ([scriptblock]::Create($parts[1]))"
set "ANACODE_SETUP_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %ANACODE_SETUP_RESULT%
# ANACODE_POWERSHELL
param([switch]$FunctionsOnly)

# Standalone Windows PowerShell 5.1 wizard. No npm, Git, admin rights, or downloads.
# No account is changed until its exact target and proposed changes are confirmed.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-Field($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) { return $Object[$Name] }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}

function Read-Private([string]$Prompt) {
    $secure = Read-Host "$Prompt (paste is hidden; press Enter)" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}

function Confirm-Step([string]$Prompt) {
    return (Read-Host "$Prompt [type YES to continue; Enter skips]") -ceq 'YES'
}

function Open-Guide([string]$Url) {
    Write-Host "Open: $Url" -ForegroundColor Cyan
    try { Start-Process -FilePath $Url | Out-Null }
    catch { Write-Host 'Could not open the browser. Copy the address above into it.' }
}

function Get-AppOrigin([string]$Value) {
    $uri = $null
    if (![Uri]::TryCreate($Value.Trim(), [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        $uri.AbsolutePath -ne '/' -or !$uri.IsDefaultPort -or $uri.IsLoopback -or
        $uri.HostNameType -ne [UriHostNameType]::Dns -or !$uri.Host.Contains('.') -or
        $uri.Host -match '(?i)(^|\.)(supabase\.co|github\.io|localhost|invalid|example|test)$') {
        throw 'Use the real HTTPS app homepage, for example https://anacode.your-domain.com, with no /login path. GitHub Pages cannot run login.'
    }
    return $uri.GetLeftPart([UriPartial]::Authority)
}

function Get-Project([string]$Value) {
    # Credentials are only sent to a genuine hosted Supabase project origin.
    $match = [regex]::Match($Value.Trim(), '^https://([a-z0-9]{20})\.supabase\.co/?$')
    if (!$match.Success) { throw 'Copy the Project URL from Supabase: https://<20-letter-project-id>.supabase.co (not the dashboard address). Custom domains need developer setup.' }
    return @{ Ref = $match.Groups[1].Value; Url = $Value.Trim().TrimEnd('/') }
}

function Test-PublicKey([string]$Key, [string]$ProjectRef) {
    if ($Key -cmatch '^sb_publishable_[A-Za-z0-9_-]+$') { return $true }
    if ($Key -notmatch '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { return $false }
    try {
        $payload = $Key.Split('.')[1].Replace('-', '+').Replace('_', '/')
        $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
        $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
        $ref = Get-Field $claims 'ref'
        return (Get-Field $claims 'role') -ceq 'anon' -and (!$ref -or $ref -ceq $ProjectRef)
    } catch { return $false }
}

function Invoke-SetupApi([string]$Method, [string]$Url, [hashtable]$Headers, $Body = $null) {
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or !$uri.IsDefaultPort -or
        $uri.Host -notmatch '^(api\.supabase\.com|api\.cloudflare\.com|[a-z0-9]{20}\.supabase\.co)$') {
        throw 'The setup request was stopped because its destination is not an official API.'
    }
    if ($Headers.ContainsKey('Authorization') -and $uri.Host.EndsWith('.supabase.co')) {
        throw 'Management tokens must never be sent to a project URL.'
    }
    $options = @{ Method = $Method; Uri = $Url; Headers = $Headers; TimeoutSec = 35; MaximumRedirection = 0; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $options.ContentType = 'application/json; charset=utf-8'
        $options.Body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Body -Depth 12 -Compress))
    }
    try { return Invoke-RestMethod @options }
    catch {
        # API responses can contain secrets. Never print ErrorDetails or bodies.
        $status = 0
        $httpResponse = Get-Field $_.Exception 'Response'
        if ($null -ne $httpResponse) { $status = [int](Get-Field $httpResponse 'StatusCode') }
        $hint = switch ($status) {
            401 { 'The token/key was not accepted. Copy a fresh value for this account.' }
            403 { 'This account/token lacks permission. Ask the actual project or Worker owner to run this helper.' }
            404 { 'That project or Worker was not found. Check its ID and account; this helper does not create replacements.' }
            429 { 'The service asked you to wait. Try again later.' }
            default { 'Check the internet connection, service dashboard and token permissions. Rerun to inspect current settings before retrying a change.' }
        }
        throw "The $($uri.Host) request did not complete successfully (HTTP $status). $hint"
    }
}

function New-AuthPlan($Current, [string]$AppOrigin, [bool]$IncludeLocal) {
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $entries = [Collections.Generic.List[string]]::new()
    $existing = [string](Get-Field $Current 'uri_allow_list')
    $wanted = @("$AppOrigin/auth/callback**")
    if ($IncludeLocal) { $wanted += 'http://localhost:3000/auth/callback**' }
    foreach ($entry in (@($existing -split ',') + $wanted)) {
        $entry = $entry.Trim()
        if ($entry -and $seen.Add($entry)) { $entries.Add($entry) }
    }
    $minimum = [Math]::Max(12, [int](Get-Field $Current 'password_min_length'))
    if ($minimum -gt 128) { throw 'The existing password policy exceeds the app maximum. Ask the developer to reconcile it; this helper will not weaken it.' }
    return [ordered]@{
        site_url = $AppOrigin
        uri_allow_list = $entries -join ','
        external_email_enabled = $true
        disable_signup = $false
        mailer_autoconfirm = $false
        mailer_allow_unverified_email_sign_ins = $false
        password_min_length = $minimum
    }
}

function Test-AuthPlan($Actual, $Plan) {
    foreach ($key in $Plan.Keys) {
        if ($key -eq 'uri_allow_list') {
            $actualEntries = @(([string](Get-Field $Actual $key) -split ',') | ForEach-Object { $_.Trim() })
            foreach ($entry in ($Plan[$key] -split ',')) { if ($actualEntries -cnotcontains $entry) { return $false } }
        } elseif ((Get-Field $Actual $key) -cne $Plan[$key]) { return $false }
    }
    return $true
}

function New-WorkerSecrets([string]$ProjectUrl, [string]$PublicKey, $Bindings) {
    $secrets = [ordered]@{}
    foreach ($entry in @(@('SUPABASE_URL', $ProjectUrl), @('SUPABASE_PUBLISHABLE_KEY', $PublicKey))) {
        $secrets[$entry[0]] = @{ name = $entry[0]; type = 'secret_text'; text = $entry[1] }
    }
    $hmacBinding = @($Bindings | Where-Object { (Get-Field $_ 'name') -ceq 'RATE_LIMIT_HMAC_SECRET' })
    if ($hmacBinding.Count -eq 0) {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secrets.RATE_LIMIT_HMAC_SECRET = @{ name = 'RATE_LIMIT_HMAC_SECRET'; type = 'secret_text'; text = [Convert]::ToBase64String($bytes) }
    }
    return @{ secrets = $secrets }
}

function Add-Result([string]$Text) {
    $script:SetupReport.Add($Text)
    Write-Host $Text
}

function Configure-Supabase($Project, [string]$AppOrigin) {
    Write-Host "`nSTEP 2 - Set up Supabase login" -ForegroundColor Cyan
    Write-Host 'Create a temporary personal access token named AnaCode setup.'
    Write-Host 'For a fine-grained token: select ONLY this project; allow Auth Config read/write and Project Settings read/write.'
    Write-Host 'If only classic tokens are available, they have wider access. Revoke this temporary token when finished.'
    Open-Guide 'https://supabase.com/dashboard/account/tokens'
    $token = Read-Private 'Supabase personal access token (not the publishable key; blank skips automatic setup)'
    if (!$token) {
        Add-Result "TODO: Configure Supabase manually: Site URL $AppOrigin; Redirect URL $AppOrigin/auth/callback**; email signup ON; Confirm email ON; minimum password length at least 12."
        Add-Result 'TODO: Configure a custom SMTP sender or email hook and keep confirmation/reset links using {{ .ConfirmationURL }}. The default sender is not for public signup. Have the developer review CAPTCHA compatibility if enabled.'
        Open-Guide "https://supabase.com/dashboard/project/$($Project.Ref)/auth/url-configuration"
        return
    }
    $headers = @{ Authorization = "Bearer $token" }
    $endpoint = "https://api.supabase.com/v1/projects/$($Project.Ref)/config/auth"
    try {
        $current = Invoke-SetupApi 'GET' $endpoint $headers
        $includeLocal = Confirm-Step 'Also allow local development at http://localhost:3000'
        $plan = New-AuthPlan $current $AppOrigin $includeLocal
        Write-Host "`nProject: $($Project.Ref)"
        Write-Host "New website URL: $AppOrigin"
        Write-Host "Add callback: $AppOrigin/auth/callback**"
        Write-Host "Enable email sign-up; require email confirmation; minimum password: $($plan.password_min_length)."
        Write-Host 'Existing redirect entries, users, databases, SMTP, templates and other providers stay as they are.'
        Write-Host 'If another application shares this project, its default email destination would change too.' -ForegroundColor Yellow
        if (Confirm-Step 'Apply these settings to this Supabase project') {
            $null = Invoke-SetupApi 'PATCH' $endpoint $headers $plan
            $current = Invoke-SetupApi 'GET' $endpoint $headers
            if (!(Test-AuthPlan $current $plan)) { throw 'Supabase did not return all requested settings. Inspect Authentication settings before continuing; some changes may have applied.' }
            Add-Result 'PASS: Supabase login settings saved and read back successfully.'
        } else { Add-Result 'TODO: Supabase automatic changes were skipped.' }

        Write-Host "`nSTEP 3 - Email delivery" -ForegroundColor Cyan
        $smtp = [string](Get-Field $current 'smtp_host')
        if ($smtp -or (Get-Field $current 'hook_send_email_enabled') -eq $true) {
            Add-Result 'CHECK: A custom email sender is configured. Actual confirmation/reset email delivery still needs a live test.'
        } else {
            Write-Host 'Set up a custom email sender. The default Supabase sender is for restricted testing, not public signup.' -ForegroundColor Yellow
            Write-Host 'In Authentication > Email/SMTP settings, use your mail provider''s SMTP host, port, username, password, sender address and sender name.'
            Write-Host 'Verify the sender domain with that provider. Keep email link tracking off so it does not alter confirmation links.'
            Open-Guide "https://supabase.com/dashboard/project/$($Project.Ref)/auth/smtp"
            if (Confirm-Step 'Have you saved your SMTP settings in the dashboard and want to check again') {
                $current = Invoke-SetupApi 'GET' $endpoint $headers
            }
            if ((Get-Field $current 'smtp_host') -or (Get-Field $current 'hook_send_email_enabled') -eq $true) {
                Add-Result 'PASS: Custom email sender settings are now present. Inbox delivery remains untested.'
            } else { Add-Result 'TODO: Custom email sender settings are still missing.' }
        }
        if ((Get-Field $current 'security_captcha_enabled') -eq $true) {
            Add-Result 'TODO: Supabase CAPTCHA is enabled, but this app does not yet submit CAPTCHA tokens. Ask the developer to integrate it before public login; the helper preserved this protection.'
        }
        foreach ($field in @('mailer_templates_confirmation_content', 'mailer_templates_recovery_content')) {
            $template = [string](Get-Field $current $field)
            if ($template -and $template -notmatch '\{\{\s*\.ConfirmationURL\s*\}\}') {
                Add-Result 'TODO: A custom confirmation/recovery template needs review. Its link must use {{ .ConfirmationURL }} for this app. Existing templates were preserved.'
                break
            }
        }
        Add-Result 'CHECK: Keep confirmation and password-reset links using {{ .ConfirmationURL }}. Open each email in the same browser that requested it.'
    } finally { $headers.Clear(); $token = $null; $current = $null }
}

function Configure-Worker($Project, [string]$PublicKey) {
    Write-Host "`nSTEP 4 - Connect the existing Cloudflare website" -ForegroundColor Cyan
    Write-Host 'This is needed for the website to use Supabase. You need access to the account that owns its existing Worker.'
    if (!(Confirm-Step 'Connect that Worker now')) {
        Add-Result 'TODO: On the existing Cloudflare Worker, add secrets SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from this Supabase project. Ensure RATE_LIMIT_HMAC_SECRET and the existing DB binding are configured.'
        return
    }
    Open-Guide 'https://dash.cloudflare.com/'
    Write-Host 'Select the account that owns the app, then Workers & Pages > the existing app. Copy the Account ID from the dashboard.'
    $account = (Read-Host 'Cloudflare Account ID (32 letters/numbers)').Trim()
    if ($account -notmatch '^[a-fA-F0-9]{32}$') { throw 'The Account ID must be exactly 32 hexadecimal characters. No Worker changes were attempted.' }
    $worker = (Read-Host 'Existing Worker name (press Enter for anacode)').Trim()
    if (!$worker) { $worker = 'anacode' }
    if ($worker -notmatch '^[a-z0-9][a-z0-9_-]{0,62}$') { throw 'Use the Worker name, not its URL. No Worker changes were attempted.' }
    Write-Host 'Create a temporary Cloudflare API token. Permission: Account > Workers Scripts > Edit, restricted to THIS account.'
    Open-Guide 'https://dash.cloudflare.com/profile/api-tokens'
    $token = Read-Private 'Cloudflare API token (not the Global API Key)'
    if (!$token) { Add-Result 'TODO: Cloudflare connection skipped; no API token entered.'; return }
    $headers = @{ Authorization = "Bearer $token" }
    $endpoint = "https://api.cloudflare.com/client/v4/accounts/$account/workers/scripts/$worker"
    try {
        $settings = Invoke-SetupApi 'GET' "$endpoint/settings" $headers
        if ((Get-Field $settings 'success') -ne $true) { throw 'Cloudflare could not verify this Worker. Check the account, name and token permissions.' }
        $bindings = @(Get-Field (Get-Field $settings 'result') 'bindings')
        $plan = New-WorkerSecrets $Project.Url $PublicKey $bindings
        Write-Host "`nAccount: $account"
        Write-Host "Existing Worker: $worker"
        Write-Host "Supabase project: $($Project.Ref)"
        Write-Host 'Replace SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY together on this Worker.'
        if ($plan.secrets.Contains('RATE_LIMIT_HMAC_SECRET')) { Write-Host 'Create a random RATE_LIMIT_HMAC_SECRET because none exists.' }
        else { Write-Host 'Keep the existing RATE_LIMIT_HMAC_SECRET.' }
        Write-Host 'Cloudflare creates a Worker version for secret changes. This can affect live login.' -ForegroundColor Yellow
        Write-Host 'No application code, users, database contents or unrelated secrets will be changed.'
        if (!(Confirm-Step 'Apply these secret changes to this existing Worker')) { Add-Result 'TODO: Worker secret changes were skipped.'; return }
        $response = Invoke-SetupApi 'PATCH' "$endpoint/secrets-bulk" $headers $plan
        if ((Get-Field $response 'success') -ne $true) { throw 'Cloudflare did not confirm the secret update. Inspect the Worker settings before retrying.' }
        Add-Result 'PASS: Cloudflare accepted the Supabase secret update. Verify the active Worker deployment and live login in the dashboard.'
        $check = Invoke-SetupApi 'GET' "$endpoint/settings" $headers
        if ((Get-Field $check 'success') -ne $true) { throw 'Cloudflare accepted the update but the follow-up check failed. Inspect the Worker settings.' }
        $names = @((Get-Field (Get-Field $check 'result') 'bindings') | ForEach-Object { Get-Field $_ 'name' })
        foreach ($name in @('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'RATE_LIMIT_HMAC_SECRET', 'DB')) {
            if ($names -cnotcontains $name) { Add-Result "TODO: The active Worker has no $name binding. Check its deployment/settings before launch." }
        }
    } finally { $headers.Clear(); $token = $null; $plan = $null; $response = $null; $settings = $null; $check = $null }
}

function Save-SetupReport {
    try {
        $directory = [Environment]::GetFolderPath('Desktop')
        if (!$directory) { $directory = [IO.Path]::GetTempPath() }
        $path = Join-Path $directory ("AnaCode-setup-report-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        [IO.File]::WriteAllLines($path, $script:SetupReport.ToArray(), [Text.UTF8Encoding]::new($false))
        Write-Host "`nReport saved: $path" -ForegroundColor Cyan
        Write-Host 'This report contains no keys or tokens. You can send it to your developer.'
    } catch { Write-Host 'Could not save a report. The result messages above are safe to copy; never copy tokens or keys.' }
}

function Start-OwnerSetup {
    $script:SetupReport = [Collections.Generic.List[string]]::new()
    $publicKey = $null
    Write-Host 'ANACODE OWNER SETUP' -ForegroundColor Cyan
    Write-Host 'Run on your own Windows computer. No developer tools or administrator rights are needed.'
    Write-Host 'Have your real app website address and access to its Supabase project ready.'
    Write-Host 'We will show each change before asking you to apply it. Entering a token alone does not change settings.'
    Write-Host 'Tokens are hidden while pasted and are not written to files or put on command lines.'
    Write-Host 'If another developer owns these accounts, ask them to grant access or run this helper.'
    Write-Host 'Press Ctrl+C at any time to stop. Completed changes will remain in the account.'
    try {
        Write-Host "`nSTEP 1 - Your website and Supabase project" -ForegroundColor Cyan
        do {
            $app = $null
            try { $app = Get-AppOrigin (Read-Host 'Real app homepage URL, starting with https://') }
            catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }
        } until ($app)
        Open-Guide 'https://supabase.com/dashboard'
        Write-Host 'Open the EXISTING project used by this app. Click Connect (or Settings > API) to copy its Project URL and publishable key.'
        Write-Host 'Do not create a replacement project if existing users already belong to one.'
        do {
            $project = $null
            try { $project = Get-Project (Read-Host 'Supabase Project URL') }
            catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }
        } until ($project)
        do {
            $publicKey = Read-Private 'Publishable key (sb_publishable_...) or legacy anon key'
            $valid = Test-PublicKey $publicKey $project.Ref
            if (!$valid) { Write-Host 'Use the public publishable/anon key for this project. Secret, service_role and personal access tokens are not accepted here.' -ForegroundColor Yellow }
        } until ($valid)
        $publicSettings = Invoke-SetupApi 'GET' "$($project.Url)/auth/v1/settings" @{ apikey = $publicKey }
        if ($null -eq (Get-Field $publicSettings 'external')) { throw 'The project did not return the expected Supabase Auth settings. Check its dashboard before continuing.' }
        Add-Result "Website: $app"
        Add-Result "Supabase project: $($project.Ref)"
        Add-Result 'PASS: The public API key was accepted by the project. No account was created and no email was sent by this check.'

        try { Configure-Supabase $project $app }
        catch { Add-Result ('TODO: Supabase setup did not finish. ' + $_.Exception.Message) }
        try { Configure-Worker $project $publicKey }
        catch { Add-Result ('TODO: Cloudflare setup did not finish. ' + $_.Exception.Message) }

        Write-Host "`nSTEP 5 - Test the real login" -ForegroundColor Cyan
        Add-Result 'LIVE TEST NEEDED: Create an account using your own inbox. Open its confirmation email in the same browser. Sign in, refresh Profile, sign out, then test Forgot password.'
        Add-Result 'LIVE TEST NEEDED: Submit a challenge and check that progress survives a refresh. Supabase login alone does not initialize the separate Cloudflare D1 database.'
        Add-Result 'DEPLOYMENT NOTE: This helper does not merge GitHub branches, upload app code, change GitHub secrets, or run database migrations. The deployed app must include the Supabase login implementation.'
        Add-Result 'DEPLOYMENT NOTE: Old same-named GitHub runtime secrets can overwrite dashboard settings on a later deployment. Ask the maintainer to remove stale overrides or update them to the same project.'
        Add-Result 'CLEANUP: Revoke the temporary setup tokens in Supabase and Cloudflare. Keep any separately managed CI deployment token.'
        Open-Guide "$app/login?mode=signup"
        Write-Host "`nSetup steps finished. PASS means a configuration check passed; live login/email delivery is not proven until you complete the tests above." -ForegroundColor Yellow
        Save-SetupReport
    } catch {
        Add-Result ('STOPPED: ' + $_.Exception.Message)
        Add-Result 'Check the account/project details and rerun. Completed changes remain; this helper does not roll back account settings.'
        Add-Result 'CLEANUP: Revoke any temporary setup tokens you created, even though setup did not finish.'
        Save-SetupReport
        throw 'Setup stopped. See the messages and report above.'
    } finally { $publicKey = $null }
}

if (!$FunctionsOnly) {
    try { Start-OwnerSetup; exit 0 }
    catch { Write-Host 'Setup was not completed. You can send the secret-free report to your developer.' -ForegroundColor Yellow; exit 1 }
}
