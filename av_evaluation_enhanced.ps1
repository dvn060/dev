<#
AV / EDR evaluation snapshot (HTML report) for Trellix + MDE environments.
Enhanced version:
  - Comprehensive MDE onboarding verification and health checks.
  - MDE signature/engine version and blocking activity logs.
  - Detailed MDE operational status assessment.
  - Minimal Trellix error logging (collapsed by default, non-prominent).
#>

# ===================== Setup =====================

$ErrorActionPreference = 'Continue'

# Make sure System.Web is available for HtmlEncode
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Web")

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$scriptDir = Split-Path -Parent $PSCommandPath
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}
$outFileName = "av_evaluation_$timestamp.html"
$outFilePath = Join-Path $scriptDir $outFileName

Write-Host "[*] Generating HTML report at: $outFilePath"

$sb = New-Object System.Text.StringBuilder
function Add-HtmlLine { param([string]$Text); [void]$sb.AppendLine($Text) }

function HtmlEncode {
    param([string]$Text)
    if ($null -eq $Text) { return "" }
    return [System.Web.HttpUtility]::HtmlEncode($Text)
}

function Add-CollapsibleSection {
    param([string]$Title,[string]$InnerHtml,[bool]$OpenByDefault=$true)
    Add-HtmlLine "<section class='section'>"
    if ($OpenByDefault) {
        Add-HtmlLine "  <details open>"
    } else {
        Add-HtmlLine "  <details>"
    }
    Add-HtmlLine "    <summary>$Title</summary>"
    Add-HtmlLine "    <div class='section-body'>"
    Add-HtmlLine $InnerHtml
    Add-HtmlLine "    </div>"
    Add-HtmlLine "  </details>"
    Add-HtmlLine "</section>"
}

# ===================== Collect data =====================

# --- System info ---
$os = Get-CimInstance Win32_OperatingSystem
$sysInfo = [PSCustomObject]@{
    Hostname   = $env:COMPUTERNAME
    User       = $env:USERNAME
    Timestamp  = (Get-Date)
    OS         = $os.Caption
    OSVersion  = $os.Version
    Build      = $os.BuildNumber
}

# --- MDE Onboarding Status (CRITICAL CHECK) ---
$mdeOnboarded = $false
$mdeOrgId = $null
$mdeSenseId = $null
$mdeOnboardingInfo = ""
$mdeStatusBadge = ""

# Check Sense service
$senseService = Get-Service -Name "Sense" -ErrorAction SilentlyContinue
$mdeOnboardingInfo += "Sense Service Status: "
if ($senseService) {
    $mdeOnboardingInfo += "$($senseService.Status) / $($senseService.StartType)`r`n"
    if ($senseService.Status -eq "Running") {
        $mdeOnboarded = $true
    }
} else {
    $mdeOnboardingInfo += "NOT FOUND (MDE not installed)`r`n"
}

# Check critical registry keys for onboarding
$onboardingRegPath = "HKLM:\SOFTWARE\Microsoft\Windows Advanced Threat Protection\Status"
if (Test-Path $onboardingRegPath) {
    try {
        $onboardingReg = Get-ItemProperty -Path $onboardingRegPath -ErrorAction Stop
        if ($onboardingReg.PSObject.Properties.Name -contains "OnboardingState") {
            $onboardingState = $onboardingReg.OnboardingState
            $mdeOnboardingInfo += "OnboardingState: $onboardingState "
            if ($onboardingState -eq 1) {
                $mdeOnboardingInfo += "(ONBOARDED)`r`n"
                $mdeOnboarded = $true
            } else {
                $mdeOnboardingInfo += "(NOT ONBOARDED)`r`n"
                $mdeOnboarded = $false
            }
        }
        if ($onboardingReg.PSObject.Properties.Name -contains "OrgId") {
            $mdeOrgId = $onboardingReg.OrgId
            $mdeOnboardingInfo += "OrgId: $mdeOrgId`r`n"
        }
    } catch {
        $mdeOnboardingInfo += "Error reading onboarding registry: $($_.Exception.Message)`r`n"
    }
} else {
    $mdeOnboardingInfo += "Onboarding registry path not found`r`n"
}

