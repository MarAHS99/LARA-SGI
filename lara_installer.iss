[Setup]
AppName=L.A.R.A Menudencias
AppVersion=1.0
AppPublisher=Marcelo
AppPublisherURL=
DefaultDirName={autopf}\LARA Menudencias
DefaultGroupName=LARA Menudencias
OutputDir=installer
OutputBaseFilename=LARA_Menudencias_v1.0
SetupIconFile=static\favicon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "dist\LARA\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\L.A.R.A Menudencias"; Filename: "{app}\LARA.exe"; IconFilename: "{app}\LARA.exe"
Name: "{group}\Desinstalar LARA"; Filename: "{uninstallexe}"
Name: "{userdesktop}\L.A.R.A Menudencias"; Filename: "{app}\LARA.exe"; Tasks: desktopicon; IconFilename: "{app}\LARA.exe"

[Run]
Filename: "{app}\LARA.exe"; Description: "Abrir L.A.R.A Menudencias"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; La base de datos en AppData NO se borra al desinstalar — los datos quedan seguros
Type: filesandordirs; Name: "{app}"
