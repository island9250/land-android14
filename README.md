# land-android14 — NORCO EMB3582 Android 14

面向 NORCO-EMB3582 的 RK3588 Android 14 eMMC/SD 镜像、线刷包和可重复 CI 构建。

## 最终整包 v1.0.0

- Release：[v1.0.0](https://github.com/island9250/land-android14/releases/tag/v1.0.0)
- 下载：`update-emb3582-final.tar.gz`（1,074,790,668 B）
- 解压后：`update-emb3582-final.img`（3,929,643,594 B）
- SHA256：`4685e6ffda1f5f2db9d0015567ede1a9b00ece3c2176354796e5e1480f17f7b1`

已固化：NORCO-EMB3582 品牌、中文、rtl8188fu WiFi、r8168、ES8328、蓝牙 HAL/manifest、风扇和 firstboot；不依赖 overlay。

## 刷机

常规流程：备份 → LOADER（`2207:350B`）→ 瑞芯微开发工具「升级固件」→ 选择完整 `update.img` → 升级。

- **常规刷机不需要预先擦除 Flash。**
- 刷机后若无法正常启动，请先擦除 Flash，再重新刷完整包。
- Maskrom 救砖时可先用「高级功能 → Boot」下载 `MiniLoaderAll.bin` 回到 LOADER；需要清盘时再点「擦除所有」。
- 「擦除所有」会清空 GPT 和全部分区，数据不可恢复。

详见 [EMB3582 USB 线刷与回滚](docs/EMB3582-USB线刷与回滚.md)。

## CI 自动打包

`.github/workflows/build-emb3582-final.yml`：

```text
下载原厂 super → 切 6 片 → debugfs 离线烘焙 → 拼回 super → SHA256 回读
→ 下载基础分区 → Windows AFPTool/RKImageMaker → tar.gz → SHA256SUMS
→ artifact / Release
```

基础资产位于 Release `emb3582-base-v1`。手动运行：

```bash
gh workflow run build-emb3582-final.yml -r emb3582 \
  -f release_tag=v1.0.1 -f publish_release=true
```

详见 [CI 打包与复现](docs/EMB3582-CI打包与复现.md)。

## SD 卡镜像

`.github/workflows/build-emb3582-sd.yml` 使用通用 `pack_boot.py` / `make_sd_image.py`，把 EMB3582 DTB 注入 12 个槽位并生成 SD 整盘镜像，不碰 eMMC。

## 目录

- `tools/emb3582/`：最终包烘焙、拼接、校验脚本和 payload
- `.github/workflows/build-emb3582-*.yml`：SD、模块、蓝牙和最终整包构建
- `bt-hal/`：EMB3582 蓝牙 AIDL HAL
- `kernel/`：内核/模块构建输入
- `dts/`、`vendor/dts-tree/`：EMB3582 DTS 与依赖闭包
- `docs/`：刷机、回滚、CI 复现和 Release 说明

## 已知问题

- 蓝牙 HAL/manifest 正常，但板载 RTL8761BU 当前未枚举。
- 新增文件 SELinux 标签为 `unlabeled`，当前系统 `permissive`；切 `enforcing` 前需补标签。
- 关机/重启瞬间 HDMI 短暂花屏/闪烁通常是 VOP/HDMI 关闭与重建；若持续存在，请检查线材和 `vop/hdmi/phy/hpd` 日志。
