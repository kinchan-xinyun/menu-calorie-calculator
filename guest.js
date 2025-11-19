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

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDLT6aZmgZrp7rN3xQV8K0h7V0c9gj1h1M",
    authDomain: "menu-calorie-calculator-6934f.firebaseapp.com",
    projectId: "menu-calorie-calculator-6934f",
    storageBucket: "menu-calorie-calculator-6934f.firebasestorage.app",
    messagingSenderId: "428776906549",
    appId: "1:428776906549:web:5a5f0e4c3e8e8e8e8e8e8e"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// カテゴリ名のマッピング（日本語 → 英語）
const categoryNameMap = {
    '主食': { en: 'RICE/SALAD', ja: '主食' },
    '主菜': { en: 'MAIN', ja: '主菜' },
    '副菜': { en: 'SIDE', ja: '副菜' },
    'ドレッシング': { en: 'DRESSING', ja: 'ドレッシング' },
    'その他': { en: 'EXTRAS', ja: 'その他' },
    'SOUP': { en: 'SOUP', ja: 'スープ' },
    'DRINK': { en: 'DRINK', ja: 'ドリンク' },
    // 旧カテゴリ名（互換性のため）
    'ごはん': { en: 'RICE', ja: 'ごはん' },
    'サラダ': { en: 'SALAD', ja: 'サラダ' },
    'メイン': { en: 'MAIN', ja: 'メイン' },
    'サイド': { en: 'SIDE', ja: 'サイド' },
    'デザート': { en: 'DESSERT', ja: 'デザート' },
    '飲み物': { en: 'DRINK', ja: '飲み物' }
};

// カテゴリーの順序（メイン画面とナビゲーションの順序）
const categoryOrder = ['主食', 'ドレッシング', '副菜', '主菜', 'SOUP', 'DRINK', 'その他'];

// フロー図の順序（元の順序を維持）
const categoryFlowOrder = ['主食', '副菜', '主菜', 'SOUP', 'DRINK'];

// カテゴリ名を取得（マッピングがない場合は元の名前を使用）
function getCategoryNames(category) {
    if (categoryNameMap[category]) {
        return categoryNameMap[category];
    }
    // マッピングがない場合は、カテゴリ名を大文字にして英語として使用
    return { en: category.toUpperCase(), ja: category };
}

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

// ==================== Firestore から読み込み ====================
async function loadFromFirestore() {
    try {
        console.log('Loading data from Firestore...');
        
        const snapshot = await db.collection('menuItems').get();
        
        if (!snapshot.empty) {
            nutritionData = [];
            discontinuedDishes = {}; 
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                nutritionData.push({
                    id: doc.id,
                    category: data.category,
                    dish: data.dishName || data.dish,  // Firestoreのフィールド名に対応
                    protein: data.protein,
                    fat: data.fat,
                    carbs: data.carbohydrates || data.carbs,  // Firestoreのフィールド名に対応
                    calories: data.totalCalories || data.calories,  // Firestoreのフィールド名に対応
                    image: data.imageUrl || data.image || '',  // Firestoreのフィールド名に対応
                    status: data.status || '販売中'
                });
                
                // 販売中止の料理を記録
                if (data.status === '販売中止') {
                    if (!discontinuedDishes[data.category]) {
                        discontinuedDishes[data.category] = [];
                    }
                    const dishName = data.dishName || data.dish;
                    if (!discontinuedDishes[data.category].includes(dishName)) {
                        discontinuedDishes[data.category].push(dishName);
                    }
                }
            });
            
            console.log('Data loaded from Firestore:', nutritionData.length, 'items');
        } else {
            console.warn('No data from Firestore, using CSV fallback');
            await loadCSV();
        }
    } catch (error) {
        console.error('Firestoreからの読み込みに失敗。CSVから読み込みます:', error);
        await loadCSV();
    }
}

// **この関数は現在使用されていませんが、以前のバージョンのために残しておきます。**
// **現在は、より堅牢なupdateDishStatusOnGoogleSheetsが使用されています。**
async function updateDishStatusOnGoogleSheets_OLD(payload) {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error('GAS returned error:', response.status, text);
        throw new Error('Server returned ' + response.status);
    }

    const result = await response.json();
    console.log('GAS response:', result);
    return result;
}

// ==================== 初期化 ====================

