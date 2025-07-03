# 🧠 暗記アプリ - スマート学習システム

## 📱 Web版フラッシュカードアプリ

科学的間隔反復学習アルゴリズムを活用した効率的な暗記学習アプリです。

### ✨ 主要機能

- 🎯 **科学的学習法**: 間隔反復アルゴリズム（1日→3日→7日→14日）
- 🔄 **クラウド同期**: Firebase認証でデバイス間データ同期
- 📊 **学習分析**: Chart.jsによる進捗可視化
- 💾 **オフライン対応**: PWA + Service Worker
- 📱 **レスポンシブ**: モバイル・デスクトップ完全対応
- 💰 **収益化**: Google AdSense統合

### 🚀 デプロイ方法

#### GitHub Pages 自動デプロイ

1. **リポジトリ作成**
```bash
git clone https://github.com/your-username/flashcard-web-app.git
cd flashcard-web-app
```

2. **GitHub Pages 有効化**
   - GitHub リポジトリ → Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / root
   - Save

3. **自動デプロイ完了**
   - URL: `https://your-username.github.io/flashcard-web-app/`

#### Firebase 設定（クラウド同期用）

1. **Firebase プロジェクト作成**
   - [Firebase Console](https://console.firebase.google.com/) でプロジェクト作成
   - Authentication → Sign-in method → Email/Password 有効化
   - Firestore Database → Create database → Test mode

2. **設定更新**
```javascript
// firebase-config.js
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789012",
    appId: "your-app-id"
};

// Demo mode を無効化
const DEMO_MODE = false;
```

### 📊 AdSense 設定

```html
<!-- index.html 内のプレースホルダーを実際のコードに置換 -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR-PUBLISHER-ID"></script>
```

### 🛠️ 技術スタック

- **フロントエンド**: Vanilla JavaScript (ES6+)
- **スタイル**: CSS3 + Flexbox/Grid
- **データベース**: IndexedDB + Firebase Firestore
- **認証**: Firebase Authentication
- **PWA**: Service Worker + Web App Manifest
- **チャート**: Chart.js
- **広告**: Google AdSense

### 📈 学習アルゴリズム

```javascript
const intervals = {
    forgot: 1,      // 即日復習
    unsure: 3,      // 3日後
    remembered: 7,  // 1週間後
    perfect: 14     // 2週間後
};
```

### 🎨 UI/UX 特徴

- グラデーション背景デザイン
- カード型インターフェース
- スムーズアニメーション
- ダークモード対応
- タッチ操作最適化

### 📱 PWA 機能

- ホーム画面追加可能
- オフライン学習継続
- プッシュ通知（学習リマインダー）
- アプリライクな操作性

### 🔒 セキュリティ

- Firebase Rules による データアクセス制御
- HTTPS 必須
- クライアントサイド暗号化

### 📞 サポート

- 問題報告: [Issues](https://github.com/your-username/flashcard-web-app/issues)
- 機能要望: [Discussions](https://github.com/your-username/flashcard-web-app/discussions)

### 📄 ライセンス

MIT License - 商用利用可

---

🤖 Generated with [Claude Code](https://claude.ai/code)