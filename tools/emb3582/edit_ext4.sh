#!/bin/bash
# Offline ext4 edits for the EMB-3582 super slices (runs on the CI runner).
# Covers all six writable slices: vendor, vendor_dlkm, system, system_ext,
# odm, product. vendor_dlkm is rebuilt because its stock 48-inode fs is full.
set -euo pipefail
cd "$(dirname "$0")"
P=payload

props_model() {
    sed -i -E 's/^(ro\.product\.[a-z_]+\.model)=.*/\1=NORCO-EMB3582/; s/^(ro\.product\.[a-z_]+\.device)=.*/\1=emb3582/; s/^(ro\.product\.[a-z_]+\.name)=.*/\1=emb3582/' "$1"
    grep -q 'NORCO-EMB3582' "$1"
}

has_file() { debugfs -R "stat $2" "$1" 2>/dev/null | grep -q 'Inode:'; }

rewrite_prop() { # img path mode
    local img=$1 path=$2 mode=$3
    local tmp="/tmp/$(basename "$path").$$"
    if ! has_file "$img" "$path"; then
        echo "   SKIP $img:$path (absent)"
        debugfs -R "ls -l /" "$img" 2>/dev/null | head -20 || true
        return 0
    fi
    debugfs -R "dump $path $tmp" "$img"
    props_model "$tmp"
    debugfs -w -R "rm $path" "$img"
    debugfs -w -R "write $tmp $path" "$img"
    debugfs -w -R "sif $path mode $mode" "$img"
}

echo "== vendor"
V=vendor.img
debugfs -w -R "mkdir /etc/firmware/rtlwifi" "$V" || true
debugfs -w -R "rm /bin/hw/android.hardware.bluetooth@1.1-service.btlinux" "$V" || true
debugfs -w -R "write $P/android.hardware.bluetooth-service.emb3582 /bin/hw/android.hardware.bluetooth@1.1-service.btlinux" "$V"
debugfs -w -R "sif /bin/hw/android.hardware.bluetooth@1.1-service.btlinux mode 0100755" "$V"
debugfs -w -R "sif /bin/hw/android.hardware.bluetooth@1.1-service.btlinux uid 0" "$V"
debugfs -w -R "sif /bin/hw/android.hardware.bluetooth@1.1-service.btlinux gid 0" "$V"
debugfs -w -R "write $P/rtl8188fufw.bin /etc/firmware/rtlwifi/rtl8188fufw.bin" "$V"
debugfs -w -R "sif /etc/firmware/rtlwifi/rtl8188fufw.bin mode 0100644" "$V"
debugfs -w -R "write $P/bluetooth_hci_aidl.xml /etc/vintf/manifest/bluetooth_hci_aidl.xml" "$V"
debugfs -w -R "sif /etc/vintf/manifest/bluetooth_hci_aidl.xml mode 0100644" "$V"
debugfs -w -R "write $P/fan-always-on.rc /etc/init/fan-always-on.rc" "$V"
debugfs -w -R "sif /etc/init/fan-always-on.rc mode 0100644" "$V"
debugfs -w -R "write $P/emb3582-firstboot.rc /etc/init/emb3582-firstboot.rc" "$V"
debugfs -w -R "sif /etc/init/emb3582-firstboot.rc mode 0100644" "$V"
debugfs -w -R "write $P/emb3582-firstboot.sh /etc/emb3582-firstboot.sh" "$V"
debugfs -w -R "sif /etc/emb3582-firstboot.sh mode 0100755" "$V"
debugfs -w -R "rm /etc/init/android.hardware.bluetooth@1.1-service.btlinux.rc" "$V" || true
debugfs -w -R "write $P/btlinux.new.rc /etc/init/android.hardware.bluetooth@1.1-service.btlinux.rc" "$V"
debugfs -w -R "sif /etc/init/android.hardware.bluetooth@1.1-service.btlinux.rc mode 0100644" "$V"
grep -q 'seclabel u:r:hal_bluetooth_btlinux:s0' "$P/btlinux.new.rc"
rewrite_prop "$V" /build.prop 0100600
e2fsck -f -y "$V" | tail -1

echo "== vendor_dlkm (rebuild with more inodes)"
VD=vendor_dlkm.img
rm -rf /tmp/vd && mkdir -p /tmp/vd
debugfs -R "rdump / /tmp/vd" "$VD"
rm -rf /tmp/vd/lost+found
rm -f /tmp/vd/lib/modules/rtl8812au.ko /tmp/vd/lib/modules/rtl8851bu.ko
for m in rtl8188fu snd-soc-es8328 snd-soc-es8328-i2c r8168; do
    cp -f "$P/$m.ko" "/tmp/vd/lib/modules/$m.ko"
done
grep -v -E '^(rtl8812au|rtl8851bu)\.ko$' /tmp/vd/lib/modules/modules.load > /tmp/modules.load.new
for m in snd-soc-es8328.ko snd-soc-es8328-i2c.ko r8168.ko rtl8188fu.ko; do
    grep -qx "$m" /tmp/modules.load.new || echo "$m" >> /tmp/modules.load.new