function init() {
    const container = document.getElementById('categories-container');
    
    // 全カテゴリーを取得
    const allCategories = [...new Set(nutritionData.map(item => item.category))];
    
    // categoryOrderの順序に従ってカテゴリーを並べ替え
    const orderedCategories = [];
    categoryOrder.forEach(orderCat => {
        if (allCategories.includes(orderCat)) {
            orderedCategories.push(orderCat);
        }
    });
    // categoryOrderにないカテゴリーを最後に追加
    allCategories.forEach(cat => {
        if (!orderedCategories.includes(cat)) {
            orderedCategories.push(cat);
        }
    });
    
    orderedCategories.forEach((category, index) => {
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
        
        const categoryNames = getCategoryNames(category);
        const enLabel = document.createElement('span');
        enLabel.className = 'category-label-en';
        enLabel.textContent = categoryNames.en;
        
        const jaLabel = document.createElement('span');
        jaLabel.className = 'category-label-ja';
        jaLabel.textContent = categoryNames.ja;
        
        categoryLabel.appendChild(enLabel);
        categoryLabel.appendChild(jaLabel);
        
        // ドレッシングカテゴリーに注釈を追加
        if (category === 'ドレッシング') {
            const note = document.createElement('div');
            note.className = 'category-label-note';
            note.textContent = '※ サラダ選択の方のみ選択可能';
            categoryLabel.appendChild(note);
            categoryLabel.classList.add('has-note');
        }
        
        // 「クリア」ボタン
        const clearButton = document.createElement('button');
        clearButton.className = 'clear-button';
        clearButton.textContent = 'クリア';
        clearButton.title = 'すべての選択を解除';
        
        const dishesRow = document.createElement('div');
        dishesRow.className = 'dishes-row';
        
        clearButton.addEventListener('click', () => {
            selectedDishes[category] = [];
            dishesRow.querySelectorAll('.dish-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            clearButton.classList.remove('selected');
            saveToLocalStorage();
            updateNutrition();
        });

        // CSV料理ボタン
        const dishButtons = [];
        dishes.forEach(dish => {
            const button = createDishButton(dish, category, dishesRow);
            
            if (selectedDishes[category].includes(dish.dish)) {
                button.classList.add('selected');
            }
            
            dishesRow.appendChild(button);
            dishButtons.push(button);
        });
        
        // // 「追加」ボタン
        // const addButton = document.createElement('button');
        // addButton.className = 'add-button';
        // addButton.innerHTML = '+ 追加';
        // addButton.addEventListener('click', () => {
        //     currentCategory = category;
        //     openAddDishModal(category);
        // });
        
        categoryRow.appendChild(categoryLabel);
        categoryRow.appendChild(dishesRow);
        categoryRow.appendChild(clearButton);
        // categoryRow.appendChild(addButton);
        container.appendChild(categoryRow);
        
        // 無限ループとインジケーターを設定（categoryRowに追加された後）
        // 注意: setupDishIndicatorはsetupInfiniteScrollの前に呼ぶ（複製が追加される前）
        if (dishButtons.length > 0) {
            setupDishIndicator(dishesRow, dishButtons, category);
        }
        if (dishButtons.length > 1) {
            setupInfiniteScroll(dishesRow, dishButtons, category);
        }
        
        // 中央に来たdishを大きく表示する機能
        setupDishCenterObserver(dishesRow);
        
        // カテゴリ間に矢印を追加（最後のカテゴリ以外）
        if (index < orderedCategories.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'category-arrow';
            container.appendChild(arrow);
        }
    });
    
    setupModal();
    initCategoryNavigation();
    
    // フロー図を初期化
    updateCategoryFlow();
}

function initCategoryNavigation() {
    const navContainer = document.getElementById('categoryNavigation');
    if (!navContainer) return;
    
    // 全カテゴリーを取得
    const allCategories = [...new Set(nutritionData.map(item => item.category))];
    
    // categoryOrderの順序に従ってカテゴリーを並べ替え（メイン画面と同じ順序）
    const orderedCategories = [];
    categoryOrder.forEach(orderCat => {
        if (allCategories.includes(orderCat)) {
            orderedCategories.push(orderCat);
        }
    });
    // categoryOrderにないカテゴリーを最後に追加
    allCategories.forEach(cat => {
        if (!orderedCategories.includes(cat)) {
            orderedCategories.push(cat);
        }
    });
    
    orderedCategories.forEach(category => {
        const categoryNames = getCategoryNames(category);
        const navItem = document.createElement('button');
        navItem.className = 'category-nav-item';
        navItem.textContent = categoryNames.en;
        navItem.setAttribute('data-category', category);
        
        navItem.addEventListener('click', () => {
            // すべてのnav-itemからactiveクラスを削除
            navContainer.querySelectorAll('.category-nav-item').forEach(item => {
                item.classList.remove('active');
            });
            // クリックされたitemにactiveクラスを追加
            navItem.classList.add('active');
            scrollToCategoryDirect(category);
        });
        
        navContainer.appendChild(navItem);
    });
    
    // カテゴリーのスクロール監視を設定
    setupCategoryScrollObserver();
}

function setupCategoryScrollObserver() {
    const categoryRows = document.querySelectorAll('.category-row');
    const navContainer = document.getElementById('categoryNavigation');
    if (!navContainer || categoryRows.length === 0) return;
    
    // 各カテゴリーのナビゲーションアイテムを取得
    const navItems = {};
    navContainer.querySelectorAll('.category-nav-item').forEach(item => {
        const category = item.getAttribute('data-category');
        navItems[category] = item;
    });
    
    const header = document.querySelector('.header');
    const categoryNav = document.getElementById('categoryNavigation');
    const headerHeight = header ? header.offsetHeight : 100;
    const navHeight = categoryNav ? categoryNav.offsetHeight : 0;
    
    function updateActiveCategory() {
        const thresholdTop = headerHeight + navHeight + 100; // ヘッダーとナビゲーションの下
        
        let activeCategory = null;
        let minDistance = Infinity;
        
        // 各カテゴリーをチェックして、画面内に入っている最初のカテゴリーを探す
        categoryRows.forEach(row => {
            const rect = row.getBoundingClientRect();
            const category = row.getAttribute('data-category');
            
            // カテゴリーが画面内に入っているかチェック（上部がthresholdTopより下で、下部が画面内にある）
            if (rect.top <= thresholdTop && rect.bottom > thresholdTop) {
                const distance = Math.abs(rect.top - thresholdTop);
                if (distance < minDistance) {
                    minDistance = distance;
                    activeCategory = category;
                }
            }
        });
        
        // アクティブなカテゴリーのナビゲーションアイテムを更新
        if (activeCategory && navItems[activeCategory]) {
            // すべてのnav-itemからactiveクラスを削除
            navContainer.querySelectorAll('.category-nav-item').forEach(item => {
                item.classList.remove('active');
            });
            // アクティブなカテゴリーのnav-itemにactiveクラスを追加
            navItems[activeCategory].classList.add('active');
        }
    }
    
    // IntersectionObserverのオプション
    const options = {
        root: null,
        rootMargin: `-${headerHeight + navHeight + 100}px 0px -50% 0px`,
        threshold: [0, 0.1, 0.5, 1]
    };
    
    const observer = new IntersectionObserver((entries) => {
        updateActiveCategory();
    }, options);
    
    // 各カテゴリーを監視
    categoryRows.forEach(row => {
        observer.observe(row);
    });
    
    // スクロールイベントでも更新（IntersectionObserverだけでは不十分な場合がある）
    window.addEventListener('scroll', updateActiveCategory, { passive: true });
    
    // 初期状態も更新
    updateActiveCategory();
}

function scrollToCategoryDirect(category) {
    const categoryRow = document.querySelector(`.category-row[data-category="${category}"]`);
    if (categoryRow) {
        const header = document.querySelector('.header');
        const categoryNav = document.getElementById('categoryNavigation');
        const headerHeight = header ? header.offsetHeight : 100;
        const navHeight = categoryNav ? categoryNav.offsetHeight : 0;
        
        const categoryRect = categoryRow.getBoundingClientRect();
        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        const targetScrollY = currentScrollY + categoryRect.top - headerHeight - navHeight - 10;
        
        window.scrollTo({
            top: targetScrollY,
            behavior: 'smooth'
        });
    }
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
    
    if (dish.image && dish.image.startsWith('data:image')) {
        img.src = dish.image; // Base64画像をそのまま使用
    } else if (dish.image) {
        img.src = dish.image; // パスを使用
    } else {
        img.src = `images/${sanitizeFilename(dish.dish)}.png`;
    }
    
    img.alt = dish.dish;
    img.onerror = function() {
        img.style.display = 'none';
        const emoji = document.createElement('span');
        emoji.textContent = '🍽️';
        emoji.style.fontSize = '40px';
        emoji.style.width = '100%';
        emoji.style.height = '80px';
        emoji.style.display = 'flex';
        emoji.style.alignItems = 'center';
        emoji.style.justifyContent = 'center';
        emoji.style.flexShrink = '0';
        emoji.style.borderRadius = '8px';
        button.insertBefore(emoji, button.firstChild);
    };
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'dish-button-label-container';
    
    const label = document.createElement('div');
    label.className = 'dish-button-label';
    label.textContent = dish.dish;
    
    // カロリー情報を表示
    const caloriesInfo = document.createElement('div');
    caloriesInfo.className = 'dish-button-calories';
    const calories = dish.calories || 0;
    const caloriesValue = document.createElement('span');
    caloriesValue.className = 'dish-button-calories-value';
    caloriesValue.textContent = calories.toFixed(1);
    const caloriesUnit = document.createElement('span');
    caloriesUnit.className = 'dish-button-calories-unit';
    caloriesUnit.textContent = 'kcal';
    caloriesInfo.appendChild(caloriesValue);
    caloriesInfo.appendChild(caloriesUnit);
    
    // PFC情報を表示
    const pfcInfo = document.createElement('div');
    pfcInfo.className = 'dish-button-pfc';
    
    const protein = dish.protein || 0;
    const fat = dish.fat || 0;
    const carbs = dish.carbs || 0;
    
    const proteinItem = document.createElement('div');
    proteinItem.className = 'pfc-item protein-item';
    const proteinIcon = document.createElement('span');
    proteinIcon.className = 'pfc-icon';
    proteinIcon.textContent = 'P';
    const proteinValueContainer = document.createElement('span');
    proteinValueContainer.className = 'pfc-value-container';
    const proteinValue = document.createElement('span');
    proteinValue.className = 'pfc-value';
    proteinValue.textContent = protein.toFixed(2);
    const proteinUnit = document.createElement('span');
    proteinUnit.className = 'pfc-unit';
    proteinUnit.textContent = 'g';
    proteinValueContainer.appendChild(proteinValue);
    proteinValueContainer.appendChild(proteinUnit);
    proteinItem.appendChild(proteinIcon);
    proteinItem.appendChild(proteinValueContainer);
    
    const fatItem = document.createElement('div');
    fatItem.className = 'pfc-item fat-item';
    const fatIcon = document.createElement('span');
    fatIcon.className = 'pfc-icon';
    fatIcon.textContent = 'F';
    const fatValueContainer = document.createElement('span');
    fatValueContainer.className = 'pfc-value-container';
    const fatValue = document.createElement('span');
    fatValue.className = 'pfc-value';
    fatValue.textContent = fat.toFixed(2);
    const fatUnit = document.createElement('span');
    fatUnit.className = 'pfc-unit';
    fatUnit.textContent = 'g';
    fatValueContainer.appendChild(fatValue);
    fatValueContainer.appendChild(fatUnit);
    fatItem.appendChild(fatIcon);
    fatItem.appendChild(fatValueContainer);
    
    const carbsItem = document.createElement('div');
    carbsItem.className = 'pfc-item carbs-item';
    const carbsIcon = document.createElement('span');
    carbsIcon.className = 'pfc-icon';
    carbsIcon.textContent = 'C';
    const carbsValueContainer = document.createElement('span');
    carbsValueContainer.className = 'pfc-value-container';
    const carbsValue = document.createElement('span');
    carbsValue.className = 'pfc-value';
    carbsValue.textContent = carbs.toFixed(2);
    const carbsUnit = document.createElement('span');
    carbsUnit.className = 'pfc-unit';
    carbsUnit.textContent = 'g';
    carbsValueContainer.appendChild(carbsValue);
    carbsValueContainer.appendChild(carbsUnit);
    carbsItem.appendChild(carbsIcon);
    carbsItem.appendChild(carbsValueContainer);
    
    pfcInfo.appendChild(proteinItem);
    pfcInfo.appendChild(fatItem);
    pfcInfo.appendChild(carbsItem);
    
    labelContainer.appendChild(label);
    labelContainer.appendChild(caloriesInfo);
    labelContainer.appendChild(pfcInfo);
    
    // 画像を上に、名前とPFCを下に配置
    button.appendChild(img);
    button.appendChild(labelContainer);
    
    // ボタンアクション用コンテナ
    const actionContainer = document.createElement('div');
    actionContainer.className = 'button-actions';
    
    // // 販売中止ボタン
    // const discontinueBtn = document.createElement('button');
    // discontinueBtn.className = 'status-button discontinue-button';
    // discontinueBtn.textContent = '×';
    // discontinueBtn.title = '販売中止';
    // discontinueBtn.type = 'button';
    
    const isDiscontinued = discontinuedDishes[category] && discontinuedDishes[category].includes(dish.dish);
    // if (isDiscontinued) {
    //     discontinueBtn.classList.add('active');
    // }
    
    // discontinueBtn.addEventListener('click', (e) => {
    //     e.stopPropagation();
    //     toggleDiscontinued(category, dish);
    // });
    // actionContainer.appendChild(discontinueBtn);
    
    // // カスタム料理の場合は削除ボタンを追加
    // if (isCustom) {
    //     const deleteBtn = document.createElement('button');
    //     deleteBtn.className = 'status-button delete-button';
    //     deleteBtn.textContent = '✕';
    //     deleteBtn.title = '削除';
    //     deleteBtn.type = 'button';
    //     deleteBtn.addEventListener('click', (e) => {
    //         e.stopPropagation();
    //         deleteDish(category, dish);
    //     });
    //     actionContainer.appendChild(deleteBtn);
    // }
    
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
        
        // カテゴリー別の選択制限（主食のみ1つだけ、副菜と主菜は複数選択可能）
        const isSingleSelectCategory = category === '主食'; // 主食のみ1つだけ
        
        if (isSelected) {
            // 選択を解除
            button.classList.remove('selected');
            const selectedIndicator = button.querySelector('.selected-indicator');
            if (selectedIndicator) {
                selectedIndicator.style.display = 'none';
            }
            selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
        } else {
            // 選択を追加
            // 単一選択カテゴリー（主食のみ）の場合、他の選択を解除
            if (isSingleSelectCategory) {
                // 同じカテゴリー内の他のボタンの選択を解除
                const categoryRow = button.closest('.category-row');
                if (categoryRow) {
                    const dishesRow = categoryRow.querySelector('.dishes-row');
                    if (dishesRow) {
                        dishesRow.querySelectorAll('.dish-button.selected').forEach(btn => {
                            btn.classList.remove('selected');
                            const indicator = btn.querySelector('.selected-indicator');
                            if (indicator) {
                                indicator.style.display = 'none';
                            }
                        });
                    }
                }
                // 選択済みリストをクリア
                selectedDishes[category] = [];
            }
            
            button.classList.add('selected');
            const selectedIndicator = button.querySelector('.selected-indicator');
            if (selectedIndicator) {
                selectedIndicator.style.display = 'block';
            }
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
    
    // Base64データをクリア
    const imageInput = document.getElementById('imageInput');
    delete imageInput.dataset.base64;
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
    
    // Firestoreに追加
    saveToFirestore(newDish);
    
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

async function saveToFirestore(dish) {
    try {
        // ドキュメントIDを生成（カテゴリー_料理名）
        const docId = `${dish.category}_${dish.dish}`;
        
        await db.collection('menuItems').doc(docId).set({
            category: dish.category,
            dishName: dish.dish,  // 内部的には dish.dish だが、Firestoreには dishName として保存
            protein: dish.protein,
            fat: dish.fat,
            carbohydrates: dish.carbs,  // 内部的には carbs だが、Firestoreには carbohydrates として保存
            totalCalories: dish.calories,  // 内部的には calories だが、Firestoreには totalCalories として保存
            imageUrl: dish.image || '',  // 内部的には image だが、Firestoreには imageUrl として保存
            status: '販売中'
        });
        
        console.log('Dish saved to Firestore:', dish);
    } catch (error) {
        console.error('Firestoreへの保存に失敗しました:', error);
        alert('Firestoreへの保存に失敗しました（ローカルには保存されています）: ' + error.message);
    }
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
    // CSVから読み込まれた料理を消さないように、カスタム料理の有無でチェックを強化
    nutritionData = nutritionData.filter(d => {
        const isCustom = customDishes[category].some(cd => cd.dish === d.dish);
        return !(d.dish === dish.dish && d.category === category && isCustom);
    });
    
    // 選択されていた場合は選択解除
    selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
    
    // 販売中止設定から削除
    if (discontinuedDishes[category]) {
        discontinuedDishes[category] = discontinuedDishes[category].filter(d => d !== dish.dish);
    }
    
    // Firestoreから削除
    deleteFromFirestore(dish);
    
    saveToLocalStorage();
    
    // UI更新（ページリロードで反映）
    location.reload();
}

async function deleteFromFirestore(dish) {
    try {
        // ドキュメントIDを生成（カテゴリー_料理名）
        const docId = `${dish.category}_${dish.dish}`;
        
        await db.collection('menuItems').doc(docId).delete();
        
        console.log('Dish deleted from Firestore:', dish);
    } catch (error) {
        console.error('Firestoreからの削除に失敗しました:', error);
        alert('Firestoreからの削除に失敗しました: ' + error.message);
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
        updateDishStatusOnFirestore(dish, false);
    } else {
        // 販売中止に設定
        discontinuedDishes[category].push(dish.dish);
        updateDishStatusOnFirestore(dish, true);
        // 選択されている場合は選択解除
        selectedDishes[category] = selectedDishes[category].filter(d => d !== dish.dish);
    }
    
    saveToLocalStorage();
    // 状態の視覚的な即時フィードバックのため、リロードではなくUI更新
    // location.reload(); // ロードはGoogle Sheetsの反映を待ってから行うのが望ましい
}

// Firestoreの販売状態を更新
async function updateDishStatusOnFirestore(dish, isDiscontinued) {
    try {
        const docId = `${dish.category}_${dish.dish}`;
        const status = isDiscontinued ? '販売中止' : '販売中';
        
        console.log('Updating status in Firestore:', { docId, status });
        
        // まず、ドキュメントが存在するか確認
        const docRef = db.collection('menuItems').doc(docId);
        const docSnapshot = await docRef.get();
        
        if (docSnapshot.exists) {
            // ドキュメントが存在する場合は更新
            await docRef.update({
                status: status
            });
        } else {
            // ドキュメントが存在しない場合は、完全なデータで作成
            await docRef.set({
                category: dish.category,
                dishName: dish.dish,
                protein: dish.protein || 0,
                fat: dish.fat || 0,
                carbohydrates: dish.carbs || 0,
                totalCalories: dish.calories || 0,
                imageUrl: dish.image || '',
                status: status
            });
        }
        
        console.log('Dish status updated in Firestore');
        
        // 成功した場合のみUIをリロードし、変更を反映
        location.reload(); 
        
    } catch (error) {
        console.error('Firestoreへの状態更新に失敗しました:', error);
        alert('Firestoreへの更新に失敗しました: ' + error.message);
        
        // 失敗した場合、ユーザーの意図した状態に戻す
        // (discontinuedDishesのローカル状態をロールバックする処理は複雑なので、今回はalertで対応)
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
                        // データ重複を防ぐため、存在しない場合のみ追加
                        const exists = nutritionData.some(d => d.dish === dish.dish && d.category === dish.category);
                        if (!exists) {
                            nutritionData.push({
                                category: dish.category,
                                dish: dish.dish,
                                protein: dish.protein,
                                fat: dish.fat,
                                carbs: dish.carbs,
                                calories: dish.calories,
                                image: dish.image
                            });
                        }
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
}

function restoreUISelection() {
    Object.entries(selectedDishes).forEach(([category, dishNames]) => {
        const categoryRow = document.querySelector(`.category-row[data-category="${category}"]`);
        if (!categoryRow) return;
        
        const dishesRow = categoryRow.querySelector('.dishes-row');
        if (!dishesRow) return;
        
        const allButtons = dishesRow.querySelectorAll('.dish-button');
        
        allButtons.forEach(btn => {
            const dishName = btn.getAttribute('data-dish-name'); // data属性から取得
            if (dishNames.includes(dishName)) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
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
    updateCategoryFlow();
    updateSelectedDishesImages();
    updateSelectedDishesList();
}

function updateCategoryFlow() {
    const container = document.getElementById('categoryFlow');
    if (!container) {
        console.error('categoryFlow container not found');
        return;
    }
    
    container.innerHTML = '';
    
    // nutritionDataが空の場合でも、カテゴリー順序に基づいてプレースホルダーを表示
    let existingCategories = [];
    if (nutritionData && nutritionData.length > 0) {
        existingCategories = [...new Set(nutritionData.map(item => item.category))];
    }
    
    // カテゴリーが存在しない場合でも、categoryFlowOrderに基づいてプレースホルダーを表示
    if (existingCategories.length === 0) {
        // categoryFlowOrderに基づいてプレースホルダーを表示
        categoryFlowOrder.forEach((category, index) => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-flow-item';
            categoryItem.setAttribute('data-category', category);
            
            const categoryNames = getCategoryNames(category);
            const categoryLabel = document.createElement('div');
            categoryLabel.className = 'category-flow-label';
            categoryLabel.textContent = categoryNames.en;
            categoryItem.appendChild(categoryLabel);
            
            const dishImageContainer = document.createElement('div');
            dishImageContainer.className = 'category-flow-images';
            
            const maxSlots = 1;
            
            for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
                const placeholder = document.createElement('div');
                placeholder.className = 'category-flow-placeholder';
                const placeholderImg = document.createElement('img');
                placeholderImg.alt = '未選択';
                placeholderImg.className = 'category-flow-placeholder-image';
                
                // 画像の読み込みを確実にする
                placeholderImg.onload = function() {
                    this.style.display = 'block';
                };
                placeholderImg.onerror = function() {
                    // 画像が読み込めない場合でも表示を維持
                    this.style.display = 'block';
                    console.warn('Placeholder image failed to load:', this.src);
                };
                
                // 画像のsrcを設定（onload/onerrorの後に設定）
                placeholderImg.src = './images/unselected-dish.png';

                // ロード完了時
                placeholderImg.onload = function() {
                    this.style.display = 'block';
                };
                
                // ロード失敗時
                placeholderImg.onerror = function() {
                    console.warn('Failed to load:', this.src);
                    this.style.display = 'block'; // それでも表示
                };
                
                placeholder.appendChild(placeholderImg);
                dishImageContainer.appendChild(placeholder);
            }
            
            categoryItem.appendChild(dishImageContainer);
            container.appendChild(categoryItem);
            
            if (index < categoryFlowOrder.length - 1) {
                const arrow = document.createElement('div');
                arrow.className = 'category-flow-arrow';
                arrow.textContent = '→';
                container.appendChild(arrow);
            }
        });
        console.log('Category flow initialized with placeholders');
        return;
    }
    
    // 除外するカテゴリー（categoryFlowOrderに含まれるものは表示する）
    const excludedCategories = ['飲み物', 'デザート', 'ドレッシング', 'その他'];
    const isExcludedCategory = (cat) => {
        // categoryFlowOrderに含まれるカテゴリは除外しない（DRINKとSOUPを確実に表示）
        if (categoryFlowOrder.includes(cat)) return false;
        
        if (excludedCategories.includes(cat)) return true;
        const catNames = getCategoryNames(cat);
        return excludedCategories.some(excluded => {
            const excludedNames = getCategoryNames(excluded);
            return excludedNames.en === catNames.en;
        });
    };
    
    // カテゴリーを順序に従って並べ替え（categoryFlowOrderに含まれるもののみ）
    // categoryFlowOrderの順序を確実に反映するため、順序通りに処理
    const orderedCategories = [];
    
    // categoryFlowOrderの各カテゴリーについて、実際のカテゴリー名をマッピング
    categoryFlowOrder.forEach(orderCategory => {
        // 直接一致する場合
        if (existingCategories.includes(orderCategory)) {
            // categoryFlowOrderに含まれるカテゴリは確実に追加（除外チェックをスキップ）
            orderedCategories.push(orderCategory);
        } else {
            // マッピングを確認（例：'主食' → 'ごはん'）
            const categoryNames = getCategoryNames(orderCategory);
            const matchingCategory = existingCategories.find(cat => {
                // categoryFlowOrderに含まれるカテゴリは除外しない
                if (categoryFlowOrder.includes(cat)) return true;
                if (isExcludedCategory(cat)) return false;
                const catNames = getCategoryNames(cat);
                return catNames.en === categoryNames.en;
            });
            if (matchingCategory) {
                orderedCategories.push(matchingCategory);
            }
        }
    });
    
    // 順序に含まれていないカテゴリーは追加しない（categoryFlowOrderに含まれるもののみ表示）
    
    // カテゴリーの順序に従ってフロー図を作成
    orderedCategories.forEach((category, index) => {
        // カテゴリーアイテムを作成
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-flow-item';
        categoryItem.setAttribute('data-category', category);
        
        // カテゴリー名を表示
        const categoryNames = getCategoryNames(category);
        const categoryLabel = document.createElement('div');
        categoryLabel.className = 'category-flow-label';
        categoryLabel.textContent = categoryNames.en;
        categoryItem.appendChild(categoryLabel);
        
        // 選択されたdishの画像を表示
        const dishImageContainer = document.createElement('div');
        dishImageContainer.className = 'category-flow-images';
        
        // 選択されたdishのリストを取得
        const selectedDishList = selectedDishes[category] || [];
        
        if (selectedDishList.length > 0) {
            // 選択されている場合は、すべてのdishを表示（副菜と主菜は複数選択可能）
            selectedDishList.forEach(dishName => {
                const dishData = nutritionData.find(
                    item => item.category === category && item.dish === dishName
                );
                
                if (dishData) {
                    categoryItem.classList.add('has-selection');
                    
                    const imgWrapper = document.createElement('div');
                    imgWrapper.className = 'category-flow-image-wrapper';
                    imgWrapper.setAttribute('data-dish-name', dishName);
                    imgWrapper.setAttribute('data-category', category);
                    
                    const img = document.createElement('img');
                    if (dishData.image && dishData.image.startsWith('data:image')) {
                        img.src = dishData.image;
                    } else if (dishData.image) {
                        img.src = dishData.image;
                    } else {
                        img.src = `images/${sanitizeFilename(dishData.dish)}.png`;
                    }
                    img.alt = dishData.dish;
                    img.className = 'category-flow-image';
                    img.onerror = function() {
                        img.style.display = 'none';
                    };
                    
                    // バツボタンを追加
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'category-flow-delete';
                    deleteButton.innerHTML = '×';
                    deleteButton.setAttribute('aria-label', '削除');
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const dishNameToRemove = imgWrapper.getAttribute('data-dish-name');
                        const categoryToRemove = imgWrapper.getAttribute('data-category');
                        if (selectedDishes[categoryToRemove]) {
                            selectedDishes[categoryToRemove] = selectedDishes[categoryToRemove].filter(d => d !== dishNameToRemove);
                        }
                        
                        // メイン画面の対応するdishボタンのselectedクラスを削除
                        const categoryRow = document.querySelector(`.category-row[data-category="${categoryToRemove}"]`);
                        if (categoryRow) {
                            const button = categoryRow.querySelector(`.dish-button[data-dish-name="${dishNameToRemove}"]`);
                            if (button) {
                                button.classList.remove('selected');
                                const selectedIndicator = button.querySelector('.selected-indicator');
                                if (selectedIndicator) selectedIndicator.style.display = 'none';
                            }
                        }
                        
                        saveToLocalStorage();
                        updateNutrition();
                    });
                    
                    imgWrapper.appendChild(img);
                    imgWrapper.appendChild(deleteButton);
                    dishImageContainer.appendChild(imgWrapper);
                }
            });
        } else {
            // 未選択の場合は初期状態のプレースホルダーを表示（すべて1つ）
            const placeholder = document.createElement('div');
            placeholder.className = 'category-flow-placeholder';
            const placeholderImg = document.createElement('img');
            placeholderImg.alt = '未選択';
            placeholderImg.className = 'category-flow-placeholder-image';
            
            // 画像の読み込みを確実にする
            placeholderImg.onload = function() {
                this.style.display = 'block';
            };
            placeholderImg.onerror = function() {
                // 画像が読み込めない場合でも表示を維持
                this.style.display = 'block';
                console.warn('Placeholder image failed to load:', this.src);
            };
            
            // 画像のsrcを設定（onload/onerrorの後に設定）
            placeholderImg.src = 'images/unselected-dish.png';
            
            placeholder.appendChild(placeholderImg);
            dishImageContainer.appendChild(placeholder);
        }
        
        categoryItem.appendChild(dishImageContainer);
        container.appendChild(categoryItem);
        
        // 矢印を追加（最後のカテゴリー以外）
        if (index < orderedCategories.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'category-flow-arrow';
            arrow.textContent = '→';
            container.appendChild(arrow);
        }
    });
}

function updateSelectedDishesImages() {
    const container = document.getElementById('selectedDishesImages');
    if (!container) return;
    
    // 既存の画像をクリア
    container.innerHTML = '';
    
    // 選択された料理を収集
    const selectedDishData = getSelectedDishData();
    
    // 画像を表示（最大10個まで）
    selectedDishData.slice(0, 10).forEach(dish => {
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'selected-dish-image-wrapper';
        imageWrapper.setAttribute('data-category', dish.category);
        imageWrapper.setAttribute('data-dish-name', dish.dish);
        
        const img = document.createElement('img');
        img.className = 'selected-dish-image';
        
        if (dish.image && dish.image.startsWith('data:image')) {
            img.src = dish.image;
        } else if (dish.image) {
            img.src = dish.image;
        } else {
            img.src = `images/${sanitizeFilename(dish.dish)}.png`;
        }
        
        img.alt = dish.dish;
        img.onerror = function() {
            img.style.display = 'none';
        };
        
        // 削除ボタンを追加
        const deleteButton = document.createElement('button');
        deleteButton.className = 'selected-dish-image-delete';
        deleteButton.innerHTML = '×';
        deleteButton.setAttribute('aria-label', '削除');
        
        // 削除ボタンのクリックで選択解除
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const category = imageWrapper.getAttribute('data-category');
            const dishName = imageWrapper.getAttribute('data-dish-name');
            
            // 選択を解除
            if (selectedDishes[category]) {
                selectedDishes[category] = selectedDishes[category].filter(d => d !== dishName);
            }
            
            // 対応するボタンの選択状態を更新
            const categoryRow = document.querySelector(`.category-row[data-category="${category}"]`);
            if (categoryRow) {
                const button = categoryRow.querySelector(`.dish-button[data-dish-name="${dishName}"]`);
                if (button) {
                    button.classList.remove('selected');
                }
            }
            
            saveToLocalStorage();
            updateNutrition();
        });
        
        imageWrapper.appendChild(img);
        imageWrapper.appendChild(deleteButton);
        container.appendChild(imageWrapper);
    });
    
    // 10個以上ある場合は「+N」を表示
    if (selectedDishData.length > 10) {
        const moreBadge = document.createElement('div');
        moreBadge.className = 'selected-dish-more';
        moreBadge.textContent = `+${selectedDishData.length - 10}`;
        container.appendChild(moreBadge);
    }
}

function getSelectedDishData() {
    const selectedDishData = [];
    Object.entries(selectedDishes).forEach(([category, dishNames]) => {
        if (!Array.isArray(dishNames)) return;
        
        dishNames.forEach(dishName => {
            const data = nutritionData.find(
                item => item.category === category && item.dish === dishName
            );
            if (data) {
                selectedDishData.push(data);
            }
        });
    });
    return selectedDishData;
}

function updateSelectedDishesList() {
    const container = document.getElementById('selectedDishesList');
    if (!container) return;
    
    // 既存の内容をクリア
    container.innerHTML = '';
    
    // 選択された料理を取得
    const selectedDishData = getSelectedDishData();
    
    if (selectedDishData.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    
    // タイトルを追加
    const title = document.createElement('div');
    title.className = 'selected-dishes-list-title';
    title.textContent = '選択されたメニュー';
    container.appendChild(title);
    
    // 各料理を表示
    selectedDishData.forEach(dish => {
        const item = document.createElement('div');
        item.className = 'selected-dish-item';
        item.setAttribute('data-category', dish.category);
        item.setAttribute('data-dish-name', dish.dish);
        
        const img = document.createElement('img');
        img.className = 'selected-dish-item-image';
        
        if (dish.image && dish.image.startsWith('data:image')) {
            img.src = dish.image;
        } else if (dish.image) {
            img.src = dish.image;
        } else {
            img.src = `images/${sanitizeFilename(dish.dish)}.png`;
        }
        
        img.alt = dish.dish;
        img.onerror = function() {
            img.style.display = 'none';
            const emoji = document.createElement('span');
            emoji.textContent = '🍽️';
            emoji.style.fontSize = '28px';
            item.insertBefore(emoji, item.firstChild);
        };
        
        const name = document.createElement('div');
        name.className = 'selected-dish-item-name';
        name.textContent = dish.dish;
        
        // 削除ボタンを追加
        const deleteButton = document.createElement('button');
        deleteButton.className = 'selected-dish-delete';
        deleteButton.innerHTML = '×';
        deleteButton.setAttribute('aria-label', '削除');
        
        // 削除ボタンのクリックで選択解除
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素へのイベント伝播を防ぐ
            
            const category = item.getAttribute('data-category');
            const dishName = item.getAttribute('data-dish-name');
            
            // 選択を解除
            if (selectedDishes[category]) {
                selectedDishes[category] = selectedDishes[category].filter(d => d !== dishName);
            }
            
            // 対応するボタンの選択状態を更新
            const categoryRow = document.querySelector(`.category-row[data-category="${category}"]`);
            if (categoryRow) {
                const button = categoryRow.querySelector(`.dish-button[data-dish-name="${dishName}"]`);
                if (button) {
                    button.classList.remove('selected');
                }
            }
            
            saveToLocalStorage();
            updateNutrition();
        });
        
        item.appendChild(img);
        item.appendChild(name);
        item.appendChild(deleteButton);
        container.appendChild(item);
    });
}

function updateNutritionDisplay(protein, fat, carbs, calories) {
    document.getElementById('total-calories').textContent = calories.toFixed(1);
    document.getElementById('total-protein').textContent = protein.toFixed(2);
    document.getElementById('total-fat').textContent = fat.toFixed(2);
    document.getElementById('total-carbs').textContent = carbs.toFixed(2);
    
    // 固定表示のPFCと総カロリーを更新
    updateFixedCalories(protein, fat, carbs, calories);
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
    
    // 通常のPFCチャートを更新
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
    
    // 固定表示のPFCバランスを更新
    updateFixedPfcBar(proteinPercent, fatPercent, carbsPercent);
}

function updateFixedPfcBar(proteinPercent, fatPercent, carbsPercent) {
    // この関数は後方互換性のため残すが、実際には使用しない
    // 代わりにupdateFixedCaloriesを使用
}

function updateFixedCalories(protein, fat, carbs, calories) {
    const fixedCaloriesValue = document.getElementById('fixed-calories-value');
    const fixedProteinValue = document.getElementById('fixed-protein-value');
    const fixedFatValue = document.getElementById('fixed-fat-value');
    const fixedCarbsValue = document.getElementById('fixed-carbs-value');
    
    if (!fixedCaloriesValue || !fixedProteinValue || !fixedFatValue || !fixedCarbsValue) return;
    
    // PFCの値を更新
    fixedProteinValue.textContent = protein.toFixed(2);
    fixedFatValue.textContent = fat.toFixed(2);
    fixedCarbsValue.textContent = carbs.toFixed(2);
    
    // 総カロリーを更新
    fixedCaloriesValue.textContent = calories.toFixed(1);
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

// ==================== 中央dish拡大機能 ====================

function setupDishCenterObserver(dishesRow) {
    const dishes = dishesRow.querySelectorAll('.dish-button:not(.clear-button):not(.add-button)');
    
    if (dishes.length === 0) return;
    
    // スクロールイベントで中央のdishを検出
    const updateCenterFocus = () => {
        const containerRect = dishesRow.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;
        
        dishes.forEach(dish => {
            const rect = dish.getBoundingClientRect();
            const elementCenterX = rect.left + rect.width / 2;
            const distance = Math.abs(elementCenterX - centerX);
            
            // 中央から最も近いdishを拡大
            if (distance < 60) {
                dish.classList.add('center-focused');
            } else {
                dish.classList.remove('center-focused');
            }
        });
    };
    
    // 初期状態でも中央のdishを検出
    updateCenterFocus();
    
    // スクロールイベントで更新
    dishesRow.addEventListener('scroll', updateCenterFocus, { passive: true });
    
    // リサイズ時も更新
    window.addEventListener('resize', updateCenterFocus);
}

function setupInfiniteScroll(dishesRow, dishButtons, category) {
    if (dishButtons.length <= 1) return; // 1個以下なら無限ループ不要
    
    let isScrolling = false;
    let scrollTimeout = null;
    
    // 最初と最後のdishを複製
    const firstButton = dishButtons[0];
    const lastButton = dishButtons[dishButtons.length - 1];
    
    const firstClone = firstButton.cloneNode(true);
    firstClone.classList.add('clone');
    firstClone.setAttribute('data-clone', 'first');
    const lastClone = lastButton.cloneNode(true);
    lastClone.classList.add('clone');
    lastClone.setAttribute('data-clone', 'last');
    
    // 最初の前に最後の複製、最後の後に最初の複製を追加
    dishesRow.insertBefore(lastClone, firstButton);
    dishesRow.appendChild(firstClone);
    
    // 最初の実物の位置にスクロール
    const scrollToFirst = () => {
        if (firstButton) {
            const buttonWidth = firstButton.offsetWidth;
            const padding = (dishesRow.offsetWidth / 2 - buttonWidth / 2);
            const firstButtonLeft = firstButton.offsetLeft;
            dishesRow.scrollLeft = firstButtonLeft - padding;
        }
    };
    
    // 初期位置を設定（最初の実物の位置）
    setTimeout(() => {
        scrollToFirst();
    }, 200);
    
    // スクロールイベントで無限ループを実現
    dishesRow.addEventListener('scroll', () => {
        if (isScrolling) return;
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const scrollLeft = dishesRow.scrollLeft;
            const scrollWidth = dishesRow.scrollWidth;
            const clientWidth = dishesRow.clientWidth;
            const buttonWidth = firstButton.offsetWidth;
            const padding = (dishesRow.offsetWidth / 2 - buttonWidth / 2);
            const firstButtonLeft = firstButton.offsetLeft;
            const lastButtonLeft = lastButton.offsetLeft;
            
            // 最後の複製に到達したら、最初の実物に戻す
            if (scrollLeft >= scrollWidth - clientWidth - 20) {
                isScrolling = true;
                dishesRow.scrollLeft = firstButtonLeft - padding;
                setTimeout(() => {
                    isScrolling = false;
                }, 100);
            }
            // 最初の複製に到達したら、最後の実物に戻す
            else if (scrollLeft <= 20) {
                isScrolling = true;
                dishesRow.scrollLeft = lastButtonLeft - padding;
                setTimeout(() => {
                    isScrolling = false;
                }, 100);
            }
        }, 50);
    }, { passive: true });
}