# Check SenseId (machine ID)
$senseGuidPath = "HKLM:\SOFTWARE\Microsoft\Windows Advanced Threat Protection"
if (Test-Path $senseGuidPath) {
    try {
        $senseReg = Get-ItemProperty -Path $senseGuidPath -ErrorAction Stop
        if ($senseReg.PSObject.Properties.Name -contains "SenseId") {
            $mdeSenseId = $senseReg.SenseId
            $mdeOnboardingInfo += "SenseId (Machine ID): $mdeSenseId`r`n"
        }
    } catch {
        $mdeOnboardingInfo += "Error reading SenseId: $($_.Exception.Message)`r`n"
    }
}

# Final determination
if ($mdeOnboarded) {
    $mdeStatusBadge = "<span class='badge badge-ok badge-large'>✓ MDE IS ONBOARDED</span>"
} else {
    $mdeStatusBadge = "<span class='badge badge-err badge-large'>✗ MDE NOT ONBOARDED</span>"
}

# --- MDE Health: Signatures, Engine, Platform versions ---
$mdeHealthInfo = ""
$mdeSignatureAge = $null
$mdeOutdatedComponents = @()

if (Get-Command -Name Get-MpComputerStatus -ErrorAction SilentlyContinue) {
    try {
        $mpStatus = Get-MpComputerStatus

        # Signature versions and ages
        $mdeHealthInfo += "=== SIGNATURE STATUS ===`r`n"
        $mdeHealthInfo += "AntivirusSignatureVersion: $($mpStatus.AntivirusSignatureVersion)`r`n"
        $mdeHealthInfo += "AntivirusSignatureLastUpdated: $($mpStatus.AntivirusSignatureLastUpdated)`r`n"

        if ($mpStatus.AntivirusSignatureLastUpdated) {
            $sigAge = (Get-Date) - $mpStatus.AntivirusSignatureLastUpdated
            $mdeSignatureAge = $sigAge.TotalDays
            $mdeHealthInfo += "Signature Age: $([math]::Round($sigAge.TotalDays, 2)) days`r`n"
            if ($sigAge.TotalDays -gt 7) {
                $mdeOutdatedComponents += "Signatures outdated (>7 days old)"
            }
        }

        $mdeHealthInfo += "NISSignatureVersion: $($mpStatus.NISSignatureVersion)`r`n"
        $mdeHealthInfo += "NISSignatureLastUpdated: $($mpStatus.NISSignatureLastUpdated)`r`n`r`n"

        # Engine versions
        $mdeHealthInfo += "=== ENGINE STATUS ===`r`n"
        $mdeHealthInfo += "AntivirusEngineVersion: $($mpStatus.AMEngineVersion)`r`n"
        $mdeHealthInfo += "NISEngineVersion: $($mpStatus.NISEngineVersion)`r`n"
        $mdeHealthInfo += "AntispywareSignatureVersion: $($mpStatus.AntispywareSignatureVersion)`r`n"
        $mdeHealthInfo += "AntispywareSignatureLastUpdated: $($mpStatus.AntispywareSignatureLastUpdated)`r`n`r`n"

        # Platform and product versions
        $mdeHealthInfo += "=== PLATFORM STATUS ===`r`n"
        $mdeHealthInfo += "AMProductVersion: $($mpStatus.AMProductVersion)`r`n"
        $mdeHealthInfo += "AMServiceVersion: $($mpStatus.AMServiceVersion)`r`n"

        # Operational health
        $mdeHealthInfo += "`r`n=== OPERATIONAL HEALTH ===`r`n"
        $mdeHealthInfo += "RealTimeProtectionEnabled: $($mpStatus.RealTimeProtectionEnabled)`r`n"
        $mdeHealthInfo += "BehaviorMonitorEnabled: $($mpStatus.BehaviorMonitorEnabled)`r`n"
        $mdeHealthInfo += "IoavProtectionEnabled: $($mpStatus.IoavProtectionEnabled)`r`n"
        $mdeHealthInfo += "OnAccessProtectionEnabled: $($mpStatus.OnAccessProtectionEnabled)`r`n"
        $mdeHealthInfo += "AntivirusEnabled: $($mpStatus.AntivirusEnabled)`r`n"
        $mdeHealthInfo += "AntispywareEnabled: $($mpStatus.AntispywareEnabled)`r`n"
        $mdeHealthInfo += "IsTamperProtected: $($mpStatus.IsTamperProtected)`r`n"
        $mdeHealthInfo += "DefenderSignaturesOutOfDate: $($mpStatus.DefenderSignaturesOutOfDate)`r`n"

        if ($mpStatus.DefenderSignaturesOutOfDate) {
            $mdeOutdatedComponents += "Defender reports signatures are out of date"
        }

        # Quick scan info
        $mdeHealthInfo += "`r`n=== SCAN STATUS ===`r`n"
        $mdeHealthInfo += "QuickScanAge: $($mpStatus.QuickScanAge) days`r`n"
        $mdeHealthInfo += "FullScanAge: $($mpStatus.FullScanAge) days`r`n"
        $mdeHealthInfo += "QuickScanStartTime: $($mpStatus.QuickScanStartTime)`r`n"
        $mdeHealthInfo += "QuickScanEndTime: $($mpStatus.QuickScanEndTime)`r`n"

    } catch {
        $mdeHealthInfo = "Error retrieving MDE health info: $($_.Exception.Message)"
    }
} else {
    $mdeHealthInfo = "Get-MpComputerStatus not available on this system."
}

