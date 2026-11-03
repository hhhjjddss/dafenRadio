; DaFen Radio - NSIS 自定义安装/卸载脚本

!macro customInit
  ; 检查是否正在运行，提示关闭
  nsExec::ExecToLog 'tasklist /FI "IMAGENAME eq DaFen Radio.exe" /NH'
  Pop $0
  ${If} $0 == "0"
    MessageBox MB_YESNO|MB_ICONQUESTION "检测到 DaFen Radio 正在运行，是否自动关闭后继续安装？" IDYES closeApp IDNO abortInstall
    closeApp:
      nsExec::ExecToLog 'taskkill /F /IM "DaFen Radio.exe"'
      Sleep 1000
      Goto done
    abortInstall:
      Abort
    done:
  ${EndIf}
!macroend

!macro customUnInit
  ; 卸载前确认
  MessageBox MB_YESNO|MB_ICONQUESTION "确定要卸载 DaFen Radio 吗？" IDYES continueUninstall IDNO abortUninstall
  continueUninstall:
    ; 关闭正在运行的程序
    nsExec::ExecToLog 'taskkill /F /IM "DaFen Radio.exe" 2>nul'
    Sleep 500
    Goto done
  abortUninstall:
    Abort
  done:
!macroend

!macro customUnInstall
  ; 删除用户数据（可选）
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除用户数据和配置？$\n(收藏、设置等数据将丢失)" IDYES removeData IDNO skipData

  removeData:
    ; 删除 localStorage 数据（Electron 存储在 userData 目录）
    RMDir /r "$LOCALAPPDATA\dafen-radio"
    RMDir /r "$APPDATA\dafen-radio"
    ; 删除旧版本可能的存储位置
    RMDir /r "$LOCALAPPDATA\DaFen Radio"
    RMDir /r "$APPDATA\DaFen Radio"
    Goto done

  skipData:
  done:

  ; 清理开始菜单快捷方式
  Delete "$SMPROGRAMS\DaFen Radio.lnk"
  Delete "$SMPROGRAMS\DaFen Radio\DaFen Radio.lnk"
  RMDir "$SMPROGRAMS\DaFen Radio"

  ; 清理桌面快捷方式
  Delete "$DESKTOP\DaFen Radio.lnk"

  ; 清理注册表卸载信息（用户级）
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DaFen Radio"
  DeleteRegKey HKCU "Software\DaFen\Radio"

  ; 删除日志文件
  Delete "$INSTDIR\*.log"
!macroend