function setupDishIndicator(dishesRow, dishButtons, category) {
    // 実物のdishボタンのみを取得（複製を除外）
    const realButtons = dishButtons.filter(button => !button.classList.contains('clone'));
    
    if (realButtons.length === 0) {
        console.log('setupDishIndicator: No real buttons found for category:', category);
        return; // 実物のボタンがない場合は何もしない
    }
    
    // インジケーターコンテナを作成
    const indicator = document.createElement('div');
    indicator.className = 'dish-indicator';
    indicator.setAttribute('data-category', category);
    
    // 各dish用のドットを作成
    realButtons.forEach((button, index) => {
        const dot = document.createElement('div');
        dot.className = 'dish-indicator-dot';
        dot.setAttribute('data-index', index);
        indicator.appendChild(dot);
    });
    
    
    // dishesRowの直後にインジケーターを追加
    dishesRow.insertAdjacentElement('afterend', indicator);
    
    
    // 現在の位置を更新する関数
    const updateIndicator = () => {
        // 実物のdishボタンを再取得（複製が追加された後でも正しく動作するように）
        const currentRealButtons = Array.from(dishesRow.querySelectorAll('.dish-button')).filter(
            button => !button.classList.contains('clone')
        );
        
        if (currentRealButtons.length === 0) return;
        
        const containerRect = dishesRow.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;
        
        let activeIndex = 0;
        let minDistance = Infinity;
        
        // 実物のdishボタンのみをチェック
        currentRealButtons.forEach((button, index) => {
            const rect = button.getBoundingClientRect();
            const elementCenterX = rect.left + rect.width / 2;
            const distance = Math.abs(elementCenterX - centerX);
            
            if (distance < minDistance) {
                minDistance = distance;
                activeIndex = index;
            }
        });
        
        // アクティブなドットを更新
        const dots = indicator.querySelectorAll('.dish-indicator-dot');
        if (dots.length > activeIndex) {
            dots.forEach((dot, index) => {
                if (index === activeIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
    };
    
    // スクロールイベントで更新
    dishesRow.addEventListener('scroll', updateIndicator, { passive: true });
    
    // 初期状態も更新（複数回試行して確実に表示されるように）
    setTimeout(updateIndicator, 100);
    setTimeout(updateIndicator, 300);
    setTimeout(updateIndicator, 500);
    
    // リサイズ時も更新
    window.addEventListener('resize', updateIndicator);
    
    // インジケーターの表示を確認
    setTimeout(() => {
        const computedStyle = window.getComputedStyle(indicator);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            console.error('setupDishIndicator: Indicator is hidden by CSS!');
        }
    }, 200);
}

// ==================== ページロード ====================

// ==================== ハンバーガーメニュー ====================

function setupHamburgerMenu() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const menuClose = document.getElementById('menuClose');
    const menuItems = document.getElementById('menuItems');
    
    if (!hamburgerMenu || !menuOverlay || !menuClose || !menuItems) {
        return; // hamburger-menuが存在しない場合は何もしない
    }
    
    function openMenu() {
        // メニューを開くたびにカテゴリー一覧を更新
        updateMenuItems();
        hamburgerMenu.classList.add('active');
        menuOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    function closeMenu() {
        hamburgerMenu.classList.remove('active');
        menuOverlay.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    function scrollToCategory(category) {
        const categoryRow = document.querySelector(`[data-category="${category}"]`);
        if (categoryRow) {
            closeMenu();
            // 少し遅延を入れてメニューが閉じてからスクロール
            setTimeout(() => {
                // headerの直下に表示されるようにスクロール位置を調整
                const header = document.querySelector('.header');
                const headerHeight = header ? header.offsetHeight : 100;
                
                // カテゴリーの位置を取得
                const categoryRect = categoryRow.getBoundingClientRect();
                const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
                
                // headerの直下に来るように計算
                const targetScrollY = currentScrollY + categoryRect.top - headerHeight;
                
                window.scrollTo({
                    top: targetScrollY,
                    behavior: 'smooth'
                });
            }, 300);
        }
    }
    
    function updateMenuItems() {
        // 既存のメニュー項目をクリア
        menuItems.innerHTML = '';
        
        // カテゴリー一覧を取得
        const categories = [...new Set(nutritionData.map(item => item.category))];
        
        categories.forEach(category => {
            const categoryNames = getCategoryNames(category);
            const menuItem = document.createElement('a');
            menuItem.href = '#';
            menuItem.className = 'menu-item';
            menuItem.textContent = `${categoryNames.en} (${categoryNames.ja})`;
            
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                scrollToCategory(category);
            });
            
            menuItems.appendChild(menuItem);
        });
    }
    
    hamburgerMenu.addEventListener('click', () => {
        if (hamburgerMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });
    
    menuClose.addEventListener('click', closeMenu);
    
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            closeMenu();
        }
    });
    
    // グローバルに公開して、init()後に呼び出せるようにする
    window.updateMenuItems = updateMenuItems;
}

