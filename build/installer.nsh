; Somani TV Player - NSIS customisation.
;
; The installer asks for nothing. It installs machine-wide and the player runs
; its own activation flow on first launch: the production service URL is built
; into the player and the activation key is entered there. Pairing, token
; storage, licensing and device security are unchanged.

; Machine-wide target: C:\Program Files\Somani TV.
; electron-builder derives the directory from productName; writing
; InstallLocation before the pages are built overrides the path without renaming
; the product (renaming it would move the player's userData folder and orphan an
; existing pairing).
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Somani TV"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Somani TV"
!macroend

!macro customUnInstall
  ; Nothing here needs the activation key any more, but an earlier installer
  ; (1.3.0/1.3.1) may have left a provision file holding one in plain text.
  Delete "$APPDATA\Somani TV Player\installer-provision.json"
!macroend
