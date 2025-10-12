# 同期スクロール・サイドチャット

これは、動画とチャットログを同期させるためのシンプルなWebアプリケーションです。

## ✨ 機能

- 動画の再生に合わせて、チャットログが自動でスクロールします。
- チャットのタイムスタンプをクリックすると、動画の再生位置がその時間に移動します。

## 🚀 使い方

1.  `index.html` をブラウザで開きます。
2.  動画ファイルとチャットログ（JSON形式）を選択します。
3.  動画を再生すると、チャットが同期して表示されます。

## 🐳 Docker Compose で HTTPS 配信

ローカルで `https://localhost:8443` を立てることで Chrome / Edge のタブキャプチャ機能が利用できるようになります。

1. 自己署名証明書を生成します（初回のみ）。

   ```bash
   chmod +x scripts/generate-dev-cert.sh
   ./scripts/generate-dev-cert.sh
   ```

2. コンテナを起動します。

   ```bash
   docker compose up --build
   ```

3. ブラウザで `https://localhost:8443` を開き、警告が出たら「詳細」→「続行」で進みます。以降、録画開始時の共有ダイアログにタブが表示されます。

HTTP が必要な場合は `http://localhost:8080` でもアクセス可能です。

> ℹ️ タブ共有のピッカーが空のままの場合は、HTTPS でアクセスしているか再確認してください。アプリ側では画面キャプチャで音声を要求していないため、未信頼証明書環境でもタブ選択が表示されます。

## 🛠️ 技術スタック

- HTML
- CSS (Vanilla)
- JavaScript (Vanilla)

このリポジトリは [gemini-actions-lab](https://github.com/Sunwood-ai-labsII/gemini-actions-lab) をテンプレートとして作成されました。
