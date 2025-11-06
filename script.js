// グローバル変数
let nutritionData = [];
let selectedDishes = {}; // { category: ['dish1', 'dish2', ...] }
let currentCategory = null;
let customDishes = {};
let discontinuedDishes = {}; // { category: ['dish1', 'dish2', ...] }

// LocalStorage キー
const STORAGE_KEY_CUSTOM = 'customDishes';
const STORAGE_KEY_SELECTED = 'selectedDishes';
const BACKUP_KEY = 'nutritionBackup';
const BACKUP_TIMESTAMP_KEY = 'nutritionBackupTime';
const STORAGE_KEY_DISCONTINUED = 'discontinuedDishes';

// Google Apps Script のURL
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxLkkrgBEW7qTv_86lqri2OfqLbAwclDS_KjCLMFdlpUifkMB3V53xwrE5YvulJ3dDDGQ/exec';

// ==================== CSV パース ====================

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
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

function sanitizeFilename(filename) {
    return filename
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
}

async function loadCSV() {
    try {
        const response = await fetch('menu.csv');
        const csvText = await response.text();
        parseCSV(csvText);
    } catch (error) {
        console.error('CSVの読み込みに失敗しました:', error);
    }
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        if (values.length >= 5) {
            const protein = values[2] ? parseFloat(values[2]) : 0;
            const fat = values[3] ? parseFloat(values[3]) : 0;
            const carbs = values[4] ? parseFloat(values[4]) : 0;
            const calories = values[5] ? parseFloat(values[5]) : 0;
            const imagePath = values[6] ? values[6].trim() : '';
            
            nutritionData.push({
                category: values[0].trim(),
                dish: values[1].trim(),
                protein: protein,
                fat: fat,
                carbs: carbs,
                calories: calories,
                image: imagePath
            });
        }
    }
}

// ==================== Google Sheets から読み込み ====================

async function loadFromGoogleSheets() {
    try {
        console.log('Loading data from Google Sheets...');
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            nutritionData = data;
            console.log('Data loaded from Google Sheets:', data.length, 'items');
        } else {
            console.warn('No data from Google Sheets, using CSV fallback');
            await loadCSV();
        }
    } catch (error) {
        console.warn('Google Sheetsからの読み込みに失敗。CSVから読み込みます:', error);
        await loadCSV();
    }
}

// ==================== 初期化 ====================

