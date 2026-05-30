# 小手机 Android 安装包

这是现有线上 PWA 的轻量 Android WebView 壳。它保留网页热更新能力，同时将聊天数据保存在 APK 自己的 WebView 数据目录中，不再依赖 Chrome 的站点数据。

## 构建

1. 将 Android SDK 路径写入未提交的 `local.properties`。
2. 将发布签名写入未提交的 `keystore.properties`，并备份 `keystore/` 中的签名文件。
3. 在本目录运行：

```powershell
.\gradlew.bat assembleRelease
```

发布 APK 位于 `app\build\outputs\apk\release\app-release.apk`。

## 更新规则

- 后续 APK 必须继续使用包名 `com.meishuixing.xiaoshouji`。
- 后续 APK 必须继续使用同一个发布签名文件，否则 Android 不允许覆盖升级。
- 安装 APK 前，先在旧 PWA 中导出一次数据；APK 与 Chrome PWA 的本地数据目录不同，需要在 APK 中手动导入。
