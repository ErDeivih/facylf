Option Explicit

' Ejecuta un programa cualquiera (aquí, node) sin crear una consola ni una pestaña de Windows Terminal.
' Es el hermano de `ejecutar-oculto.vbs`, que hace lo mismo para PowerShell: el supervisor único de la flota
' es un solo proceso Node y necesita la misma ventana invisible que tenían los 19 supervisores anteriores.
'
' El primer argumento es el ejecutable; los restantes se transmiten literalmente.
Dim shell, args, command, i, exitCode
Set shell = CreateObject("WScript.Shell")
Set args = WScript.Arguments

If args.Count < 1 Then WScript.Quit 2

command = Quote(args(0))
For i = 1 To args.Count - 1
  command = command & " " & Quote(args(i))
Next

' True mantiene wscript asociado a la tarea y conserva su estado Running.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

Function Quote(value)
  Quote = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