function init() {
    const container = document.getElementById('categories-container');
    
    const categories = [...new Set(nutritionData.map(item => item.category))];
    
    categories.forEach(category => {
        const dishes = nutritionData.filter(item => item.category === category);
        
        if (dishes.length === 0) return;
        
        if (!selectedDishes[category]) {
            selectedDishes[category] = [];
        }
        
        if (!customDishes[category]) {
            customDishes[category] = [];
        }
        
        if (!discontinuedDishes[category]) {
            discontinuedDishes[category] = [];
        }
        
        const categoryRow = document.createElement('div');
        categoryRow.className = 'category-row';
        categoryRow.setAttribute('data-category', category);
        
        const categoryLabel = document.createElement('div');
        categoryLabel.className = 'category-label';
        categoryLabel.textContent = category;
        
        const dishesRow = document.createElement('div');
        dishesRow.className = 'dishes-row';
        
        // 「クリア」ボタン
        const clearButton = document.createElement('button');
        clearButton.className = 'dish-button clear-button';
        clearButton.textContent = 'クリア';
        clearButton.title = 'すべての選択を解除';
        
        clearButton.addEventListener('click', () => {
            selectedDishes[category] = [];
            dishesRow.querySelectorAll('.dish-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            clearButton.classList.remove('selected');
            saveToLocalStorage();
            updateNutrition();
        });
        dishesRow.appendChild(clearButton);

        // CSV料理ボタン
        dishes.forEach(dish => {
            const button = createDishButton(dish, category, dishesRow);
            
            if (selectedDishes[category].includes(dish.dish)) {
                button.classList.add('selected');
            }
            
            dishesRow.appendChild(button);
        });

        // 「追加」ボタン
        const addButton = document.createElement('button');
        addButton.className = 'add-button';
        addButton.innerHTML = '➕ 追加';
        addButton.addEventListener('click', () => {
            currentCategory = category;
            openAddDishModal(category);
        });
        dishesRow.appendChild(addButton);
        
        categoryRow.appendChild(categoryLabel);
        categoryRow.appendChild(dishesRow);
        container.appendChild(categoryRow);
    });
    
    setupModal();
}

function createDishButton(dish, category, dishesRow) {
    const button = document.createElement('button');
    button.className = 'dish-button';
    button.setAttribute('data-dish-name', dish.dish);
    button.setAttribute('data-is-custom', 'false');
    
    // このボタンに対応するカスタム料理かどうかをチェック
    const isCustom = customDishes[category] && customDishes[category].some(d => d.dish === dish.dish);
    if (isCustom) {
        button.setAttribute('data-is-custom', 'true');
    }
    
    const img = document.createElement('img');
    img.className = 'dish-button-img';
    
    if (dish.image) {
        img.src = dish.image;
    } else {
        img.src = `images/${sanitizeFilename(dish.dish)}.jpg`;
    }
    
    img.alt = dish.dish;
    img.onerror = function() {
        img.style.display = 'none';
        const emoji = document.createElement('span');
        emoji.textContent = '🍽️';
        emoji.style.fontSize = '28px';
        button.insertBefore(emoji, button.firstChild);
    };
    
    const label = document.createElement('div');
    label.className = 'dish-button-label';
    label.textContent = dish.dish;
    
    button.appendChild(img);
    button.appendChild(label);
    
    // ボタンアクション用コンテナ
    const actionContainer = document.createElement('div');
    actionContainer.className = 'button-actions';
    
    // 販売中止ボタン
    const discontinueBtn = document.createElement('button');
    discontinueBtn.className = 'status-button discontinue-button';
    discontinueBtn.textContent = '✕';
    discontinueBtn.title = '販売中止';
    discontinueBtn.type = 'button';
    
    const isDiscontinued = discontinuedDishes[category] && discontinuedDishes[category].includes(dish.dish);
    if (isDiscontinued) {
        discontinueBtn.classList.add('active');
    }
    
    discontinueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiscontinued(category, dish);
    });
    actionContainer.appendChild(discontinueBtn);
    
    // カスタム料理の場合は削除ボタンを追加
    if (isCustom) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'status-button delete-button';
        deleteBtn.textContent = '✕';
        deleteBtn.title = '削除';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDish(category, dish);
        });
        actionContainer.appendChild(deleteBtn);
    }
    
    button.appendChild(actionContainer);
    
    // 販売中止時の表示
    if (isDiscontinued) {
        button.classList.add('discontinued');
    }
    
    // 複数選択対応
    button.addEventListener('click', () => {
        // 販売中止の場合はクリック不可
        if (discontinuedDishes[category] && discontinuedDishes[category].includes(dish.dish)) {
            return;
        }
        
        const isSelected = button.classList.contains('selected');
        
        if (isSelected) {
            // 選択を解除
            button.classList.remove('selected');
            selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
        } else {
            // 選択を追加
            button.classList.add('selected');
            if (!selectedDishes[category].includes(dish.dish)) {
                selectedDishes[category].push(dish.dish);
            }
        }
        
        saveToLocalStorage();
        updateNutrition();
    });
    
    return button;
}

// ==================== モーダル管理 ====================

function openAddDishModal(category) {
    const modal = document.getElementById('addDishModal');
    const modalTitle = document.getElementById('modalTitle');
    
    modalTitle.textContent = `${category} を追加`;
    resetFormFields();
    modal.classList.add('show');
}

