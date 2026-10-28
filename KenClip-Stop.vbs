Set WshShell = CreateObject("WScript.Shell")
Set objShell = CreateObject("WScript.Shell")

' Kill all bun processes
On Error Resume Next
WshShell.Run "taskkill /f /im bun.exe", 0, True

' Show notification
objShell.Popup "⏹️ KenClip Server stopped successfully!", 3, "KenClip", 64
