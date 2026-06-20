# VerityMeter

AIによる記事信憑性診断サイト

## ファイル構成

```
veritymeter/
├── public/
│   └── index.html      ← サイトの見た目（フロントエンド）
└── functions/
    └── api/
        └── check.js     ← AI診断を行うサーバー側API（APIキーはここでのみ使用）
```

## GitHubへのアップロード手順

1. GitHubにログイン → 右上の「+」→「New repository」
2. リポジトリ名を `veritymeter` にする（Public/Privateどちらでも可）
3. 「Create repository」をクリック
4. 表示される画面で「uploading an existing file」のリンクをクリック
5. このフォルダの中身（`public`フォルダと`functions`フォルダごと）をドラッグ＆ドロップ
6. 「Commit changes」で保存

## Cloudflare Pagesへのデプロイ手順

1. Cloudflareダッシュボード → 左メニュー「Workers & Pages」
2. 「Create application」→「Pages」タブ→「Connect to Git」
3. 先ほど作成したGitHubリポジトリ（veritymeter）を選択
4. ビルド設定：
   - Framework preset: **None**
   - Build command: 空欄のまま
   - Build output directory: `public`
5. 「Save and Deploy」をクリック

## APIキーの設定（最重要）

1. デプロイ後、そのPagesプロジェクトの「Settings」→「Environment variables」
2. 「Add variable」をクリック
3. 変数名: `ANTHROPIC_API_KEY`
4. 値: （Anthropic Consoleで発行したAPIキー、sk-ant-...から始まるもの）
5. 「Encrypt」にチェックを入れて保存
6. 設定後、再度デプロイ（Retry deployment）して反映

## 独自ドメイン（veritymeter.org）の紐付け

1. PagesプロジェクトのSettings → 「Custom domains」
2. 「Set up a custom domain」→ `veritymeter.org` を入力
3. 自動的にCloudflareのDNSと連携され、数分で反映されます

## 動作確認

- `https://veritymeter.org` にアクセス
- URL欄に記事のリンクを貼って「診断する」を押す
- スコアと診断結果が表示されれば成功

## トラブルシューティング

| 症状 | 原因の可能性 |
|------|------------|
| 「サーバー側のAPIキーが設定されていません」と出る | Environment variablesの設定漏れ、または再デプロイ未実施 |
| 「AI分析サービスでエラーが発生しました」と出る | APIキーが無効、またはAnthropicアカウントの支払い設定未完了 |
| 画面が真っ白 | ビルド設定の Build output directory が `public` になっているか確認 |