function resetFormFields() {
    document.getElementById('dishName').value = '';
    document.getElementById('calories').value = '';
    document.getElementById('protein').value = '';
    document.getElementById('fat').value = '';
    document.getElementById('carbs').value = '';
    document.getElementById('imageInput').value = '';
    
    const imagePreview = document.getElementById('imagePreview');
    imagePreview.classList.add('empty');
    imagePreview.innerHTML = '<span>ここに画像が表示されます</span>';
}

function setupModal() {
    const modal = document.getElementById('addDishModal');
    const modalClose = document.getElementById('modalClose');
    const modalCancel = document.getElementById('modalCancel');
    const modalSubmit = document.getElementById('modalSubmit');
    const imageInput = document.getElementById('imageInput');
    
    // 画像アップロード
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imagePreview = document.getElementById('imagePreview');
                imagePreview.classList.remove('empty');
                imagePreview.innerHTML = `<img src="${event.target.result}" />`;
                imageInput.dataset.base64 = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // 料理追加
    modalSubmit.addEventListener('click', addNewDish);
    
    // モーダル閉じる
    modalClose.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modalCancel.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // 復元モーダル
    setupRestoreModal();
}

function addNewDish() {
    const dishName = document.getElementById('dishName').value.trim();
    const calories = parseFloat(document.getElementById('calories').value) || 0;
    const protein = parseFloat(document.getElementById('protein').value) || 0;
    const fat = parseFloat(document.getElementById('fat').value) || 0;
    const carbs = parseFloat(document.getElementById('carbs').value) || 0;
    const imageInput = document.getElementById('imageInput');
    const imageBase64 = imageInput.dataset.base64 || '';
    
    if (!dishName || calories === 0) {
        alert('料理名とカロリーは必須です');
        return;
    }
    
    const newDish = {
        category: currentCategory,
        dish: dishName,
        protein: protein,
        fat: fat,
        carbs: carbs,
        calories: calories,
        image: imageBase64
    };
    
    // データに追加
    nutritionData.push(newDish);
    customDishes[currentCategory].push(newDish);
    
    // Google Sheetsに追加
    saveToGoogleSheets(newDish);
    
    // UIに追加
    const categoryRow = document.querySelector(`[data-category="${currentCategory}"]`);
    const dishesRow = categoryRow.querySelector('.dishes-row');
    const addButton = dishesRow.querySelector('.add-button');
    
    const button = createDishButton(newDish, currentCategory, dishesRow);
    dishesRow.insertBefore(button, addButton);
    
    saveToLocalStorage();
    
    const modal = document.getElementById('addDishModal');
    modal.classList.remove('show');
}

async function saveToGoogleSheets(dish) {
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(dish)
        });
        const result = await response.json();
        console.log('Dish saved to Google Sheets:', result);
    } catch (error) {
        console.error('Google Sheetsへの保存に失敗しました:', error);
        alert('Google Sheetsへの保存に失敗しました（ローカルには保存されています）');
    }
}

function setupRestoreModal() {
    const restoreYes = document.getElementById('restoreYes');
    const restoreCancel = document.getElementById('restoreCancel');
    
    restoreYes.addEventListener('click', () => {
        restoreFromBackup();
    });
    
    restoreCancel.addEventListener('click', () => {
        const modal = document.getElementById('restoreModal');
        modal.classList.remove('show');
    });
}

// 料理削除
function deleteDish(category, dish) {
    if (!confirm(`「${dish.dish}」を削除しますか？`)) {
        return;
    }
    
    // customDishesから削除
    if (customDishes[category]) {
        customDishes[category] = customDishes[category].filter(d => d.dish !== dish.dish);
    }
    
    // nutritionDataから削除（カスタム料理のみ）
    nutritionData = nutritionData.filter(d => !(d.dish === dish.dish && customDishes[category].length === 0));
    
    // 選択されていた場合は選択解除
    selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
    
    // 販売中止設定から削除
    if (discontinuedDishes[category]) {
        discontinuedDishes[category] = discontinuedDishes[category].filter(d => d !== dish.dish);
    }
    
    // Google Sheetsから削除
    deleteFromGoogleSheets(dish);
    
    saveToLocalStorage();
    
    // UI更新（ページリロードで反映）
    location.reload();
}

