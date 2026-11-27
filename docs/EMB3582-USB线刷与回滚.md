# EMB3582 USB 线刷与回滚

## 刷机前

- **常规刷机不需要擦除 Flash，也不需要点「擦除所有」**。完整包已包含 parameter、misc 和 GPT 所需内容。
- 备份 eMMC；整包会覆盖 `misc/vbmeta/boot/super` 等分区。
- 确认板子进入 Rockusb loader：Windows 设备管理器应显示 `2207:350B Rockusb Device`。
- TTL 为 COM3 / 1500000；loader 状态下通常只循环打印等待符 `-\|/`，没有 U-Boot 横幅，属正常。
- 不要使用 2026-11-26 15:07 生成的旧 `update_parts/update.img`；该包内嵌旧 uboot，会重新出现 loader 粘滞。

## 刷机步骤

1. 打开瑞芯微开发工具，确认「发现一个 LOADER 设备」。
2. 切到「升级固件」页，点「固件」选择 `update-emb3582-final.img`。
3. 点「升级」，等待日志出现「下载固件成功」。
4. 工具会自动复位。若仍停在 loader，用「高级功能 → 重启设备」；本包 uboot 为原厂 env，实测该操作可正常回到系统。
5. 系统启动后确认 adb `2207:0006` 或 MTP `2207:0007`。

### 刷机后无法启动：先擦除，再重刷

如果刷机后无法正常启动（例如一直停在 loader、`No bootable slots`、反复重启），按以下顺序处理：

1. 重新进入 Maskrom 或 LOADER。
2. 若处于 Maskrom，用「高级功能 → Boot」选择 `MiniLoaderAll.bin` →「下载」，让设备回到 LOADER。
3. 在「高级功能」点「擦除所有」。**此操作会清空 GPT 和全部分区，数据不可恢复。**
4. 回到「升级固件」，重新刷完整的 `update-emb3582-final.img`；完整包会重建 parameter、misc 和 GPT。

常规首次刷机仍不需要预先擦除；只有刷后异常时才采用上面的“先擦除、后重刷”排障流程。

## 刷后检查

```bash
adb devices
adb shell getprop ro.product.model       # NORCO-EMB3582
adb shell getprop ro.product.device      # emb3582
adb shell getprop ro.build.flavor        # emb3582-userdebug
adb shell getprop ro.product.locale      # zh-CN
adb shell ip link show wlan0
adb shell lsmod | grep -E 'rtl8188fu|r8168|es8328'
adb shell cat /sys/kernel/debug/regulator/reg_fan/enable   # 1
```

重启后如需读分区，先执行 `adb root`。

## 回滚

- 保留原厂 `super.img` 和基础分区包；需要回滚时重新制作只含原厂分区的整包。
- 单独恢复 uboot：使用原厂 env 的 `uboot.img` 打小包，只写 `uboot_a/uboot_b`，不要写 `reboot_mode=normal` 补丁版，否则 `reboot loader` 会被屏蔽。
- 若出现 `No bootable slots`，说明 misc 的 A/B 元数据失效；刷含 `misc.img` 的完整包可重建。
- 进入 loader 后若软复位再次回到 loader，先断电再上电，清除 PMU 模式寄存器。

## 已知问题

- 蓝牙 HAL/manifest 正常，但板载 RTL8761BU 当前未枚举；需确认硬件装配与 USB 识别。
- 新增文件 SELinux 标签为 `unlabeled`，系统当前 `permissive`；切 `enforcing` 前必须补标签。
- 关机/重启瞬间 HDMI 短暂花屏/闪烁通常是 VOP/HDMI 关闭与重新训练；若持续存在，请抓串口日志并检查 `vop/hdmi/phy/hpd`。