// ==================== 固定PFCバランスの表示制御 ====================

function setupFixedPfcBarVisibility() {
    const fixedPfcBar = document.getElementById('fixedPfcBar');
    const resultContainer = document.getElementById('result-container');
    
    if (!fixedPfcBar) return;
    
    // 初期状態では表示
    fixedPfcBar.classList.remove('hidden');
    
    if (!resultContainer) return;
    
    function updateVisibility() {
        const resultStyle = window.getComputedStyle(resultContainer);
        const isResultVisible = resultStyle.display !== 'none';
        
        if (isResultVisible) {
            // result-containerが表示されている場合
            const rect = resultContainer.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (isInViewport) {
                // 栄養情報セクションが表示されている場合は非表示
                fixedPfcBar.classList.add('hidden');
            } else {
                // ページの一番下にスクロールした場合も非表示
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const windowHeight = window.innerHeight;
                const documentHeight = document.documentElement.scrollHeight;
                const isAtBottom = (scrollTop + windowHeight) >= documentHeight - 50;
                
                if (isAtBottom) {
                    fixedPfcBar.classList.add('hidden');
                } else {
                    fixedPfcBar.classList.remove('hidden');
                }
            }
        } else {
            // result-containerが非表示の場合は表示
            fixedPfcBar.classList.remove('hidden');
        }
    }
    
    // IntersectionObserverでresult-containerの表示状態を監視
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            updateVisibility();
        });
    }, {
        threshold: 0.1,
        rootMargin: '-50px 0px 0px 0px'
    });
    
    observer.observe(resultContainer);
    
    // スクロールイベントでも更新
    window.addEventListener('scroll', updateVisibility, { passive: true });
}