async function deleteFromGoogleSheets(dish) {
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'delete',
                dish: dish.dish,
                category: dish.category
            })
        });
        const result = await response.json();
        console.log('Dish deleted from Google Sheets:', result);
    } catch (error) {
        console.error('Google Sheetsからの削除に失敗しました:', error);
    }
}

// 販売中止を切り替え
function toggleDiscontinued(category, dish) {
    if (!discontinuedDishes[category]) {
        discontinuedDishes[category] = [];
    }
    
    const isDiscontinued = discontinuedDishes[category].includes(dish.dish);
    
    if (isDiscontinued) {
        // 販売中止を解除
        discontinuedDishes[category] = discontinuedDishes[category].filter(d => d !== dish.dish);
    } else {
        // 販売中止に設定
        discontinuedDishes[category].push(dish.dish);
        // 選択されている場合は選択解除
        selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
    }
    
    saveToLocalStorage();
    location.reload();
}

// ==================== シェア機能 ====================

function setupShareButton() {
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    
    console.log('setupShareButton called');
    console.log('shareBtn:', shareBtn);
    console.log('shareModal:', shareModal);
    
    if (!shareBtn) {
        console.error('Share button not found - retrying in 500ms');
        setTimeout(() => setupShareButton(), 500);
        return;
    }
    
    if (!shareModal) {
        console.error('Share modal not found');
        return;
    }
    
    console.log('Adding click listener to share button');
    
    shareBtn.onclick = function() {
        console.log('Share button clicked via onclick');
        generateShareURL();
        shareModal.classList.add('show');
    };
    
    const shareClose = document.getElementById('shareClose');
    const shareCancel = document.getElementById('shareCancel');
    const copyBtn = document.getElementById('copyBtn');
    
    if (shareClose) {
        shareClose.onclick = function() {
            shareModal.classList.remove('show');
        };
    }
    
    if (shareCancel) {
        shareCancel.onclick = function() {
            shareModal.classList.remove('show');
        };
    }
    
    if (copyBtn) {
        copyBtn.onclick = function() {
            const shareUrl = document.getElementById('shareUrl');
            shareUrl.select();
            document.execCommand('copy');
            
            copyBtn.textContent = '✓ コピー完了';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = '📋 コピー';
                copyBtn.classList.remove('copied');
            }, 2000);
        };
    }
}

function generateShareURL() {
    try {
        // カスタム料理と選択状態をBase64エンコード
        const data = {
            customDishes: customDishes,
            selectedDishes: selectedDishes
        };
        
        const jsonString = JSON.stringify(data);
        const encoded = btoa(unescape(encodeURIComponent(jsonString)));
        
        const baseURL = window.location.href.split('?')[0].split('#')[0];
        const shareURL = `${baseURL}?data=${encoded}`;
        
        console.log('Generated share URL:', shareURL);
        
        // URLを入力欄に表示
        const shareUrlInput = document.getElementById('shareUrl');
        if (shareUrlInput) {
            shareUrlInput.value = shareURL;
        }
    } catch (e) {
        console.error('Share URL generation error:', e);
        alert('URLの生成に失敗しました');
    }
}

function generateQRCode(url) {
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    
    try {
        // QRCode.jsを使用（グローバル変数として存在）
        new QRCode(qrContainer, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#333',
            colorLight: '#fff',
            correctLevel: QRCode.CorrectLevel.H
        });
        console.log('QR Code generated successfully');
    } catch (e) {
        console.error('QR Code generation error:', e);
        // QRコード生成に失敗した場合はURLのみ表示
        qrContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 12px;">QRコード生成に失敗しました</div>';
    }
}

function checkAndRestoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    
    if (data) {
        try {
            const decoded = JSON.parse(decodeURIComponent(escape(atob(data))));
            
            if (decoded.customDishes && decoded.selectedDishes) {
                if (confirm('シェアされたデータを復元しますか？')) {
                    customDishes = decoded.customDishes;
                    selectedDishes = decoded.selectedDishes;
                    saveToLocalStorage();
                    
                    // URLを清潔にする
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    location.reload();
                }
            }
        } catch (e) {
            console.error('データ復元エラー:', e);
        }
    }
}

// ==================== LocalStorage 管理 ====================

function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customDishes));
    localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(selectedDishes));
    localStorage.setItem(STORAGE_KEY_DISCONTINUED, JSON.stringify(discontinuedDishes));
    
    // SessionStorage バックアップ
    sessionStorage.setItem(BACKUP_KEY, JSON.stringify(customDishes));
    sessionStorage.setItem(STORAGE_KEY_SELECTED + '_backup', JSON.stringify(selectedDishes));
    sessionStorage.setItem(STORAGE_KEY_DISCONTINUED, JSON.stringify(discontinuedDishes));
    sessionStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
}

function checkForCacheClean() {
    const currentCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
    const backupCustom = sessionStorage.getItem(BACKUP_KEY);
    
    // LocalStorageが空で、SessionStorageに保存されている場合
    if (!currentCustom && backupCustom) {
        const backupData = JSON.parse(backupCustom);
        
        // 追加されたデータがある場合のみ復元を提案
        if (Object.values(backupData).some(arr => arr.length > 0)) {
            const modal = document.getElementById('restoreModal');
            modal.classList.add('show');
        }
    }
}

function restoreFromBackup() {
    const backupCustom = sessionStorage.getItem(BACKUP_KEY);
    const backupSelected = sessionStorage.getItem(STORAGE_KEY_SELECTED + '_backup');
    
    if (backupCustom) {
        localStorage.setItem(STORAGE_KEY_CUSTOM, backupCustom);
    }
    if (backupSelected) {
        localStorage.setItem(STORAGE_KEY_SELECTED, backupSelected);
    }
    
    const modal = document.getElementById('restoreModal');
    modal.classList.remove('show');
    location.reload();
}

function loadFromLocalStorage() {
    const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
    const savedSelected = localStorage.getItem(STORAGE_KEY_SELECTED);
    const savedDiscontinued = localStorage.getItem(STORAGE_KEY_DISCONTINUED);
    
    // カスタム料理をデータに追加
    if (savedCustom) {
        try {
            const parsedCustom = JSON.parse(savedCustom);
            customDishes = parsedCustom;
            
            Object.entries(parsedCustom).forEach(([category, dishes]) => {
                if (Array.isArray(dishes)) {
                    dishes.forEach(dish => {
                        nutritionData.push({
                            category: dish.category,
                            dish: dish.dish,
                            protein: dish.protein,
                            fat: dish.fat,
                            carbs: dish.carbs,
                            calories: dish.calories,
                            image: dish.image
                        });
                    });
                }
            });
        } catch (e) {
            console.error('カスタム料理の読み込みエラー:', e);
        }
    }
    
    // 選択状態を復元（UIはinitの後に）
    if (savedSelected) {
        try {
            selectedDishes = JSON.parse(savedSelected);
            // 配列でない場合は配列に変換
            Object.keys(selectedDishes).forEach(category => {
                if (!Array.isArray(selectedDishes[category])) {
                    selectedDishes[category] = selectedDishes[category] ? [selectedDishes[category]] : [];
                }
            });
        } catch (e) {
            console.error('選択状態の読み込みエラー:', e);
        }
    }
    
    // 販売中止設定を復元
    if (savedDiscontinued) {
        try {
            discontinuedDishes = JSON.parse(savedDiscontinued);
            // 配列でない場合は配列に変換
            Object.keys(discontinuedDishes).forEach(category => {
                if (!Array.isArray(discontinuedDishes[category])) {
                    discontinuedDishes[category] = [];
                }
            });
        } catch (e) {
            console.error('販売中止設定の読み込みエラー:', e);
        }
    }
}

