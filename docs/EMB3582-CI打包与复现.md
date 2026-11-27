# EMB3582 CI 打包与复现

## 资产

自动构建依赖 `emb3582-base-v1` Release 中的两个资产：

- `super-base.tar.gz`：原厂 `super.img`，约 3.35 GB。
- `base-parts.tar.gz`：MiniLoader、parameter、boot/dtbo/vbmeta/misc、backup/cache/metadata/frp/baseparameter/security、原厂 env uboot 和 `package-file`。
- `SHA256SUMS-base.txt` / `SHA256SUMS-base-parts.txt`：对应压缩包校验。

大镜像不进入 git；仓库只保存烘焙脚本、payload、分区布局和校验器。

## 工作流

`.github/workflows/build-emb3582-final.yml`：

```text
下载 super-base → 切 6 片 → debugfs 离线烘焙 → 拼回 super → SHA256 回读
→ 下载 base-parts + baked super → afptool → rkImageMaker
→ 源包校验 → tar.gz → SHA256SUMS → artifact / Release
```

触发：

```bash
gh workflow run build-emb3582-final.yml -r emb3582 \
  -f release_tag=v1.0.1 -f publish_release=true
```

修改 `tools/emb3582/**` 或工作流并推送 `emb3582` 分支也会自动运行，但默认只上传 artifact，不发布 Release。

## 本地复现

```bash
node tools/emb3582/prepare_slices.mjs super.img slices
cp tools/emb3582/edit_ext4.sh slices/
cp -a tools/emb3582/payload slices/
(cd slices && sudo bash edit_ext4.sh)
node tools/emb3582/splice_super.mjs super.img slices super-emb3582.img
node tools/emb3582/verify_super.mjs super-emb3582.img slices
node tools/emb3582/verify_package.mjs pkg
```

`pkg/` 由 `base-parts.tar.gz` 解压，并把 `super-emb3582.img` 改名为 `pkg/super.img`。

RKTools 使用 `rockchip-toybrick/RKTools` 的 Linux 版 `afptool` / `rkImageMaker`：

```bash
afptool -pack pkg update.raw.img
rkImageMaker -RK3588 pkg/MiniLoaderAll.bin update.raw.img update.img -os_type:androidos
```

## 关键约束

- system 的 build.prop 在 **`/system/build.prop`**，不是 `/build.prop`。
- 原厂 vendor_dlkm 只有 **48 个 inode**；脚本删除 `rtl8812au/rtl8851bu` 后用 512 inode 重建，再写回四个模块。
- vendor 分区接近满，写入后必须跑 `e2fsck`，并用 dump 回读关键文件。
- super 拼接后必须逐片 SHA256 回读，不能只看命令退出码。
- `edit_ext4.sh` 通过管道输出日志时必须启用 `pipefail`，避免失败被 `tee` 掩盖。
- 最终压缩包约 1.0 GiB，低于 GitHub Release 单资产 2 GB 限制。

## 真机验证摘要

v1.0.0 已刷入 eMMC 并验证：Android 14 桌面、品牌属性、WiFi 固件与 wlan0、r8168、ES8328、蓝牙 HAL/manifest、风扇、firstboot、无 overlay 依赖，以及 `reboot loader` → RKDevTool 重启回系统。
