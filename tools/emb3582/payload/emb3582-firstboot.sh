#!/system/bin/sh
# EMB-3582 first-boot defaults: developer options, USB debugging, device name.
# Runs once per userdata (marker lives on /data, cleared by a factory reset).
MARK=/data/local/tmp/emb3582-firstboot.done
[ -f "$MARK" ] && exit 0

settings put global development_settings_enabled 1
settings put global adb_enabled 1
settings put global device_name NORCO-EMB3582
settings put secure bluetooth_name NORCO-EMB3582 2>/dev/null

touch "$MARK"
log -t emb3582-fb "first-boot defaults applied"