function restoreUISelection() {
    Object.entries(selectedDishes).forEach(([category, dishNames]) => {
        const categoryRow = document.querySelector(`[data-category="${category}"]`);
        if (!categoryRow) return;
        
        const dishesRow = categoryRow.querySelector('.dishes-row');
        const allButtons = dishesRow.querySelectorAll('.dish-button');
        
        allButtons.forEach(btn => {
            const label = btn.querySelector('.dish-button-label');
            if (label) {
                const dishName = label.textContent;
                if (dishNames.includes(dishName)) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            }
        });
    });
}

// ==================== 栄養情報計算 ====================

function updateNutrition() {
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;
    let totalCalories = 0;
    
    Object.entries(selectedDishes).forEach(([category, dishNames]) => {
        if (!Array.isArray(dishNames)) return;
        
        dishNames.forEach(dishName => {
            const data = nutritionData.find(
                item => item.category === category && item.dish === dishName
            );
            
            if (data) {
                totalProtein += data.protein;
                totalFat += data.fat;
                totalCarbs += data.carbs;
                totalCalories += data.calories;
            }
        });
    });
    
    updateNutritionDisplay(totalProtein, totalFat, totalCarbs, totalCalories);
    updatePFCChart(totalProtein, totalFat, totalCarbs);
}

function updateNutritionDisplay(protein, fat, carbs, calories) {
    document.getElementById('total-calories').textContent = calories.toFixed(1);
    document.getElementById('total-protein').textContent = protein.toFixed(2);
    document.getElementById('total-fat').textContent = fat.toFixed(2);
    document.getElementById('total-carbs').textContent = carbs.toFixed(2);
}

function updatePFCChart(protein, fat, carbs) {
    const proteinKcal = protein * 4;
    const fatKcal = fat * 9;
    const carbsKcal = carbs * 4;
    const totalPfcKcal = proteinKcal + fatKcal + carbsKcal;
    
    let proteinPercent = 0;
    let fatPercent = 0;
    let carbsPercent = 0;
    
    if (totalPfcKcal > 0) {
        proteinPercent = (proteinKcal / totalPfcKcal) * 100;
        fatPercent = (fatKcal / totalPfcKcal) * 100;
        carbsPercent = (carbsKcal / totalPfcKcal) * 100;
    }
    
    document.getElementById('protein-segment').style.width = proteinPercent + '%';
    document.getElementById('fat-segment').style.width = fatPercent + '%';
    document.getElementById('carbs-segment').style.width = carbsPercent + '%';
    
    updatePfcLabel('protein-percent', proteinPercent);
    updatePfcLabel('fat-percent', fatPercent);
    updatePfcLabel('carbs-percent', carbsPercent);
    
    document.getElementById('protein-kcal').textContent = proteinKcal.toFixed(1);
    document.getElementById('fat-kcal').textContent = fatKcal.toFixed(1);
    document.getElementById('carbs-kcal').textContent = carbsKcal.toFixed(1);
    
    document.getElementById('protein-percent-detail').textContent = proteinPercent.toFixed(1) + '%';
    document.getElementById('fat-percent-detail').textContent = fatPercent.toFixed(1) + '%';
    document.getElementById('carbs-percent-detail').textContent = carbsPercent.toFixed(1) + '%';
}

function updatePfcLabel(elementId, percent) {
    const element = document.getElementById(elementId);
    if (percent > 8) {
        element.textContent = percent.toFixed(0) + '%';
        element.style.display = 'inline';
    } else {
        element.style.display = 'none';
    }
}

// ==================== ページロード ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Page load started');
    
    // Google Sheetsから読み込み
    await loadFromGoogleSheets();
    
    loadFromLocalStorage();
    checkForCacheClean();
    init();
    restoreUISelection();
    updateNutrition();
    checkAndRestoreFromURL();
});