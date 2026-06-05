# 安规背题助手

一个纯静态的本地/网页背题工具，题库来自 Excel 导出的 `data/questions.js`。

## 本地运行

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

同一 Wi-Fi 下的手机可以访问：

```text
http://电脑局域网IP:4173
```

## 发布到 GitHub Pages

仓库推送到 GitHub 后，在仓库页面进入：

```text
Settings -> Pages -> Build and deployment
```

选择：

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

保存后等待 1-2 分钟，GitHub 会生成公网访问地址。

## 更新题库

替换 Excel 后运行：

```bash
python3 scripts/export_questions.py
```

再提交并推送更新即可。