# --- MDE Blocking/Detection Event Logs ---
$mdeBlockingLogs = ""
$mdeEventLogCount = 0

try {
    # Check Windows Defender Operational log for detections/blocks
    # Event IDs: 1116 (malware detected), 1117 (action taken), 5001 (real-time protection disabled), etc.
    $defenderLog = Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" -MaxEvents 100 -ErrorAction Stop |
        Where-Object { $_.Id -in @(1116, 1117, 1118, 1119, 5001, 5004, 5007, 5010, 5012) } |
        Select-Object -First 20

    if ($defenderLog) {
        $mdeEventLogCount = $defenderLog.Count
        $mdeBlockingLogs += "Recent Defender Events (Last 20 relevant events from last 100):`r`n`r`n"
        foreach ($event in $defenderLog) {
            $mdeBlockingLogs += "[$($event.TimeCreated)] ID:$($event.Id) - $($event.Message.Substring(0, [Math]::Min(200, $event.Message.Length)))...`r`n`r`n"
        }
    } else {
        $mdeBlockingLogs = "No recent detection/action events found in Defender Operational log."
    }
} catch {
    $mdeBlockingLogs = "Error reading Defender event log: $($_.Exception.Message)`r`n"
    $mdeBlockingLogs += "Note: This may require administrator privileges."
}

# Also check MDE/ATP specific logs if available
try {
    $mdeATPLog = Get-WinEvent -LogName "Microsoft-Windows-SENSE/Operational" -MaxEvents 50 -ErrorAction Stop |
        Select-Object -First 10

    if ($mdeATPLog) {
        $mdeBlockingLogs += "`r`n`r`n=== MDE SENSE Service Events (Last 10) ===`r`n`r`n"
        foreach ($event in $mdeATPLog) {
            $mdeBlockingLogs += "[$($event.TimeCreated)] ID:$($event.Id) Level:$($event.LevelDisplayName) - $($event.Message.Substring(0, [Math]::Min(150, $event.Message.Length)))...`r`n`r`n"
        }
    }
} catch {
    # SENSE log may not exist or be accessible, this is optional
    $mdeBlockingLogs += "`r`n(SENSE operational log not available or accessible)"
}

# --- Defender status text blocks ---
$mpStatusText = ""
$mpStatusError = ""
if (Get-Command -Name Get-MpComputerStatus -ErrorAction SilentlyContinue) {
    try {
        $mpStatusText = (Get-MpComputerStatus | Out-String)
    } catch {
        $mpStatusError = $_.Exception.Message
    }
} else {
    $mpStatusError = "Get-MpComputerStatus not available on this system."
}

