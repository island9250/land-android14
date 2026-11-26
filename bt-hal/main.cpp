// Minimal AIDL android.hardware.bluetooth.IBluetoothHci implementation for the
// EMB-3582 Android image, which only ships the legacy HIDL 1.1 HAL.
//
// The service proxies the kernel HCI "user channel" of a USB Bluetooth
// controller (btusb already loads firmware and registers hciN). The Android
// stack then owns the controller directly: commands, ACL/SCO/ISO data and
// events are forwarded verbatim, with the one-byte HCI packet type added on
// write and stripped on read.

#include <android/binder_manager.h>
#include <android/binder_process.h>
#include <android/log.h>

#include <dirent.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "android/hardware/bluetooth/IBluetoothHci.h"
#include "android/hardware/bluetooth/IBluetoothHciCallbacks.h"
#include "android/hardware/bluetooth/Status.h"

#ifndef AF_BLUETOOTH
#define AF_BLUETOOTH 31
#endif
#ifndef BTPROTO_HCI
#define BTPROTO_HCI 1
#endif

namespace {

constexpr uint8_t kPktCommand = 0x01;
constexpr uint8_t kPktAcl = 0x02;
constexpr uint8_t kPktSco = 0x03;
constexpr uint8_t kPktEvent = 0x04;
constexpr uint8_t kPktIso = 0x05;

constexpr unsigned short kChannelUser = 1;

struct sockaddr_hci {
  sa_family_t hci_family;
  unsigned short hci_dev;
  unsigned short hci_channel;
};

using aidl::android::hardware::bluetooth::IBluetoothHci;
using aidl::android::hardware::bluetooth::IBluetoothHciCallbacks;
using aidl::android::hardware::bluetooth::Status;

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "bt-hci-emb3582", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "bt-hci-emb3582", __VA_ARGS__)

int findHciDevice() {
  DIR* d = opendir("/sys/class/bluetooth");
  if (!d) return -1;
  int best = -1;
  while (dirent* e = readdir(d)) {
    int n = -1;
    if (sscanf(e->d_name, "hci%d", &n) == 1 && n >= 0) {
      if (best < 0 || n < best) best = n;
    }
  }
  closedir(d);
  return best;
}

class BtHciProxy : public aidl::android::hardware::bluetooth::BnBluetoothHci {
 public:
  ndk::ScopedAStatus close() override {
    std::shared_ptr<IBluetoothHciCallbacks> cb;
    {
      std::lock_guard<std::mutex> lk(lock_);
      cb = cb_;
      cb_.reset();
      stopLocked();
    }
    LOGI("closed");
    return ndk::ScopedAStatus::ok();
  }