done
cp -f /tmp/modules.load.new /tmp/vd/lib/modules/modules.load
mke2fs -q -t ext4 -b 4096 -m 0 -O ^has_journal -I 128 -N 512 -F -d /tmp/vd "$VD"
e2fsck -f -y "$VD" | tail -1

echo "== system"
S=system.img
SYS_PROP=/system/build.prop
has_file "$S" "$SYS_PROP" || SYS_PROP=/build.prop
rewrite_prop "$S" "$SYS_PROP" 0100644
if has_file "$S" "$SYS_PROP"; then
    debugfs -R "dump $SYS_PROP /tmp/system.build.prop" "$S"
    sed -i -E 's/^ro\.build\.product=.*/ro.build.product=emb3582/; s/^ro\.build\.flavor=.*/ro.build.flavor=emb3582-userdebug/; s/^ro\.build\.description=.*/ro.build.description=emb3582-userdebug 14 UQ1A.240205.004.B1 62512226 release-keys/; s/^ro\.build\.display\.id=.*/ro.build.display.id=emb3582-userdebug 14 UQ1A.240205.004.B1 62512226 release-keys/; s/^ro\.product\.locale=.*/ro.product.locale=zh-CN/' /tmp/system.build.prop
    grep -q '^ro\.product\.locale\.language=' /tmp/system.build.prop || sed -i '/^ro\.product\.locale=zh-CN/a ro.product.locale.language=zh\nro.product.locale.region=CN' /tmp/system.build.prop
    grep -q '^ro.product.locale=zh-CN' /tmp/system.build.prop
    debugfs -w -R "rm $SYS_PROP" "$S"
    debugfs -w -R "write /tmp/system.build.prop $SYS_PROP" "$S"
    debugfs -w -R "sif $SYS_PROP mode 0100644" "$S"
fi
e2fsck -f -y "$S" | tail -1

echo "== system_ext"
rewrite_prop system_ext.img /etc/build.prop 0100644
e2fsck -f -y system_ext.img | tail -1

echo "== odm"
rewrite_prop odm.img /etc/build.prop 0100644
e2fsck -f -y odm.img | tail -1

echo "== product"
PR=product.img
if has_file "$PR" /etc/build.prop; then
    debugfs -R "dump /etc/build.prop /tmp/product.build.prop" "$PR"
    props_model /tmp/product.build.prop
    grep -q '^ro\.product\.product\.locale=' /tmp/product.build.prop || printf 'ro.product.product.locale=zh-CN\nro.product.product.locale.language=zh\nro.product.product.locale.region=CN\n' >> /tmp/product.build.prop
    sed -i -E 's/^ro\.product\.product\.locale\.region=.*/ro.product.product.locale.region=CN/' /tmp/product.build.prop
    debugfs -w -R "rm /etc/build.prop" "$PR"
    debugfs -w -R "write /tmp/product.build.prop /etc/build.prop" "$PR"
    debugfs -w -R "sif /etc/build.prop mode 0100644" "$PR"
else
    echo "   SKIP product /etc/build.prop (absent)"
fi
e2fsck -f -y "$PR" | tail -1

echo "== verify"
debugfs -R "dump /build.prop /tmp/v2.prop" vendor.img
grep -q 'NORCO-EMB3582' /tmp/v2.prop && echo "vendor prop ok"
debugfs -R "dump /etc/init/android.hardware.bluetooth@1.1-service.btlinux.rc /tmp/bt2.rc" vendor.img
grep -q 'seclabel u:r:hal_bluetooth_btlinux:s0' /tmp/bt2.rc && echo "btlinux rc ok"
debugfs -R "dump /lib/modules/modules.load /tmp/ml2" vendor_dlkm.img
grep -q '^r8168\.ko$' /tmp/ml2 && grep -q '^rtl8188fu\.ko$' /tmp/ml2 && echo "modules.load ok"
debugfs -R "dump /lib/modules/r8168.ko /tmp/r8168.bin" vendor_dlkm.img
stat -c '%s' /tmp/r8168.bin
debugfs -R "dump $SYS_PROP /tmp/s2.prop" system.img
if [ -f /tmp/s2.prop ]; then
    grep -q 'NORCO-EMB3582' /tmp/s2.prop && echo "system prop ok"
    grep -q '^ro.build.flavor=emb3582-userdebug$' /tmp/s2.prop && echo "system flavor ok"
fi
debugfs -R "dump /etc/build.prop /tmp/se2.prop" system_ext.img
grep -q 'NORCO-EMB3582' /tmp/se2.prop && echo "system_ext prop ok"
debugfs -R "dump /etc/build.prop /tmp/p2.prop" product.img
grep -q 'NORCO-EMB3582' /tmp/p2.prop && echo "product prop ok"
echo BAKE_EXT4_DONE