$mpPrefText = ""
$mpPrefError = ""
if (Get-Command -Name Get-MpPreference -ErrorAction SilentlyContinue) {
    try {
        $mpPrefText = (Get-MpPreference | Out-String)
    } catch {
        $mpPrefError = $_.Exception.Message
    }
} else {
    $mpPrefError = "Get-MpPreference not available on this system."
}

# --- Registry keys we care about ---
function Get-RegValueInfo {
    param([string]$Path,[string]$Name)

    $exists = Test-Path $Path
    $value = $null
    $status = ""
    if ($exists) {
        try {
            $item = Get-ItemProperty -Path $Path -ErrorAction Stop
            if ($item.PSObject.Properties.Name -contains $Name) {
                $value = $item.$Name
                $status = "Present"
            } else {
                $status = "Value not present"
            }
        } catch {
            $status = "Error: $($_.Exception.Message)"
        }
    } else {
        $status = "Key not present"
    }

    [PSCustomObject]@{
        Path   = $Path
        Name   = $Name
        Value  = $value
        Status = $status
    }
}

$regInfo = @(
    Get-RegValueInfo "HKLM:\SOFTWARE\Microsoft\Windows Defender" "DisableAntiSpyware"
    Get-RegValueInfo "HKLM:\SOFTWARE\Microsoft\Windows Defender" "DisableAntiVirus"
    Get-RegValueInfo "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender" "DisableAntiSpyware"
    Get-RegValueInfo "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender" "DisableAntiVirus"
    Get-RegValueInfo "HKLM:\SOFTWARE\Policies\Microsoft\Windows Advanced Threat Protection" "ForceDefenderPassiveMode"
)

# --- Services: Defender + MDE + Trellix/McAfee ---
$avServices = Get-Service | Where-Object {
    $_.DisplayName -like "*Trellix*" -or
    $_.DisplayName -like "*McAfee*" -or
    $_.DisplayName -like "*Defender*" -or
    $_.Name -in @("WinDefend","Sense","mfemms","mfefire","mfehidk","mfevtp","mfewc","masvc","macmnsvc","McAfeeFramework")
} | Sort-Object DisplayName

# --- AMSI providers ---
$amsiProviders = @()
$amsiKey = "HKLM:\SOFTWARE\Microsoft\AMSI\Providers"
if (Test-Path $amsiKey) {
    $children = Get-ChildItem -Path $amsiKey -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        $guid = $child.PSChildName
        # Handle GUID with/without braces correctly
        if ($guid -like "{*}") { $clsidGuid = $guid } else { $clsidGuid = "{${guid}}" }
        $clsidPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsidGuid\InprocServer32"
        $dllPath = $null
        $status = ""
        if (Test-Path $clsidPath) {
            try {
                $dllPath = (Get-ItemProperty -Path $clsidPath -ErrorAction Stop)."(default)"
                $status = "OK"
            } catch {
                $status = "Error: $($_.Exception.Message)"
            }
        } else {
            $status = "No InprocServer32 registration"
        }
        $amsiProviders += [PSCustomObject]@{
            ProviderGuid = $guid
            DllPath      = $dllPath
            Status       = $status
        }
    }
}

# --- Minifilter drivers (fltmc filters) ---
$fltText = ""
try {
    $fltOutput = fltmc filters 2>&1
    if ($LASTEXITCODE -eq 0) {
        $fltText = ($fltOutput | Out-String)
    } else {
        $fltText = "fltmc exited with code $LASTEXITCODE`r`n$($fltOutput -join [Environment]::NewLine)"
    }
} catch {
    $fltText = "Error running fltmc filters: $($_.Exception.Message)"
}

# --- SecurityCenter2 AVProducts (client OS only) ---
$avProductsText = ""
try {
    $avProducts = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop
    if ($avProducts) {
        $avProductsText = ($avProducts | Select-Object displayName,productState,pathToSignedProductExe | Format-Table -AutoSize | Out-String)
    } else {
        $avProductsText = "No AntiVirusProduct entries found in root\SecurityCenter2."
    }
} catch {
    $avProductsText = "SecurityCenter2 not available on this system (expected on Server OS). Error: $($_.Exception.Message)"
}