  ndk::ScopedAStatus initialize(const std::shared_ptr<IBluetoothHciCallbacks>& cb) override {
    std::shared_ptr<IBluetoothHciCallbacks> out = cb;
    Status st = Status::SUCCESS;
    {
      std::lock_guard<std::mutex> lk(lock_);
      if (fd_ >= 0) {
        st = Status::ALREADY_INITIALIZED;
      } else {
        int dev = findHciDevice();
        if (dev < 0) {
          LOGE("no hci device (plug a USB bluetooth controller)");
          st = Status::UNABLE_TO_OPEN_INTERFACE;
        } else {
          int fd = socket(AF_BLUETOOTH, SOCK_RAW | SOCK_CLOEXEC, BTPROTO_HCI);
          if (fd < 0) {
            LOGE("socket(AF_BLUETOOTH) failed: %s", strerror(errno));
            st = Status::UNABLE_TO_OPEN_INTERFACE;
          } else {
            sockaddr_hci addr{};
            addr.hci_family = AF_BLUETOOTH;
            addr.hci_dev = static_cast<unsigned short>(dev);
            addr.hci_channel = kChannelUser;
            if (bind(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
              LOGE("bind hci%d user channel failed: %s", dev, strerror(errno));
              ::close(fd);
              st = Status::UNABLE_TO_OPEN_INTERFACE;
            } else {
              fd_ = fd;
              cb_ = cb;
              running_ = true;
              reader_ = std::thread([this] { readerLoop(); });
              LOGI("hci%d user channel open", dev);
            }
          }
        }
      }
    }
    if (out) out->initializationComplete(st);
    return ndk::ScopedAStatus::ok();
  }

  ndk::ScopedAStatus sendAclData(const std::vector<uint8_t>& data) override {
    writePacket(kPktAcl, data);
    return ndk::ScopedAStatus::ok();
  }

  ndk::ScopedAStatus sendHciCommand(const std::vector<uint8_t>& data) override {
    writePacket(kPktCommand, data);
    return ndk::ScopedAStatus::ok();
  }

  ndk::ScopedAStatus sendIsoData(const std::vector<uint8_t>& data) override {
    writePacket(kPktIso, data);
    return ndk::ScopedAStatus::ok();
  }

  ndk::ScopedAStatus sendScoData(const std::vector<uint8_t>& data) override {
    writePacket(kPktSco, data);
    return ndk::ScopedAStatus::ok();
  }

 private:
  void writePacket(uint8_t type, const std::vector<uint8_t>& data) {
    std::lock_guard<std::mutex> lk(write_lock_);
    if (fd_ < 0) return;
    std::vector<uint8_t> pkt;
    pkt.reserve(data.size() + 1);
    pkt.push_back(type);
    pkt.insert(pkt.end(), data.begin(), data.end());
    size_t off = 0;
    while (off < pkt.size()) {
      ssize_t n = ::write(fd_, pkt.data() + off, pkt.size() - off);
      if (n <= 0) {
        if (n < 0 && (errno == EAGAIN || errno == EINTR)) continue;
        LOGE("write hci packet failed: %s", strerror(errno));
        return;
      }
      off += static_cast<size_t>(n);
    }
  }

  void readerLoop() {
    uint8_t buf[4096];
    while (running_) {
      ssize_t n = ::read(fd_, buf, sizeof(buf));
      if (n <= 0) {
        if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (running_) LOGE("read hci packet failed: %s", strerror(errno));
        break;
      }
      if (n < 1) continue;
      std::vector<uint8_t> data(buf + 1, buf + n);
      std::shared_ptr<IBluetoothHciCallbacks> cb;
      {
        std::lock_guard<std::mutex> lk(lock_);
        cb = cb_;
      }
      if (!cb) continue;
      switch (buf[0]) {
        case kPktEvent:
          cb->hciEventReceived(data);
          break;
        case kPktAcl:
          cb->aclDataReceived(data);
          break;
        case kPktSco:
          cb->scoDataReceived(data);
          break;
        case kPktIso:
          cb->isoDataReceived(data);
          break;
        default:
          LOGE("unknown hci packet type 0x%02x", buf[0]);
          break;
      }
    }
  }

  void stopLocked() {
    running_ = false;
    if (fd_ >= 0) {
      ::shutdown(fd_, SHUT_RDWR);
      ::close(fd_);
      fd_ = -1;
    }
    if (reader_.joinable()) reader_.join();
  }

  std::mutex lock_;
  std::mutex write_lock_;
  int fd_ = -1;
  std::atomic<bool> running_{false};
  std::thread reader_;
  std::shared_ptr<IBluetoothHciCallbacks> cb_;
};

}  // namespace

int main() {
  ABinderProcess_setThreadPoolMaxThreadCount(4);
  auto hal = ndk::SharedRefBase::make<BtHciProxy>();
  const std::string name = std::string(IBluetoothHci::descriptor) + "/default";
  binder_status_t st = AServiceManager_addService(hal->asBinder().get(), name.c_str());
  if (st != STATUS_OK) {
    LOGE("addService(%s) failed: %d", name.c_str(), st);
    return 1;
  }
  LOGI("registered %s", name.c_str());
  ABinderProcess_joinThreadPool();
  return 0;
}