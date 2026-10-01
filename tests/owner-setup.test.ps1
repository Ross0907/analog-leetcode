# Offline contract/flow tests. This file never contacts Supabase or Cloudflare.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = [IO.File]::ReadAllText((Join-Path $root 'SETUP-SUPABASE.bat'))
$parts = $source -split '(?m)^# ANACODE_POWERSHELL\r?$', 2
if ($parts.Count -ne 2) { throw 'The batch launcher cannot locate its embedded PowerShell.' }
. ([scriptblock]::Create($parts[1])) -FunctionsOnly
$script:Passed = 0
function Check([bool]$Condition, [string]$Name) {
    if (!$Condition) { throw "FAIL: $Name" }
    $script:Passed++
    Write-Output "PASS: $Name"
}
function Must-Reject([scriptblock]$Action, [string]$Name) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Check $rejected $Name
}

Check ((Get-AppOrigin 'https://app.anacode.dev/') -ceq 'https://app.anacode.dev') 'Normalize homepage origin'
foreach ($url in @('http://app.anacode.dev','https://localhost','https://127.0.0.1','https://app.anacode.dev/login','https://user:pass@app.anacode.dev/','https://owner.github.io','https://project.supabase.co','https://app.anacode.dev/?token=x')) {
    Must-Reject { Get-AppOrigin $url } "Reject unsuitable website URL: $url"
}
$project = Get-Project 'https://abcdefghijklmnopqrst.supabase.co/'
Check ($project.Ref -ceq 'abcdefghijklmnopqrst') 'Extract project identity from official origin'
foreach ($url in @('https://abcdefghijklmnopqrst.supabase.co.attacker.dev', 'https://attacker.dev', 'http://abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co:443')) {
    Must-Reject { Get-Project $url } 'Reject nonstandard credential destination'
}
Check (Test-PublicKey 'sb_publishable_fixture' $project.Ref) 'Accept publishable key shape'
Check (!(Test-PublicKey 'sb_secret_fixture' $project.Ref)) 'Reject secret key'
function Make-Jwt([string]$Role, [string]$Ref) {
    $json = @{ role = $Role; ref = $Ref } | ConvertTo-Json -Compress
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+','-').Replace('/','_')
    return "eyJhbGciOiJIUzI1NiJ9.$payload.signature"
}
Check (Test-PublicKey (Make-Jwt 'anon' $project.Ref) $project.Ref) 'Accept matching legacy anon JWT'
Check (!(Test-PublicKey (Make-Jwt 'service_role' $project.Ref) $project.Ref)) 'Reject service-role JWT'
Check (!(Test-PublicKey (Make-Jwt 'anon' 'differentprojectrefxx') $project.Ref)) 'Reject known cross-project key mismatch'

$current = [pscustomobject]@{
    site_url = 'https://old.anacode.dev'; uri_allow_list = 'https://old.anacode.dev/auth/callback**, https://app.anacode.dev/auth/callback**'
    password_min_length = 16; smtp_host = 'smtp.provider.test'; smtp_pass = 'SMTP_SECRET_SENTINEL'; security_captcha_enabled = $true
}
$plan = New-AuthPlan $current 'https://app.anacode.dev' $false
Check ($plan.password_min_length -eq 16) 'Preserve stricter password minimum'
Check (($plan.uri_allow_list -split ',').Count -eq 2) 'Preserve and deduplicate callback entries'
Check (!$plan.Contains('smtp_pass') -and !$plan.Contains('security_captcha_enabled')) 'Leave mail credentials and CAPTCHA policy untouched'
Check (!$plan.mailer_autoconfirm -and !$plan.disable_signup -and $plan.external_email_enabled -and !$plan.mailer_allow_unverified_email_sign_ins) 'Enable signup while enforcing email confirmation'
$newPlan = New-AuthPlan ([pscustomobject]@{password_min_length=6}) 'https://app.anacode.dev' $true
Check ($newPlan.password_min_length -eq 12 -and $newPlan.uri_allow_list.Contains('http://localhost:3000/auth/callback**')) 'Set minimum and explicitly requested local callback'
Check (Test-AuthPlan ([pscustomobject]$plan) $plan) 'Verify settings read-back'
Check (!(Test-AuthPlan $current $plan)) 'Detect incomplete remote update'

$bindings = @(@{ name = 'RATE_LIMIT_HMAC_SECRET'; type = 'secret_text' }, @{ name='DB'; type='d1' })
$workerPlan = New-WorkerSecrets $project.Url 'sb_publishable_fixture' $bindings
Check ($workerPlan.secrets.Count -eq 2 -and !$workerPlan.secrets.Contains('RATE_LIMIT_HMAC_SECRET')) 'Do not rotate existing HMAC binding'
$workerPlan = New-WorkerSecrets $project.Url 'sb_publishable_fixture' @()
Check ([Convert]::FromBase64String($workerPlan.secrets.RATE_LIMIT_HMAC_SECRET.text).Length -eq 32) 'Generate 32 random bytes only for absent HMAC'
Check ($workerPlan.secrets.SUPABASE_URL.type -eq 'secret_text' -and $workerPlan.secrets.SUPABASE_PUBLISHABLE_KEY.name -eq 'SUPABASE_PUBLISHABLE_KEY') 'Use exact canonical secret contract'