# --- Trellix / McAfee log scan (MINIMIZED - collapsed by default) ---
$logDirs = @(
    "C:\ProgramData\McAfee\Agent",
    "C:\ProgramData\McAfee\Endpoint Security\Logs"
)
$logPatterns = @("error","fail","critical")
$logHtmlSb = New-Object System.Text.StringBuilder
$trellixLogCount = 0

foreach ($dir in $logDirs) {
    if (-not (Test-Path $dir)) {
        continue
    }

    $files = Get-ChildItem -Path $dir -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object { $_.Extension -in ".log",".txt" } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 3  # Only scan 3 most recent files

    foreach ($file in $files) {
        try {
            $matches = Select-String -Path $file.FullName -Pattern $logPatterns -SimpleMatch -AllMatches -ErrorAction SilentlyContinue
            if (-not $matches) { continue }

            # Only top 5 matches per file
            $topMatches = $matches | Sort-Object LineNumber -Descending | Select-Object -First 5
            $trellixLogCount += $topMatches.Count

            $lines = $topMatches | ForEach-Object {
                "[$($_.LineNumber)] $($_.Line.Trim())"
            }
            $combined = ($lines -join [Environment]::NewLine)
            $encoded = HtmlEncode $combined

            [void]$logHtmlSb.AppendLine("<h4>$(HtmlEncode $file.Name)</h4>")
            [void]$logHtmlSb.AppendLine("<p class='muted'>$(HtmlEncode $file.FullName) - Last modified: $($file.LastWriteTime)</p>")
            [void]$logHtmlSb.AppendLine("<div class='log-box'>$encoded</div>")
        } catch {
            # Silently skip errors
        }
    }
}

if ($logHtmlSb.Length -eq 0) {
    [void]$logHtmlSb.AppendLine("<p class='muted'>No error-like entries found in recent Trellix/McAfee logs.</p>")
}

$logHtml = $logHtmlSb.ToString()

# ===================== Build HTML =====================

Add-HtmlLine "<!DOCTYPE html>"
Add-HtmlLine "<html lang='en'>"
Add-HtmlLine "<head>"
Add-HtmlLine "  <meta charset='utf-8'/>"
Add-HtmlLine "  <title>AV/EDR Evaluation - $($sysInfo.Hostname) - $timestamp</title>"
Add-HtmlLine "  <style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f5f5f7;
        color: #222;
        margin: 0;
        padding: 0 0 40px 0;
    }
    h1 {
        margin: 0;
        padding: 20px 24px 10px 24px;
        background: #111827;
        color: #f9fafb;
        font-size: 22px;
    }
    h2 {
        margin: 0;
        padding: 0 24px 16px 24px;
        background: #111827;
        color: #9ca3af;
        font-size: 13px;
        font-weight: normal;
    }
    .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 16px 24px 0 24px;
    }
    .summary-card {
        background: #ffffff;
        border-radius: 8px;
        padding: 16px 20px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        margin-bottom: 20px;
    }
    .summary-card table {
        width: 100%;
        border-collapse: collapse;
    }
    .summary-card td {
        padding: 4px 8px;
        font-size: 13px;
    }
    .summary-label {
        font-weight: 600;
        color: #4b5563;
        width: 120px;
    }
    .alert-box {
        background: #ffffff;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        margin-bottom: 20px;
        border-left: 4px solid #3b82f6;
    }
    .alert-box h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        color: #1f2937;
    }
    .section {
        margin-bottom: 18px;
    }
    details > summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        padding: 10px 12px;
        background: #e5e7eb;
        border-radius: 6px;
        outline: none;
        list-style: none;
    }
    details[open] > summary {
        background: #d1d5db;
    }
    .section-body {
        background: #ffffff;
        border-radius: 0 0 6px 6px;
        padding: 12px 14px;
        border: 1px solid #e5e7eb;
        border-top: none;
        font-size: 13px;
    }
    .muted {
        color: #9ca3af;
        font-style: italic;
    }
    .data-table {
        border-collapse: collapse;
        width: 100%;
        margin-top: 6px;
    }
    .data-table th, .data-table td {
        border-bottom: 1px solid #e5e7eb;
        padding: 4px 6px;
        text-align: left;
        font-size: 12px;
    }
    .data-table th {
        background: #f3f4f6;
        font-weight: 600;
        color: #4b5563;
    }
    .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
    }
    .badge-large {
        padding: 6px 14px;
        font-size: 14px;
        border-radius: 6px;
    }
    .badge-ok {
        background: #dcfce7;
        color: #166534;
    }
    .badge-warn {
        background: #fef9c3;
        color: #854d0e;
    }
    .badge-err {
        background: #fee2e2;
        color: #991b1b;
    }
    .code-block {
        background: #111827;
        color: #e5e7eb;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        white-space: pre-wrap;
        margin-top: 6px;
        max-height: 400px;
        overflow: auto;
    }
    .log-box {
        background: #111827;
        color: #e5e7eb;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        max-height: 260px;
        overflow: auto;
        white-space: pre-wrap;
        margin-top: 6px;
    }
    .small-note {
        font-size: 11px;
        color: #6b7280;
        margin-top: 6px;
    }
    .warning-list {
        background: #fef9c3;
        border-left: 3px solid #ca8a04;
        padding: 10px 12px;
        margin: 10px 0;
        border-radius: 4px;
    }
    .warning-list ul {
        margin: 5px 0;
        padding-left: 20px;
    }
  </style>"
