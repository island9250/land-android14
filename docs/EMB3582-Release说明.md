# EMB3582 Android 14 最终整包 v1.0.0

## 下载

| 文件 | 大小 | SHA256 |
|---|---:|---|
| `update-emb3582-final.tar.gz` | 1,074,790,668 B | `6bb7c9d090bd717e52ff4d6fccf8af65229f24dad96853c52d0b4c34b7e07d27` |
| `update-emb3582-final.img`（解压后） | 3,929,643,594 B | `4685e6ffda1f5f2db9d0015567ede1a9b00ece3c2176354796e5e1480f17f7b1` |

校验：

```bash
sha256sum -c SHA256SUMS.txt
tar xzf update-emb3582-final.tar.gz
```

Windows 可用 7-Zip 或系统自带 `tar` 解压。

## 刷机

1. 备份 eMMC 数据；本包会写 `misc/vbmeta/boot/super` 等分区，并重建 A/B 元数据。
2. 板子进入 Rockusb loader：USB 为 `2207:350B`。
3. 瑞芯微开发工具 →「升级固件」→ 选择 `update-emb3582-final.img` →「升级」。
4. 等待自动重启，确认 adb（`2207:0006`）或 MTP 出现。

> 常规刷机不需要预先擦除。若刷机后无法正常启动，请先擦除 Flash（Maskrom 下可先用「高级功能 → Boot」下载 `MiniLoaderAll.bin`，再点「擦除所有」），然后重新刷完整包。擦除会清空全盘，数据不可恢复。

详细步骤与回滚见 `docs/EMB3582-USB线刷与回滚.md`。

## 已真机验证

- Android 14，品牌 `NORCO-EMB3582` / `emb3582-userdebug` / `zh-CN`
- WiFi：`rtl8188fu`、固件加载、`wlan0`
- 网卡：`r8168`（eth1）
- 音频：ES8328 模块
- 蓝牙 HAL 与 VINTF manifest 正常
- 风扇：`reg_fan enable=1`
- firstboot：设备名、USB 调试、开发者选项
- 无 overlay/scratch 依赖，改动已固化进 super
- `reboot loader` 可进 Rockusb；RKDevTool「重启设备」可正常回到系统

## 已知问题

- 板载蓝牙硬件当前未枚举，需确认 RTL8761BU 已装配/识别；HAL 本身正常。
- CI 烘焙的新增文件 SELinux 标签为 `unlabeled`，当前系统 `permissive`，功能不受影响；切 `enforcing` 前需补标签。
- 关机/重启瞬间 HDMI 可能出现短暂花屏/闪烁，属于显示链路关闭/重建时的瞬态；若持续或重启后异常，请检查线材与 HDMI 驱动日志。
