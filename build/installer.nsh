; Somani TV Player - NSIS customisation.
;
; Adds an activation-key page between the installation-folder choice and the
; file copy. The key is checked against the published app's existing
; activationRedeem endpoint (action "list") - the same read-only call the
; player setup uses: it consumes nothing and creates nothing. The validated
; app URL and key are handed to the player in a small provision file, and the
; player's own setup flow (workspace confirmation, naming, screen choice,
; owner approval) runs exactly as before.

!macro customHeader
  Var ActivationAppUrl
  Var ActivationKey
  Var ActivationWorkspace
  Var ActivationDialog
  Var ActivationUrlBox
  Var ActivationKeyBox
  Var ActivationMessage
  Var ActivationSkipBox
!macroend

!macro customPageAfterChangeDir
  Page custom ActivationPageShow ActivationPageLeave
!macroend

Function ActivationPageShow
  !insertmacro MUI_HEADER_TEXT "Activate this player" "Enter your Somani TV app URL and workspace activation key."
  nsDialogs::Create 1018
  Pop $ActivationDialog

  ${NSD_CreateLabel} 0 0 100% 28u "The workspace owner generates activation keys in the Somani TV portal. The key is checked before installation continues. If you skip this step, the player asks for the key on first launch instead."
  Pop $0

  ${NSD_CreateLabel} 0 36u 100% 8u "Somani TV app URL (HTTPS)"
  Pop $0
  ${NSD_CreateText} 0 46u 100% 12u "https://"
  Pop $ActivationUrlBox

  ${NSD_CreateLabel} 0 66u 100% 8u "Activation key"
  Pop $0
  ${NSD_CreateText} 0 76u 100% 12u ""
  Pop $ActivationKeyBox

  ${NSD_CreateLabel} 0 94u 100% 20u ""
  Pop $ActivationMessage

  ${NSD_CreateCheckbox} 0 120u 100% 8u "Skip for now - the player asks for the key on first launch"
  Pop $ActivationSkipBox

  nsDialogs::Show
FunctionEnd

