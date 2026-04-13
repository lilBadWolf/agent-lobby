!macro NSIS_HOOK_POSTINSTALL
  ; Register the .agentconf extension to the app and point the OS to the app icon.
  WriteRegStr HKCR ".agentconf" "" "agentlobby.agentconf"
  WriteRegStr HKCR "agentlobby.agentconf" "" "Agent Lobby Configuration"
  WriteRegStr HKCR "agentlobby.agentconf\\DefaultIcon" "" "$INSTDIR\\agent-lobby.exe,0"
  WriteRegStr HKCR "agentlobby.agentconf\\shell\\open\\command" "" '"$INSTDIR\\agent-lobby.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCR "agentlobby.agentconf\\shell\\open\\command"
  DeleteRegKey HKCR "agentlobby.agentconf\\shell\\open"
  DeleteRegKey HKCR "agentlobby.agentconf\\DefaultIcon"
  DeleteRegKey HKCR "agentlobby.agentconf"
  DeleteRegKey HKCR ".agentconf"
!macroend
