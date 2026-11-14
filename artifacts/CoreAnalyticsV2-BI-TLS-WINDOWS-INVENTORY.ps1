# Read-only inventory on the Windows server hosting the BI SQL Server instance.
# Does not export private keys, alter certificates, restart services, or query data.
$ErrorActionPreference = 'Stop'
$result = [ordered]@{
    ComputerName = $env:COMPUTERNAME
    ComputerFqdn = $null
    PartOfDomain = $null
    SqlServices = @()
    ServerAuthCertificates = @()
    Notes = @()
}

try {
    $result.ComputerFqdn = [System.Net.Dns]::GetHostEntry($env:COMPUTERNAME).HostName
} catch {
    $result.Notes += 'Computer FQDN could not be resolved; the SQL instance may use a different DNS alias.'
}

try {
    $result.PartOfDomain = (Get-CimInstance Win32_ComputerSystem).PartOfDomain
    $result.SqlServices = @(Get-CimInstance Win32_Service | Where-Object {
        $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*'
    } | Select-Object Name, DisplayName, State, StartName)
} catch {
    $result.Notes += 'Domain membership or SQL Server service inventory could not be read.'
}

try {
    $result.ServerAuthCertificates = @(Get-ChildItem Cert:\LocalMachine\My | Where-Object {
        @($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.1' }).Count -gt 0
    } | ForEach-Object {
        $cert = $_
        $san = @($cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | ForEach-Object { $_.Format($false) }) -join '; '
        $keySpec = 'Not checked'
        try {
            if (-not $cert.HasPrivateKey) { $keySpec = 'No private key' }
            elseif ($null -ne $cert.PrivateKey -and $null -ne $cert.PrivateKey.CspKeyContainerInfo) {
                $keySpec = [string]$cert.PrivateKey.CspKeyContainerInfo.KeyNumber
            } else { $keySpec = 'Not available; inspect with SQL administrator' }
        } catch { $keySpec = 'Could not inspect; check permissions and provider' }
        [PSCustomObject]@{
            Subject = $cert.Subject
            Issuer = $cert.Issuer
            SubjectAlternativeNames = $san
            ValidFrom = $cert.NotBefore.ToString('o')
            ValidUntil = $cert.NotAfter.ToString('o')
            HasPrivateKey = $cert.HasPrivateKey
            KeySpec = $keySpec
            Thumbprint = $cert.Thumbprint
        }
    })
} catch {
    $result.Notes += 'Local computer certificate inventory could not be read.'
}
$result.Notes += 'Inventory only. It does not prove which certificate SQL Server presents, CA trust, key access, DNS, or SQL compatibility.'
$result | ConvertTo-Json -Depth 5