Function ActivationPageLeave
  ${NSD_GetText} $ActivationUrlBox $ActivationAppUrl
  ${NSD_GetText} $ActivationKeyBox $ActivationKey
  ${NSD_GetState} $ActivationSkipBox $0

  ${If} $0 == 1
    StrCpy $ActivationKey ""
    StrCpy $ActivationAppUrl ""
    Return
  ${EndIf}

  Push $ActivationAppUrl
  Call ActivationTrim
  Pop $ActivationAppUrl
  StrCpy $0 "$ActivationAppUrl" 8
  ${If} $ActivationAppUrl == ""
  ${OrIf} $0 != "https://"
    ${NSD_SetText} $ActivationMessage "Enter the published HTTPS URL of your Somani TV app."
    Abort
  ${EndIf}

  Push $ActivationKey
  Call ActivationTrim
  Pop $ActivationKey
  ${If} $ActivationKey == ""
    ${NSD_SetText} $ActivationMessage "Enter your activation key, or tick the box to set up inside the player instead."
    Abort
  ${EndIf}

  ${NSD_SetText} $ActivationMessage "Checking your activation key with the Somani TV app..."

  ; A small PowerShell helper does the HTTPS call: NSIS has no HTTP client
  ; built in, and PowerShell 5.1 ships with every supported Windows machine.
  InitPluginsDir
  FileOpen $0 "$PLUGINSDIR\stv-activation.ps1" w
  FileWrite $0 "param([string]$$AppUrl, [string]$$Key)$\n"
  FileWrite $0 "$$ErrorActionPreference = 'Stop'$\n"
  FileWrite $0 "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}$\n"
  FileWrite $0 "function Fail([string]$$code) { Write-Output ('ERR|' + $$code); exit 0 }$\n"
  FileWrite $0 "if ($$AppUrl -notmatch '^https://') { Fail 'bad_url' }$\n"
  FileWrite $0 "$$body = @{ action = 'list'; key = $$Key } | ConvertTo-Json -Compress$\n"
  FileWrite $0 "try {$\n"
  FileWrite $0 "  $$res = Invoke-RestMethod -UseBasicParsing -Method Post -Uri ($$AppUrl.TrimEnd('/') + '/functions/activationRedeem') -ContentType 'application/json' -Body $$body -TimeoutSec 15$\n"
  FileWrite $0 "} catch {$\n"
  FileWrite $0 "  $$sc = 0$\n"
  FileWrite $0 "  try { $$sc = [int]$$_.Exception.Response.StatusCode } catch {}$\n"
  FileWrite $0 "  if ($$sc -eq 404) { Fail 'invalid_key' }$\n"
  FileWrite $0 "  elseif ($$sc -eq 402) { Fail 'licence_expired' }$\n"
  FileWrite $0 "  elseif ($$sc -eq 0) { Fail 'unreachable' }$\n"
  FileWrite $0 "  else { Fail 'server_error' }$\n"
  FileWrite $0 "}$\n"
  FileWrite $0 "if ($$res.ok -eq $$true) { Write-Output ('OK|' + [string]$$res.workspace_name); exit 0 }$\n"
  FileWrite $0 "Fail 'invalid_key'$\n"
  FileClose $0

  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\stv-activation.ps1" "$ActivationAppUrl" "$ActivationKey"'
  Pop $0 ; exit code
  Pop $1 ; output

  StrCpy $2 "$1" 3
  ${If} $2 == "OK|"
    StrCpy $ActivationWorkspace "$1" "" 3
    Push $ActivationWorkspace
    Call ActivationTrim
    Pop $ActivationWorkspace
    ${NSD_SetText} $ActivationMessage ""
    Return
  ${EndIf}

  StrCpy $3 "$1" 4
  ${If} $3 == "ERR|"
    StrCpy $4 "$1" "" 4
    StrCpy $4 "$4" 16
    ${If} $4 == "invalid_key"
      ${NSD_SetText} $ActivationMessage "That activation key isn't recognised. Keys expire and can only be used once; create a fresh one in the portal."
    ${ElseIf} $4 == "licence_expired"
      ${NSD_SetText} $ActivationMessage "This workspace's subscription has ended. Ask the workspace owner to renew it, then try again."
    ${ElseIf} $4 == "bad_url"
      ${NSD_SetText} $ActivationMessage "Enter the published HTTPS URL of your Somani TV app."
    ${Else}
      ${NSD_SetText} $ActivationMessage "Somani TV couldn't be reached. Check the app URL and your connection, then try again."
    ${EndIf}
  ${Else}
    ${NSD_SetText} $ActivationMessage "Somani TV couldn't be reached. Check the app URL and your connection, then try again."
  ${EndIf}
  Abort
FunctionEnd

; Crude whitespace trim: spaces, CR and LF from both ends. Uses $0 in/out and
; $1/$2 as scratch.
Function ActivationTrim
  Exch $0
  Push $1
  ActivationTrimStart:
  StrCpy $1 "$0" 1
  ${If} $1 == " "
  ${OrIf} $1 == "$\r"
  ${OrIf} $1 == "$\n"
    StrCpy $0 "$0" "" 1
    Goto ActivationTrimStart
  ${EndIf}
  ActivationTrimEnd:
  StrLen $1 "$0"
  ${If} $1 > 0
    IntOp $1 "$1" "-1"
    StrCpy $2 "$0" 1 "$1"
    ${If} $2 == " "
    ${OrIf} $2 == "$\r"
    ${OrIf} $2 == "$\n"
      StrCpy $0 "$0" "$1"
      Goto ActivationTrimEnd
    ${EndIf}
  ${EndIf}
  Pop $1
  Exch $0
FunctionEnd

!macro customInstall
  ; Hand the validated app URL and key to the player. The workspace name is
  ; deliberately not stored: the player re-checks the key and shows the real
  ; workspace from the server.
  ${If} $ActivationKey != ""
    CreateDirectory "$APPDATA\Somani TV Player"
    Delete "$APPDATA\Somani TV Player\installer-provision.json"
    FileOpen $0 "$APPDATA\Somani TV Player\installer-provision.json" w
    ${If} $0 != ""
      FileWrite $0 "{\"app_url\":\"$ActivationAppUrl\",\"key\":\"$ActivationKey\",\"source\":\"installer\"}"
      FileClose $0
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove the provision file (it holds the plain-text activation key) so
  ; nothing sensitive is left behind.
  Delete "$APPDATA\Somani TV Player\installer-provision.json"
!macroend