// ==================== ページロード ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Page load started');
    
    // ハンバーガーメニューの設定
    setupHamburgerMenu();
    
    // 画像カルーセルは削除（単一画像に変更）
    
    // Firestoreから読み込み
    await loadFromFirestore();
    
    loadFromLocalStorage();
    checkForCacheClean();
    init();
    restoreUISelection();
    updateNutrition();
    
    // メニュー項目を更新
    if (window.updateMenuItems) {
        window.updateMenuItems();
    }
    
    // 固定PFCバランスの表示制御を設定
    setupFixedPfcBarVisibility();
    
    // プレースホルダー画像をプリロード
    const preloadImage = new Image();
    preloadImage.src = 'images/unselected-dish.png';
    
    // フロー図を初期化（nutritionDataが読み込まれた後）
    // 画像のプリロードを待ってから初期化
    preloadImage.onload = () => {
        updateCategoryFlow();
        
        // fixed-pfc-barがhiddenになっていないか確認
        const fixedPfcBar = document.getElementById('fixedPfcBar');
        if (fixedPfcBar) {
            fixedPfcBar.classList.remove('hidden');
        }
    };
    
    // 画像の読み込みに失敗した場合や、既に読み込まれている場合のフォールバック
    preloadImage.onerror = () => {
        console.warn('Placeholder image preload failed, initializing anyway');
        updateCategoryFlow();
        
        const fixedPfcBar = document.getElementById('fixedPfcBar');
        if (fixedPfcBar) {
            fixedPfcBar.classList.remove('hidden');
        }
    };
    
    // 既に読み込まれている場合（completeプロパティで確認）
    if (preloadImage.complete) {
        updateCategoryFlow();
        
        const fixedPfcBar = document.getElementById('fixedPfcBar');
        if (fixedPfcBar) {
            fixedPfcBar.classList.remove('hidden');
        }
    }
});