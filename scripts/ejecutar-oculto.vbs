Option Explicit

' Ejecuta un script PowerShell sin crear una consola ni una pestaña de Windows Terminal.
' El primer argumento es el .ps1; los restantes se transmiten literalmente.
Dim shell, args, powershell, command, i, exitCode
Set shell = CreateObject("WScript.Shell")
Set args = WScript.Arguments

If args.Count < 1 Then WScript.Quit 2

powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Quote(powershell) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(args(0))
For i = 1 To args.Count - 1
  command = command & " " & Quote(args(i))
Next

' True mantiene wscript asociado a la tarea y conserva su estado Running.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

Function Quote(value)
  Quote = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