Add-HtmlLine "</head>"
Add-HtmlLine "<body>"
Add-HtmlLine "<h1>AV / EDR Evaluation Report</h1>"
Add-HtmlLine "<h2>Host: $($sysInfo.Hostname) &nbsp;&nbsp;|&nbsp;&nbsp; $($sysInfo.OS) ($($sysInfo.OSVersion))</h2>"
Add-HtmlLine "<div class='container'>"

# Summary card
Add-HtmlLine "<div class='summary-card'><table>"
Add-HtmlLine "  <tr><td class='summary-label'>Hostname</td><td>$(HtmlEncode $sysInfo.Hostname)</td></tr>"
Add-HtmlLine "  <tr><td class='summary-label'>User</td><td>$(HtmlEncode $sysInfo.User)</td></tr>"
Add-HtmlLine "  <tr><td class='summary-label'>Timestamp</td><td>$(HtmlEncode $sysInfo.Timestamp)</td></tr>"
Add-HtmlLine "  <tr><td class='summary-label'>OS</td><td>$(HtmlEncode "$($sysInfo.OS) (Build $($sysInfo.Build))")</td></tr>"
Add-HtmlLine "</table></div>"

# MDE Onboarding Status Alert Box (PROMINENT)
$mdeAlertHtml = "<h3>$mdeStatusBadge</h3>"
$mdeAlertHtml += "<div class='code-block'>$(HtmlEncode $mdeOnboardingInfo)</div>"

if ($mdeOutdatedComponents.Count -gt 0) {
    $mdeAlertHtml += "<div class='warning-list'><strong>⚠ Outdated Components Detected:</strong><ul>"
    foreach ($component in $mdeOutdatedComponents) {
        $mdeAlertHtml += "<li>$(HtmlEncode $component)</li>"
    }
    $mdeAlertHtml += "</ul></div>"
}

if ($mdeOnboarded) {
    $mdeAlertHtml += "<p class='small-note'>✓ This machine is reporting to MDE cloud service."
    if ($mdeOrgId) {
        $mdeAlertHtml += " Organization ID: $(HtmlEncode $mdeOrgId)"
    }
    $mdeAlertHtml += "</p>"
} else {
    $mdeAlertHtml += "<p style='color: #991b1b; font-weight: 600;'>✗ This machine is NOT onboarded to MDE. The Sense service is not running or onboarding has not been completed.</p>"
}

Add-HtmlLine "<div class='alert-box'>$mdeAlertHtml</div>"

