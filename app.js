// Flashcard Web App - Main Application Logic
class FlashcardApp {
    constructor() {
        this.db = null;
        this.currentCard = null;
        this.currentCardIndex = 0;
        this.todaysCards = [];
        this.allCards = [];
        this.isAnswerVisible = false;
        this.charts = {};
        
        // Spaced repetition intervals (days)
        this.intervals = {
            forgot: 1,
            unsure: 3,
            remembered: 7,
            perfect: 14
        };
        
        // Cloud sync properties
        this.currentUser = null;
        this.isAutoSyncEnabled = false;
        this.syncInProgress = false;
        this.lastSyncTime = null;
        
        this.init();
    }

    async init() {
        try {
            await this.initDatabase();
            await this.loadData();
            this.setupEventListeners();
            this.setupNavigation();
            this.setupFirebaseAuth();
            this.updateUI();
            this.showToast('アプリが正常に読み込まれました', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('アプリの初期化に失敗しました', 'error');
        }
    }

    // Database Management
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FlashcardApp', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Cards store
                if (!db.objectStoreNames.contains('cards')) {
                    const cardsStore = db.createObjectStore('cards', { keyPath: 'id' });
                    cardsStore.createIndex('category', 'category');
                    cardsStore.createIndex('nextReview', 'nextReview');
                }
                
                // Statistics store
                if (!db.objectStoreNames.contains('statistics')) {
                    const statsStore = db.createObjectStore('statistics', { keyPath: 'date' });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async loadData() {
        // Load cards from IndexedDB
        this.allCards = await this.getAllCards();
        
        // If no cards exist, create sample cards
        if (this.allCards.length === 0) {
            await this.createSampleCards();
            this.allCards = await this.getAllCards();
        }
        
        // Get today's cards for review
        this.todaysCards = this.getTodaysCards();
        
        // Load settings
        await this.loadSettings();
        
        // Auto backup
        this.createAutoBackup();
    }

    async getAllCards() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readonly');
            const store = transaction.objectStore('cards');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async saveCard(card) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');
            const request = store.put(card);
            
            request.onsuccess = () => {
                this.backupToLocalStorage(card);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteCard(cardId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');
            const request = store.delete(cardId);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Spaced Repetition Logic
    getTodaysCards() {
        const today = new Date().toISOString().split('T')[0];
        return this.allCards.filter(card => {
            const reviewDate = card.nextReview ? card.nextReview.split('T')[0] : today;
            return reviewDate <= today;
        });
    }

    async updateCardProgress(cardId, difficulty) {
        const card = this.allCards.find(c => c.id === cardId);
        if (!card) return;

        const now = new Date();
        const days = this.intervals[difficulty];
        const nextReview = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

        const updatedCard = {
            ...card,
            lastReview: now.toISOString(),
            nextReview: nextReview.toISOString(),
            reviewCount: (card.reviewCount || 0) + 1,
            difficulty: difficulty,
            lastModified: now.toISOString()
        };

        await this.saveCard(updatedCard);
        
        // Update statistics
        await this.updateStatistics(difficulty);
        
        // Update local arrays
        const index = this.allCards.findIndex(c => c.id === cardId);
        this.allCards[index] = updatedCard;
        
        this.todaysCards = this.getTodaysCards();
        
        return updatedCard;
    }

    // UI Management
    setupEventListeners() {
        // Study page events
        const flipBtn = document.getElementById('flip-btn');
        const answerButtons = document.querySelectorAll('.answer-btn');
        
        flipBtn?.addEventListener('click', () => this.flipCard());
        
        answerButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const difficulty = e.currentTarget.dataset.difficulty;
                this.handleAnswer(difficulty);
            });
        });

        // Cards management events
        const addCardBtn = document.getElementById('add-card-btn');
        const addCardForm = document.getElementById('add-card-form');
        const cancelCardBtn = document.getElementById('cancel-card-btn');
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const searchInput = document.getElementById('search-input');
        const categoryFilter = document.getElementById('category-filter');

        addCardBtn?.addEventListener('click', () => this.showAddCardModal());
        addCardForm?.addEventListener('submit', (e) => this.handleAddCard(e));
        cancelCardBtn?.addEventListener('click', () => this.hideAddCardModal());
        exportBtn?.addEventListener('click', () => this.exportCards());
        importBtn?.addEventListener('click', () => this.importCards());
        searchInput?.addEventListener('input', () => this.filterCards());
        categoryFilter?.addEventListener('change', () => this.filterCards());

        // Settings events
        const themeSelect = document.getElementById('theme-select');
        const backupBtn = document.getElementById('backup-btn');
        const restoreBtn = document.getElementById('restore-btn');
        const resetBtn = document.getElementById('reset-btn');
        const autoFlip = document.getElementById('auto-flip');
        const soundEffects = document.getElementById('sound-effects');

        themeSelect?.addEventListener('change', (e) => this.changeTheme(e.target.value));
        backupBtn?.addEventListener('click', () => this.manualBackup());
        restoreBtn?.addEventListener('click', () => this.restoreData());
        resetBtn?.addEventListener('click', () => this.resetAllData());
        autoFlip?.addEventListener('change', (e) => this.saveSetting('autoFlip', e.target.checked));
        soundEffects?.addEventListener('change', (e) => this.saveSetting('soundEffects', e.target.checked));

        // Cloud sync events
        const loginBtn = document.getElementById('login-btn');
        const signupBtn = document.getElementById('signup-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const syncNowBtn = document.getElementById('sync-now-btn');
        const autoSyncToggle = document.getElementById('auto-sync-toggle');

        loginBtn?.addEventListener('click', () => this.handleLogin());
        signupBtn?.addEventListener('click', () => this.handleSignup());
        logoutBtn?.addEventListener('click', () => this.handleLogout());
        syncNowBtn?.addEventListener('click', () => this.syncNow());
        autoSyncToggle?.addEventListener('click', () => this.toggleAutoSync());
    }

    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        const pages = document.querySelectorAll('.page');

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = btn.dataset.page;
                
                // Update active nav button
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show target page
                pages.forEach(page => {
                    page.classList.remove('active');
                    if (page.id === `${targetPage}-page`) {
                        page.classList.add('active');
                    }
                });
                
                // Load page-specific content
                this.loadPageContent(targetPage);
            });
        });
    }

    async loadPageContent(page) {
        switch (page) {
            case 'study':
                this.loadStudyPage();
                break;
            case 'cards':
                this.loadCardsPage();
                break;
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    // Study Page Logic
    loadStudyPage() {
        this.currentCardIndex = 0;
        this.isAnswerVisible = false;
        this.displayCurrentCard();
        this.updateStudyStats();
    }

    displayCurrentCard() {
        const questionEl = document.getElementById('card-question');
        const answerEl = document.getElementById('card-answer');
        const flipBtn = document.getElementById('flip-btn');
        const answerButtons = document.getElementById('answer-buttons');

        // DOM要素の存在チェック
        if (!questionEl || !answerEl || !flipBtn || !answerButtons) {
            console.error('Study UI elements not found');
            return;
        }

        if (this.todaysCards.length === 0) {
            questionEl.textContent = '今日の復習は完了しました！新しいカードを追加してください。';
            answerEl.classList.add('hidden');
            flipBtn.disabled = true;
            answerButtons.classList.add('hidden');
            this.showStudyCompletionAd();
            return;
        }

        if (this.currentCardIndex >= this.todaysCards.length) {
            this.showStudyCompletion();
            return;
        }

        this.currentCard = this.todaysCards[this.currentCardIndex];
        questionEl.textContent = this.currentCard.question;
        answerEl.textContent = this.currentCard.answer;
        answerEl.classList.add('hidden');
        flipBtn.disabled = false;
        answerButtons.classList.add('hidden');
        this.isAnswerVisible = false;
    }

    flipCard() {
        const answerEl = document.getElementById('card-answer');
        const flipBtn = document.getElementById('flip-btn');
        const answerButtons = document.getElementById('answer-buttons');

        answerEl.classList.remove('hidden');
        flipBtn.style.display = 'none';
        answerButtons.classList.remove('hidden');
        this.isAnswerVisible = true;
    }

    async handleAnswer(difficulty) {
        if (!this.currentCard) return;

        try {
            await this.updateCardProgress(this.currentCard.id, difficulty);
            this.currentCardIndex++;
            
            // Show next card or completion
            setTimeout(() => {
                this.displayCurrentCard();
                this.updateStudyStats();
                document.getElementById('flip-btn').style.display = 'block';
            }, 500);
            
            this.showToast(`${this.getDifficultyText(difficulty)} - 次回: ${this.getNextReviewText(difficulty)}`, 'success');
            
        } catch (error) {
            console.error('Error updating card:', error);
            this.showToast('カードの更新に失敗しました', 'error');
        }
    }

    getDifficultyText(difficulty) {
        const texts = {
            forgot: '忘れた',
            unsure: '曖昧',
            remembered: '覚えた',
            perfect: '完璧'
        };
        return texts[difficulty] || difficulty;
    }

    getNextReviewText(difficulty) {
        const days = this.intervals[difficulty];
        if (days === 1) return '明日';
        return `${days}日後`;
    }

    showStudyCompletion() {
        const questionEl = document.getElementById('card-question');
        const answerEl = document.getElementById('card-answer');
        const flipBtn = document.getElementById('flip-btn');
        const answerButtons = document.getElementById('answer-buttons');

        questionEl.innerHTML = '🎉 今日の学習完了！<br>お疲れ様でした！';
        answerEl.classList.add('hidden');
        flipBtn.disabled = true;
        answerButtons.classList.add('hidden');
        
        this.showStudyCompletionAd();
        this.showToast('今日の学習が完了しました！', 'success');
    }

    showStudyCompletionAd() {
        const adContainer = document.getElementById('study-completion-ad');
        if (adContainer) {
            adContainer.classList.remove('hidden');
            // Trigger AdSense
            if (typeof adsbygoogle !== 'undefined') {
                (adsbygoogle = window.adsbygoogle || []).push({});
            }
        }
    }

    updateStudyStats() {
        const remainingEl = document.getElementById('cards-remaining');
        const streakEl = document.getElementById('study-streak');
        
        if (!remainingEl || !streakEl) {
            console.warn('Study stats elements not found');
            return;
        }
        
        const remaining = Math.max(0, this.todaysCards.length - this.currentCardIndex);
        remainingEl.innerHTML = `残り: <strong>${remaining}</strong>枚`;
        
        // Update streak (mock data for now)
        const streak = this.getStudyStreak();
        streakEl.innerHTML = `連続: <strong>${streak}</strong>日`;
    }

    // Cards Management
    loadCardsPage() {
        this.displayCardsList();
    }

    displayCardsList() {
        const cardsList = document.getElementById('cards-list');
        if (!cardsList) return;

        if (this.allCards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">カードがありません。新しいカードを作成してください。</p>';
            return;
        }

        const cardsHtml = this.allCards.map(card => `
            <div class="card-item" data-card-id="${card.id}">
                <div class="card-content">
                    <h4>${this.escapeHtml(card.question)}</h4>
                    <p>${this.escapeHtml(card.answer)}</p>
                    <div class="card-meta">
                        <span class="card-category">${card.category || 'その他'}</span>
                        <span style="font-size: 0.7rem; color: #999;">
                            復習: ${card.nextReview ? new Date(card.nextReview).toLocaleDateString() : '未設定'}
                        </span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn secondary" onclick="app.editCard('${card.id}')">編集</button>
                    <button class="btn danger" onclick="app.deleteCardConfirm('${card.id}')">削除</button>
                </div>
            </div>
        `).join('');

        cardsList.innerHTML = cardsHtml;
    }

    showAddCardModal() {
        const modal = document.getElementById('add-card-modal');
        modal.classList.remove('hidden');
        document.getElementById('card-question-input').focus();
    }

    hideAddCardModal() {
        const modal = document.getElementById('add-card-modal');
        modal.classList.add('hidden');
        document.getElementById('add-card-form').reset();
    }

    async handleAddCard(event) {
        event.preventDefault();
        
        const question = document.getElementById('card-question-input').value.trim();
        const answer = document.getElementById('card-answer-input').value.trim();
        const category = document.getElementById('card-category-input').value;

        if (!question || !answer) {
            this.showToast('問題と答えを入力してください', 'warning');
            return;
        }

        const newCard = {
            id: this.generateId(),
            question,
            answer,
            category,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            reviewCount: 0,
            nextReview: new Date().toISOString() // Available immediately
        };

        try {
            await this.saveCard(newCard);
            this.allCards.push(newCard);
            this.todaysCards = this.getTodaysCards();
            
            this.hideAddCardModal();
            this.displayCardsList();
            this.showToast('カードが作成されました', 'success');
        } catch (error) {
            console.error('Error saving card:', error);
            this.showToast('カードの保存に失敗しました', 'error');
        }
    }

    async deleteCardConfirm(cardId) {
        if (confirm('このカードを削除しますか？')) {
            try {
                await this.deleteCard(cardId);
                this.allCards = this.allCards.filter(card => card.id !== cardId);
                this.todaysCards = this.getTodaysCards();
                this.displayCardsList();
                this.showToast('カードが削除されました', 'success');
            } catch (error) {
                console.error('Error deleting card:', error);
                this.showToast('カードの削除に失敗しました', 'error');
            }
        }
    }

    filterCards() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        const categoryFilter = document.getElementById('category-filter').value;
        
        let filteredCards = this.allCards;
        
        if (searchTerm) {
            filteredCards = filteredCards.filter(card => 
                card.question.toLowerCase().includes(searchTerm) ||
                card.answer.toLowerCase().includes(searchTerm)
            );
        }
        
        if (categoryFilter) {
            filteredCards = filteredCards.filter(card => card.category === categoryFilter);
        }
        
        // Update display with filtered cards
        this.displayFilteredCards(filteredCards);
    }

    displayFilteredCards(cards) {
        const cardsList = document.getElementById('cards-list');
        if (!cardsList) return;

        if (cards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">該当するカードが見つかりません。</p>';
            return;
        }

        const cardsHtml = cards.map(card => `
            <div class="card-item" data-card-id="${card.id}">
                <div class="card-content">
                    <h4>${this.escapeHtml(card.question)}</h4>
                    <p>${this.escapeHtml(card.answer)}</p>
                    <div class="card-meta">
                        <span class="card-category">${card.category || 'その他'}</span>
                        <span style="font-size: 0.7rem; color: #999;">
                            復習: ${card.nextReview ? new Date(card.nextReview).toLocaleDateString() : '未設定'}
                        </span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn secondary" onclick="app.editCard('${card.id}')">編集</button>
                    <button class="btn danger" onclick="app.deleteCardConfirm('${card.id}')">削除</button>
                </div>
            </div>
        `).join('');

        cardsList.innerHTML = cardsHtml;
    }

    // Dashboard
    async loadDashboard() {
        this.updateDashboardStats();
        this.createCharts();
        this.displayReviewSchedule();
        
        // Show dashboard ad
        setTimeout(() => {
            if (typeof adsbygoogle !== 'undefined') {
                (adsbygoogle = window.adsbygoogle || []).push({});
            }
        }, 1000);
    }

    updateDashboardStats() {
        // Today's cards completed
        const todayCompleted = this.getTodayCompletedCards();
        document.getElementById('today-cards').textContent = todayCompleted;
        
        // Learning streak
        const streak = this.getStudyStreak();
        document.getElementById('learning-streak').textContent = streak;
        
        // Total cards
        document.getElementById('total-cards').textContent = this.allCards.length;
        
        // Accuracy rate
        const accuracy = this.calculateAccuracyRate();
        document.getElementById('accuracy-rate').textContent = accuracy + '%';
    }

    createCharts() {
        this.createProgressChart();
        this.createCategoryChart();
    }

    createProgressChart() {
        const ctx = document.getElementById('progress-chart');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.charts.progress) {
            this.charts.progress.destroy();
        }

        const data = this.getProgressData();
        
        this.charts.progress = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: '学習カード数',
                    data: data.values,
                    borderColor: '#007AFF',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    createCategoryChart() {
        const ctx = document.getElementById('category-chart');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.charts.category) {
            this.charts.category.destroy();
        }

        const data = this.getCategoryData();
        
        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: [
                        '#007AFF',
                        '#34C759',
                        '#FF9500',
                        '#FF3B30',
                        '#AF52DE',
                        '#00C7BE'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Data Management & Backup
    async createSampleCards() {
        const sampleCards = [
            {
                id: this.generateId(),
                question: 'Hello',
                answer: 'こんにちは',
                category: '語学',
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                reviewCount: 0,
                nextReview: new Date().toISOString()
            },
            {
                id: this.generateId(),
                question: 'Thank you',
                answer: 'ありがとう',
                category: '語学',
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                reviewCount: 0,
                nextReview: new Date().toISOString()
            },
            {
                id: this.generateId(),
                question: 'ROI（投資利益率）の計算式は？',
                answer: '(投資で得られた利益 - 投資額) / 投資額 × 100',
                category: '資格',
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                reviewCount: 0,
                nextReview: new Date().toISOString()
            }
        ];

        for (const card of sampleCards) {
            await this.saveCard(card);
        }
    }

    createAutoBackup() {
        // Create backup every 5 minutes
        setInterval(() => {
            this.backupToLocalStorage();
        }, 5 * 60 * 1000);
    }

    backupToLocalStorage(data = null) {
        try {
            if (data) {
                // Backup single item
                const backup = JSON.parse(localStorage.getItem('flashcard_backup') || '[]');
                backup.push({ ...data, timestamp: Date.now() });
                localStorage.setItem('flashcard_backup', JSON.stringify(backup.slice(-100)));
            } else {
                // Full backup
                const fullBackup = {
                    cards: this.allCards,
                    timestamp: Date.now(),
                    version: '1.0.0'
                };
                localStorage.setItem('flashcard_full_backup', JSON.stringify(fullBackup));
            }
        } catch (error) {
            console.error('Backup failed:', error);
        }
    }

    async manualBackup() {
        try {
            const backup = {
                cards: this.allCards,
                statistics: await this.getAllStatistics(),
                settings: await this.getAllSettings(),
                timestamp: Date.now(),
                version: '1.0.0'
            };

            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flashcard_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showToast('バックアップが完了しました', 'success');
        } catch (error) {
            console.error('Manual backup failed:', error);
            this.showToast('バックアップに失敗しました', 'error');
        }
    }

    exportCards() {
        if (this.allCards.length === 0) {
            this.showToast('エクスポートするカードがありません', 'warning');
            return;
        }

        const csv = this.convertToCSV(this.allCards);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flashcards_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('カードをエクスポートしました', 'success');
    }

    convertToCSV(cards) {
        const headers = ['問題', '答え', 'カテゴリ', '作成日', '復習回数', '次回復習日'];
        const rows = cards.map(card => [
            `"${card.question.replace(/"/g, '""')}"`,
            `"${card.answer.replace(/"/g, '""')}"`,
            `"${card.category || ''}"`,
            new Date(card.createdAt).toLocaleDateString(),
            card.reviewCount || 0,
            card.nextReview ? new Date(card.nextReview).toLocaleDateString() : ''
        ]);

        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    async restoreData() {
        try {
            // ファイル選択ダイアログを作成
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.csv';
            
            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    let data;

                    if (file.name.endsWith('.json')) {
                        // JSONファイルの復元
                        data = JSON.parse(text);
                        await this.restoreFromJSON(data);
                    } else if (file.name.endsWith('.csv')) {
                        // CSVファイルの復元
                        data = this.parseCSV(text);
                        await this.restoreFromCSV(data);
                    } else {
                        throw new Error('対応していないファイル形式です');
                    }

                    this.showToast('データの復元が完了しました', 'success');
                    
                    // データ再読み込み
                    await this.loadData();
                    this.updateUI();
                    
                } catch (error) {
                    console.error('Restore error:', error);
                    this.showToast('データの復元に失敗しました: ' + error.message, 'error');
                }
            };

            input.click();
            
        } catch (error) {
            console.error('Restore dialog error:', error);
            this.showToast('ファイル選択に失敗しました', 'error');
        }
    }

    async restoreFromJSON(backupData) {
        // JSONバックアップからの復元
        if (!this.db) {
            throw new Error('データベースが初期化されていません');
        }

        if (backupData.cards && Array.isArray(backupData.cards)) {
            let restoredCount = 0;
            for (const card of backupData.cards) {
                try {
                    // 必須フィールドの検証
                    if (card.id && card.question && card.answer) {
                        await this.saveCard({
                            ...card,
                            lastModified: new Date().toISOString()
                        });
                        restoredCount++;
                    }
                } catch (error) {
                    console.warn('カード復元エラー:', card.id, error);
                }
            }
            
            if (restoredCount > 0) {
                this.showToast(`${restoredCount}枚のカードを復元しました`, 'success');
            }
        }

        // 統計データの復元（もしあれば）
        if (backupData.statistics) {
            // 統計データの復元ロジック（将来実装）
        }

        // 設定の復元（もしあれば）
        if (backupData.settings) {
            // 設定の復元ロジック（将来実装）
        }
    }

    async restoreFromCSV(csvData) {
        // CSVからの復元
        if (!this.db) {
            throw new Error('データベースが初期化されていません');
        }

        let restoredCount = 0;
        for (const row of csvData) {
            try {
                if (row.length >= 2 && row[0] && row[1]) {
                    const card = {
                        id: this.generateId(),
                        question: row[0].replace(/^"|"$/g, '').replace(/""/g, '"'),
                        answer: row[1].replace(/^"|"$/g, '').replace(/""/g, '"'),
                        category: row[2] ? row[2].replace(/^"|"$/g, '') : 'その他',
                        createdAt: new Date().toISOString(),
                        lastModified: new Date().toISOString(),
                        reviewCount: parseInt(row[4]) || 0,
                        nextReview: new Date().toISOString()
                    };

                    await this.saveCard(card);
                    restoredCount++;
                }
            } catch (error) {
                console.warn('CSV行復元エラー:', row, error);
            }
        }
        
        if (restoredCount > 0) {
            this.showToast(`${restoredCount}枚のカードを復元しました`, 'success');
        }
    }

    parseCSV(text) {
        const lines = text.split('\n');
        const data = [];
        
        // ヘッダー行をスキップ
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                // 簡易CSV解析（引用符対応）
                const row = this.parseCSVLine(line);
                data.push(row);
            }
        }
        
        return data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    async importCards() {
        // インポート機能の実装（復元機能と同様）
        await this.restoreData();
    }

    async resetAllData() {
        if (!confirm('本当にすべてのデータを削除しますか？この操作は取り消せません。')) {
            return;
        }

        if (!confirm('最終確認：すべての学習データが完全に削除されます。よろしいですか？')) {
            return;
        }

        try {
            // IndexedDBをクリア
            if (this.db) {
                const transaction = this.db.transaction(['cards'], 'readwrite');
                const store = transaction.objectStore('cards');
                await new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            // ローカルストレージもクリア
            localStorage.removeItem('flashcard_backup');
            localStorage.removeItem('flashcard_full_backup');

            // メモリ上のデータもクリア
            this.allCards = [];
            this.todaysCards = [];
            this.currentCard = null;
            this.currentCardIndex = 0;

            // サンプルカードを再作成
            await this.createSampleCards();
            await this.loadData();
            this.updateUI();

            this.showToast('すべてのデータが削除され、サンプルカードが作成されました', 'success');

        } catch (error) {
            console.error('Reset error:', error);
            this.showToast('データの削除に失敗しました', 'error');
        }
    }

    // Utility Functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    updateUI() {
        // Update all UI elements
        this.loadStudyPage();
    }

    // Mock data functions (replace with real implementations)
    getTodayCompletedCards() {
        // Mock: cards completed today
        return Math.floor(Math.random() * 10);
    }

    getStudyStreak() {
        // Mock: consecutive study days
        return 7;
    }

    calculateAccuracyRate() {
        // Mock: accuracy percentage
        return 85;
    }

    getProgressData() {
        // Mock: last 7 days progress
        const labels = [];
        const values = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }));
            values.push(Math.floor(Math.random() * 20));
        }
        return { labels, values };
    }

    getCategoryData() {
        const categories = {};
        this.allCards.forEach(card => {
            const category = card.category || 'その他';
            categories[category] = (categories[category] || 0) + 1;
        });

        return {
            labels: Object.keys(categories),
            values: Object.values(categories)
        };
    }

    displayReviewSchedule() {
        const scheduleEl = document.getElementById('review-schedule');
        if (!scheduleEl) return;

        // Group cards by review date
        const schedule = {};
        this.allCards.forEach(card => {
            if (card.nextReview) {
                const date = card.nextReview.split('T')[0];
                if (!schedule[date]) schedule[date] = [];
                schedule[date].push(card);
            }
        });

        const scheduleHtml = Object.entries(schedule)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 5) // Show next 5 days
            .map(([date, cards]) => `
                <div class="schedule-item">
                    <span>${new Date(date).toLocaleDateString('ja-JP', { 
                        month: 'numeric', 
                        day: 'numeric',
                        weekday: 'short' 
                    })}</span>
                    <span>${cards.length}枚</span>
                </div>
            `).join('');

        scheduleEl.innerHTML = scheduleHtml || '<p style="text-align: center; color: #666;">予定がありません</p>';
    }

    // Settings
    async loadSettings() {
        // Load settings from IndexedDB and apply them
        const theme = await this.getSetting('theme') || 'light';
        document.body.setAttribute('data-theme', theme);
        
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) themeSelect.value = theme;
    }

    async getSetting(key) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };
            request.onerror = () => resolve(null);
        });
    }

    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async changeTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        await this.saveSetting('theme', theme);
        this.showToast('テーマを変更しました', 'success');
    }

    async updateStatistics(difficulty) {
        // Update daily statistics
        const today = new Date().toISOString().split('T')[0];
        // Implementation would go here
    }

    async getAllStatistics() {
        // Get all statistics from IndexedDB
        return [];
    }

    async getAllSettings() {
        // Get all settings from IndexedDB
        return [];
    }

    // Firebase Authentication & Cloud Sync
    setupFirebaseAuth() {
        try {
            if (typeof window.firebaseAuth === 'undefined') {
                console.warn('Firebase Auth not loaded');
                return;
            }

            // Monitor auth state changes
            window.firebaseAuth.onAuthStateChanged((user) => {
                this.currentUser = user;
                this.updateAuthUI();
                
                if (user) {
                    this.showToast(`ログイン成功: ${user.email}`, 'success');
                    if (this.isAutoSyncEnabled) {
                        this.syncFromCloud().catch(error => {
                            console.error('Auto sync failed:', error);
                        });
                    }
                } else {
                    this.showToast('ログアウトしました', 'info');
                }
            });
        } catch (error) {
            console.error('Firebase Auth setup error:', error);
        }
    }

    updateAuthUI() {
        const loginForm = document.getElementById('login-form');
        const syncStatus = document.getElementById('sync-status');
        const userEmail = document.getElementById('user-email');
        const autoSyncToggle = document.getElementById('auto-sync-toggle');

        // DOM要素の存在チェック
        if (!loginForm || !syncStatus) {
            console.warn('Auth UI elements not found');
            return;
        }

        if (this.currentUser) {
            // ログイン状態：ログインフォームは残し、ログイン状態も表示
            loginForm.style.opacity = '0.5';  // 薄く表示
            loginForm.style.pointerEvents = 'none';  // クリック無効
            syncStatus.classList.remove('hidden');
            
            if (userEmail) {
                userEmail.textContent = this.currentUser.email;
            }
            
            if (autoSyncToggle && this.isAutoSyncEnabled) {
                autoSyncToggle.textContent = '自動同期: ON';
                autoSyncToggle.classList.remove('secondary');
                autoSyncToggle.classList.add('primary');
            }
        } else {
            // 未ログイン状態：フォームを通常表示
            loginForm.style.opacity = '1';
            loginForm.style.pointerEvents = 'auto';
            syncStatus.classList.add('hidden');
        }
    }

    async handleLogin() {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;

        if (!email || !password) {
            this.showToast('メールアドレスとパスワードを入力してください', 'warning');
            return;
        }

        try {
            await window.firebaseAuth.signInWithEmailAndPassword(email, password);
            this.clearAuthInputs();
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('ログインに失敗しました: ' + error.message, 'error');
        }
    }

    async handleSignup() {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;

        if (!email || !password) {
            this.showToast('メールアドレスとパスワードを入力してください', 'warning');
            return;
        }

        if (password.length < 6) {
            this.showToast('パスワードは6文字以上で入力してください', 'warning');
            return;
        }

        try {
            await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
            this.clearAuthInputs();
            this.showToast('アカウントが作成されました', 'success');
        } catch (error) {
            console.error('Signup error:', error);
            this.showToast('アカウント作成に失敗しました: ' + error.message, 'error');
        }
    }

    async handleLogout() {
        try {
            await window.firebaseAuth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('ログアウトに失敗しました', 'error');
        }
    }

    clearAuthInputs() {
        document.getElementById('email-input').value = '';
        document.getElementById('password-input').value = '';
    }

    async syncNow() {
        if (!this.currentUser) {
            this.showToast('ログインが必要です', 'warning');
            return;
        }

        if (this.syncInProgress) {
            this.showToast('同期中です...', 'info');
            return;
        }

        try {
            this.syncInProgress = true;
            this.updateSyncIndicator('syncing');
            
            await this.syncToCloud();
            await this.syncFromCloud();
            
            this.lastSyncTime = new Date();
            this.updateLastSyncDisplay();
            this.updateSyncIndicator('synced');
            this.showToast('同期が完了しました', 'success');
        } catch (error) {
            console.error('Sync error:', error);
            this.updateSyncIndicator('error');
            this.showToast('同期に失敗しました', 'error');
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncToCloud() {
        if (!this.currentUser) return;

        const userData = {
            cards: this.allCards,
            statistics: await this.getAllStatistics(),
            settings: await this.getAllSettings(),
            lastModified: new Date().toISOString(),
            version: '1.0.0'
        };

        await window.firebaseDB
            .collection('users')
            .doc(this.currentUser.uid)
            .set(userData, { merge: true });
    }

    async syncFromCloud() {
        if (!this.currentUser) return;

        const doc = await window.firebaseDB
            .collection('users')
            .doc(this.currentUser.uid)
            .get();

        if (doc.exists) {
            const cloudData = doc.data();
            
            // Merge cloud data with local data
            if (cloudData.cards && cloudData.cards.length > 0) {
                const mergedCards = this.mergeCards(this.allCards, cloudData.cards);
                
                // Save merged data to IndexedDB
                for (const card of mergedCards) {
                    await this.saveCard(card);
                }
                
                this.allCards = mergedCards;
                this.todaysCards = this.getTodaysCards();
                this.updateUI();
            }
        }
    }

    mergeCards(localCards, cloudCards) {
        const merged = new Map();
        
        // Add local cards
        localCards.forEach(card => {
            merged.set(card.id, card);
        });
        
        // Merge with cloud cards (cloud wins if newer)
        cloudCards.forEach(cloudCard => {
            const localCard = merged.get(cloudCard.id);
            if (!localCard || new Date(cloudCard.lastModified) > new Date(localCard.lastModified)) {
                merged.set(cloudCard.id, cloudCard);
            }
        });
        
        return Array.from(merged.values());
    }

    toggleAutoSync() {
        this.isAutoSyncEnabled = !this.isAutoSyncEnabled;
        const toggle = document.getElementById('auto-sync-toggle');
        
        if (this.isAutoSyncEnabled) {
            toggle.textContent = '自動同期: ON';
            toggle.classList.remove('secondary');
            toggle.classList.add('primary');
            this.setupAutoSync();
        } else {
            toggle.textContent = '自動同期: OFF';
            toggle.classList.remove('primary');
            toggle.classList.add('secondary');
            this.clearAutoSync();
        }
        
        this.saveSetting('autoSync', this.isAutoSyncEnabled);
    }

    setupAutoSync() {
        // Sync every 5 minutes
        this.autoSyncInterval = setInterval(() => {
            if (this.currentUser && !this.syncInProgress) {
                this.syncNow();
            }
        }, 5 * 60 * 1000);
    }

    clearAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }

    updateSyncIndicator(status) {
        const lastSyncElement = document.getElementById('last-sync');
        const indicator = `<span class="sync-indicator ${status}"></span>`;
        
        switch (status) {
            case 'syncing':
                lastSyncElement.innerHTML = indicator + '同期中...';
                break;
            case 'synced':
                lastSyncElement.innerHTML = indicator + '同期完了: ' + new Date().toLocaleTimeString();
                break;
            case 'error':
                lastSyncElement.innerHTML = indicator + '同期エラー';
                break;
        }
    }

    updateLastSyncDisplay() {
        if (this.lastSyncTime) {
            const timeStr = this.lastSyncTime.toLocaleString();
            document.getElementById('last-sync').innerHTML = 
                '<span class="sync-indicator synced"></span>最終同期: ' + timeStr;
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FlashcardApp();
});

// Global error handler
window.addEventListener('error', (error) => {
    console.error('Global error:', error);
    console.error('Error details:', {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        stack: error.error?.stack
    });
    
    if (window.app) {
        window.app.showToast('予期しないエラーが発生しました', 'error');
    }
});

// Promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (window.app) {
        window.app.showToast('通信エラーが発生しました', 'error');
    }
});