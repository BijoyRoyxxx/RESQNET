Add-Type -AssemblyName System.Speech
$resqSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
$resqOutput = Join-Path $PSScriptRoot '..\data\demo-en.wav'
$resqSpeech.SetOutputToWaveFile([System.IO.Path]::GetFullPath($resqOutput))
$resqSpeech.Speak('This is a synthetic demonstration. Flooding near Barasat station. Two people are trapped. Rescue is requested.')
$resqSpeech.Dispose()
Write-Output "Created $resqOutput. Synthetic English speech; no prerecorded model output."
