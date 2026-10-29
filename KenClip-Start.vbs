Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory (KenClip root folder)
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Change to KenClip directory
WshShell.CurrentDirectory = strScriptPath

' Start bun server in hidden window (0 = hidden, False = don't wait)
WshShell.Run "cmd /c title KenClip Server && bun start", 0, False

' Wait for server to start (3 seconds)
WScript.Sleep 3000

' Open browser silently
WshShell.Run "http://localhost:57777", 1