# MDE Health and Version Information
$mdeHealthHtml = "<div class='code-block'>$(HtmlEncode $mdeHealthInfo)</div>"
Add-CollapsibleSection -Title "MDE Health: Signatures, Engine & Platform Versions" -InnerHtml $mdeHealthHtml

# MDE Blocking/Detection Logs
$mdeLogsHtml = ""
if ($mdeEventLogCount -gt 0) {
    $mdeLogsHtml += "<p><strong>Found $mdeEventLogCount relevant events in Windows Defender logs.</strong></p>"
}
$mdeLogsHtml += "<div class='log-box'>$(HtmlEncode $mdeBlockingLogs)</div>"
$mdeLogsHtml += "<p class='small-note'>Event IDs: 1116 (malware detected), 1117 (action taken), 1118 (action failed), 5001 (real-time protection), 5007 (config change), etc.</p>"
Add-CollapsibleSection -Title "MDE Recent Blocking & Detection Activity" -InnerHtml $mdeLogsHtml

# Defender status section
$defHtml = ""
if ($mpStatusText -and $mpStatusText.Trim().Length -gt 0) {
    $defHtml += "<h4>Get-MpComputerStatus (Full Output)</h4>"
    $defHtml += "<div class='code-block'>$(HtmlEncode $mpStatusText)</div>"
} else {
    $defHtml += "<p class='muted'>Get-MpComputerStatus unavailable or empty. $(HtmlEncode $mpStatusError)</p>"
}
if ($mpPrefText -and $mpPrefText.Trim().Length -gt 0) {
    $defHtml += "<h4>Get-MpPreference (Full Output)</h4>"
    $defHtml += "<div class='code-block'>$(HtmlEncode $mpPrefText)</div>"
} else {
    $defHtml += "<p class='muted'>Get-MpPreference unavailable or failed. $(HtmlEncode $mpPrefError)</p>"
}
Add-CollapsibleSection -Title "Microsoft Defender Complete Status" -InnerHtml $defHtml

# Registry section
$regRows = foreach ($r in $regInfo) {
    $badge = ""
    if ($r.Name -in @("DisableAntiSpyware","DisableAntiVirus")) {
        if ($r.Status -eq "Present" -and $r.Value -eq 0) {
            $badge = "<span class='badge badge-ok'>Enabled (0)</span>"
        } elseif ($r.Status -eq "Present" -and $r.Value -eq 1) {
            $badge = "<span class='badge badge-err'>Disabled (1)</span>"
        } elseif ($r.Status -eq "Value not present") {
            $badge = "<span class='badge badge-ok'>Not present</span>"
        } else {
            $badge = "<span class='badge badge-warn'>Check</span>"
        }
    } elseif ($r.Name -eq "ForceDefenderPassiveMode") {
        if ($r.Status -eq "Present" -and $r.Value -eq 1) {
            $badge = "<span class='badge badge-ok'>Passive Mode Enabled</span>"
        } elseif ($r.Status -eq "Present") {
            $badge = "<span class='badge badge-warn'>Value = $(HtmlEncode $r.Value)</span>"
        } elseif ($r.Status -eq "Value not present") {
            $badge = "<span class='badge badge-warn'>Missing</span>"
        } else {
            $badge = "<span class='badge badge-warn'>Check</span>"
        }
    }

    "<tr><td>$(HtmlEncode $r.Path)</td><td>$(HtmlEncode $r.Name)</td><td>$(HtmlEncode $r.Value)</td><td>$(HtmlEncode $r.Status) $badge</td></tr>"
}

$regHtml = @"
<table class='data-table'>
  <thead>
    <tr>
      <th>Registry Path</th>
      <th>Value Name</th>
      <th>Data</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    $($regRows -join "`r`n")
  </tbody>
</table>
<p class='small-note'>For Trellix + MDE coexistence you typically want DisableAntiSpyware=0, DisableAntiVirus=0, and ForceDefenderPassiveMode=1.</p>
"@
Add-CollapsibleSection -Title "Registry: Defender Disable Keys & MDE Passive Mode" -InnerHtml $regHtml

