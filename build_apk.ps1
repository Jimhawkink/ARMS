$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Set-Location "E:\Res Pos\AlphaPlusApp\arms-mobile\android"
Write-Host "Starting APK v5.1 build..."
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL! Copying APK..."
    Copy-Item "E:\Res Pos\AlphaPlusApp\arms-mobile\android\app\build\outputs\apk\release\app-release.apk" -Destination "C:\Users\Salat\Desktop\ARMSTenantApp-v5.1.apk" -Force
    Copy-Item "E:\Res Pos\AlphaPlusApp\arms-mobile\android\app\build\outputs\apk\release\app-release.apk" -Destination "E:\Res Pos\AlphaPlusApp\arms\public\ARMSTenantApp-v5.1.apk" -Force
    $len = (Get-Item "C:\Users\Salat\Desktop\ARMSTenantApp-v5.1.apk").Length
    Write-Host "Done! APK size: $([math]::Round($len / 1MB, 2)) MB"
} else {
    Write-Host "Build failed with exit code $LASTEXITCODE"
}
