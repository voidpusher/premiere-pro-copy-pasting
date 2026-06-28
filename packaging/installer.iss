; Instant Paste — Windows installer (Inno Setup)
; Builds InstantPasteSetup.exe: a download-and-run installer that drops the
; CEP extension into Premiere's extensions folder and enables it. No admin
; rights needed (installs to the user's AppData + HKCU).

#define AppName "Instant Paste"
#define AppVersion "1.0.0"
#define AppPublisher "Instant Paste"
#define BundleId "com.instantpaste.plugin"

[Setup]
AppId={{8F3C2A91-4B7E-4E2A-9C1D-7A55E2B0C311}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
; Install straight into the Premiere/CEP extensions folder
DefaultDirName={userappdata}\Adobe\CEP\extensions\{#BundleId}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
; No admin prompt — everything is per-user
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=InstantPasteSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
AppPublisherURL=https://premiere-pro-copy-pasting.vercel.app/

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\cep-plugin\CSXS\manifest.xml";   DestDir: "{app}\CSXS";  Flags: ignoreversion
Source: "..\cep-plugin\dist\index.html";      DestDir: "{app}";       Flags: ignoreversion
Source: "..\cep-plugin\dist\index.js";        DestDir: "{app}";       Flags: ignoreversion
Source: "..\cep-plugin\jsx\hostScript.jsx";   DestDir: "{app}\jsx";   Flags: ignoreversion
Source: "..\cep-plugin\lib\CSInterface.js";   DestDir: "{app}\lib";   Flags: ignoreversion
Source: "..\cep-plugin\icons\*.png";          DestDir: "{app}\icons"; Flags: ignoreversion

[Registry]
; Allow the extension to load (covers Premiere Pro 2021-2026 / CEP 9-12).
Root: HKCU; Subkey: "Software\Adobe\CSXS.9";  ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: createvalueifdoesntexist uninsdeletevalue

[Messages]
FinishedHeadingLabel=Instant Paste is installed
FinishedLabel=All done!%n%n1. Fully close and reopen Adobe Premiere Pro.%n2. Open a project, then go to Window > Extensions > Instant Paste.%n3. Sign in with the email you purchased with.