# Services section
$svcHtml = ""
if ($avServices -and $avServices.Count -gt 0) {
    $svcHtml += "<table class='data-table'><thead><tr><th>Name</th><th>Display Name</th><th>Status</th><th>Start Type</th></tr></thead><tbody>"
    foreach ($svc in $avServices) {
        $svcHtml += "<tr><td>$(HtmlEncode $svc.Name)</td><td>$(HtmlEncode $svc.DisplayName)</td><td>$(HtmlEncode $svc.Status)</td><td>$(HtmlEncode $svc.StartType)</td></tr>"
    }
    $svcHtml += "</tbody></table>"
} else {
    $svcHtml = "<p class='muted'>No Trellix/McAfee/Defender services found by filter.</p>"
}
Add-CollapsibleSection -Title "Key AV / EDR Services (Defender, MDE, Trellix)" -InnerHtml $svcHtml

# AMSI section
$amsiHtml = ""
if ($amsiProviders -and $amsiProviders.Count -gt 0) {
    $amsiHtml += "<table class='data-table'><thead><tr><th>Provider GUID</th><th>DLL Path</th><th>Status</th></tr></thead><tbody>"
    foreach ($a in $amsiProviders) {
        $amsiHtml += "<tr><td>$(HtmlEncode $a.ProviderGuid)</td><td>$(HtmlEncode $a.DllPath)</td><td>$(HtmlEncode $a.Status)</td></tr>"
    }
    $amsiHtml += "</tbody></table>"
} else {
    $amsiHtml = "<p class='muted'>No AMSI providers registered under HKLM:\SOFTWARE\Microsoft\AMSI\Providers.</p>"
}
Add-CollapsibleSection -Title "AMSI Providers" -InnerHtml $amsiHtml

# Minifilters section
$fltHtml = "<div class='code-block'>$(HtmlEncode $fltText)</div>"
Add-CollapsibleSection -Title "Minifilter Drivers (fltmc filters)" -InnerHtml $fltHtml

# SecurityCenter2 section
$avProdHtml = "<div class='code-block'>$(HtmlEncode $avProductsText)</div>"
Add-CollapsibleSection -Title "SecurityCenter2 AntiVirusProduct (Client OS only)" -InnerHtml $avProdHtml

# Trellix / McAfee logs section (COLLAPSED BY DEFAULT, MINIMIZED)
Add-CollapsibleSection -Title "Trellix / McAfee Recent Logs (collapsed - optional)" -InnerHtml $logHtml -OpenByDefault $false

Add-HtmlLine "<p class='small-note'>Report file: $(HtmlEncode $outFilePath)</p>"
Add-HtmlLine "</div></body></html>"

# ===================== Write file =====================

$sb.ToString() | Out-File -FilePath $outFilePath -Encoding UTF8 -Force

Write-Host "[*] Report complete:"
Write-Host "    $outFilePath"
Write-Host ""
Write-Host "=== MDE ONBOARDING STATUS ==="
if ($mdeOnboarded) {
    Write-Host "    ✓ MDE IS ONBOARDED" -ForegroundColor Green
    if ($mdeOrgId) {
        Write-Host "    Organization ID: $mdeOrgId"
    }
    if ($mdeSenseId) {
        Write-Host "    Machine ID: $mdeSenseId"
    }
} else {
    Write-Host "    ✗ MDE NOT ONBOARDED" -ForegroundColor Red
    Write-Host "    The Sense service is not running or onboarding has not been completed."
}

if ($mdeOutdatedComponents.Count -gt 0) {
    Write-Host ""
    Write-Host "=== WARNINGS ===" -ForegroundColor Yellow
    foreach ($warning in $mdeOutdatedComponents) {
        Write-Host "    ⚠ $warning" -ForegroundColor Yellow
    }
}

if ($mdeSignatureAge -ne $null) {
    Write-Host ""
    Write-Host "Signature age: $([math]::Round($mdeSignatureAge, 1)) days"
}

if ($mdeEventLogCount -gt 0) {
    Write-Host "Recent MDE events found: $mdeEventLogCount"
}