# Override the only transport; any real networking in this suite is prohibited.
$script:Calls = [Collections.Generic.List[object]]::new()
$script:Transport = { return [pscustomobject]@{ external = @{email=$true} } }
function Invoke-RestMethod {
    param($Method, $Uri, $Headers, $TimeoutSec, $MaximumRedirection, $ErrorAction, $ContentType, $Body)
    $script:Calls.Add(@{ Method=$Method; Uri=$Uri; Headers=$Headers.Clone(); Timeout=$TimeoutSec; Redirects=$MaximumRedirection; Body=$Body })
    & $script:Transport $Method $Uri $Body
}
$null = Invoke-SetupApi 'GET' "$($project.Url)/auth/v1/settings" @{apikey='sb_publishable_fixture'}
Check ($script:Calls[0].Redirects -eq 0 -and $script:Calls[0].Timeout -eq 35) 'Disable credential redirects and bound network waiting'
Check (!$script:Calls[0].Headers.ContainsKey('Authorization')) 'Public key check needs no privileged token'
Must-Reject { Invoke-SetupApi 'GET' 'https://attacker.dev/' @{Authorization='Bearer TOKEN_SECRET_SENTINEL'} } 'Block credentials to untrusted API'
Must-Reject { Invoke-SetupApi 'GET' "$($project.Url)/auth/v1/settings" @{Authorization='Bearer TOKEN_SECRET_SENTINEL'} } 'Block management token at project API'
Check ($script:Calls.Count -eq 1) 'Blocked destinations never reach transport'
$script:Transport = { throw 'BODY_CONTAINS_TOKEN_SECRET_SENTINEL' }
$message = ''
try { Invoke-SetupApi 'GET' 'https://api.supabase.com/v1/projects' @{Authorization='Bearer TOKEN_SECRET_SENTINEL'} } catch { $message = $_.Exception.Message }
Check ($message.Contains('HTTP 0') -and !$message.Contains('SENTINEL')) 'Redact API failure body and credential values'

function Open-Guide([string]$Url) { } # No browser opens in tests.
function Read-Private([string]$Prompt) { return 'TOKEN_SECRET_SENTINEL' }
$script:Inputs = [Collections.Generic.Queue[string]]::new()
function Read-Host([string]$Prompt) {
    if ($script:Inputs.Count -eq 0) { throw "Unexpected prompt: $Prompt" }
    return $script:Inputs.Dequeue()
}
$script:SetupReport = [Collections.Generic.List[string]]::new()
$script:Calls.Clear()
$script:Inputs.Enqueue('') # No localhost.
$script:Inputs.Enqueue('') # Decline mutation.
$script:Transport = { return $current }
$display = Configure-Supabase $project 'https://app.anacode.dev' 6>&1 | Out-String
Check ($script:Calls.Count -eq 1 -and $script:Calls[0].Method -eq 'GET') 'Declining Supabase changes performs no write'
Check (!$display.Contains('SENTINEL') -and (($script:SetupReport -join '\n') -notmatch 'SENTINEL')) 'No SMTP or access token leakage to display/report'

$script:SetupReport.Clear()
$script:Calls.Clear()
$script:Inputs.Enqueue('')
$script:Inputs.Enqueue('YES')
$script:RemoteConfig = $current
$script:Transport = {
    param($Method,$Uri,$Body)
    if ($Method -eq 'PATCH') {
        $script:RemoteConfig = [Text.Encoding]::UTF8.GetString($Body) | ConvertFrom-Json
        $script:RemoteConfig | Add-Member -NotePropertyName smtp_host -NotePropertyValue 'smtp.provider.test'
    }
    return $script:RemoteConfig
}
$display = Configure-Supabase $project 'https://app.anacode.dev' 6>&1 | Out-String
Check (($script:Calls.Method -join ',') -ceq 'GET,PATCH,GET') 'Apply exact Supabase target then verify read-back'
Check ($script:Calls[1].Uri -ceq 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth') 'Supabase mutation stays scoped to selected project'
Check ($display.Contains('saved and read back') -and !$display.Contains('SENTINEL')) 'Verified success is reported without credentials'

$script:Calls.Clear()
$script:SetupReport.Clear()
$script:Inputs.Enqueue('YES') # Connect Worker.
$script:Inputs.Enqueue(('a' * 32))
$script:Inputs.Enqueue('') # Default Worker.
$script:Inputs.Enqueue('YES') # Apply.
$script:Transport = {
    param($Method,$Uri,$Body)
    return @{ success=$true; result=@{bindings=@(@{name='DB'},@{name='SUPABASE_URL'},@{name='SUPABASE_PUBLISHABLE_KEY'},@{name='RATE_LIMIT_HMAC_SECRET'})} }
}
$display = Configure-Worker $project 'sb_publishable_fixture' 6>&1 | Out-String
Check (($script:Calls.Method -join ',') -ceq 'GET,PATCH,GET') 'Worker settings are checked before/after one bulk write'
Check ($script:Calls[1].Uri.EndsWith('/workers/scripts/anacode/secrets-bulk')) 'Use official bulk-secrets endpoint'
$sent = [Text.Encoding]::UTF8.GetString($script:Calls[1].Body) | ConvertFrom-Json
Check (@($sent.secrets.PSObject.Properties).Count -eq 2) 'Bulk update preserves existing HMAC and unrelated bindings'
Check (!$display.Contains('SENTINEL') -and !$display.Contains('sb_publishable_fixture')) 'Worker confirmation hides tokens and keys'

function Read-Private([string]$Prompt) { return '' }
$script:Calls.Clear()
$script:SetupReport.Clear()
$display = Configure-Supabase $project 'https://app.anacode.dev' 6>&1 | Out-String
Check ($script:Calls.Count -eq 0) 'Skipping personal token performs no management requests'
Check ($display.Contains('SMTP') -and $display.Contains('.ConfirmationURL')) 'Manual setup still explains required email delivery and templates'
Write-Output "All $script:Passed offline owner-helper checks passed. No accounts were accessed."
