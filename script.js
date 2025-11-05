// CSV行をパース
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

// ファイル名をサニタイズ
function sanitizeFilename(filename) {
    return filename
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
}let nutritionData = [];
let selectedDishes = {}; // { category: dishName }

// CSV読み込みと処理
async function loadCSV() {
    try {
        const response = await fetch('menu.csv');
        const csvText = await response.text();
        
        parseCSV(csvText);
        init();
    } catch (error) {
        console.error('CSVの読み込みに失敗しました:', error);
    }
}

// CSV解析
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
            const imagePath = values[6] ? values[6].trim() : ''; // 画像パス
            
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

// CSV行をパース
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

// 初期化
function init() {
    const container = document.getElementById('categories-container');
    
    // カテゴリーごとにグループ化
    const categories = [...new Set(nutritionData.map(item => item.category))];
    
    categories.forEach(category => {
        const dishes = nutritionData.filter(item => item.category === category);
        
        if (dishes.length === 0) return;
        
        // 最初の料理を選択状態に
        selectedDishes[category] = dishes[0].dish;
        
        // カテゴリー行を作成
        const categoryRow = document.createElement('div');
        categoryRow.className = 'category-row';
        
        // カテゴリーラベル
        const categoryLabel = document.createElement('div');
        categoryLabel.className = 'category-label';
        categoryLabel.textContent = category;
        
        // 料理ボタンの行
        const dishesRow = document.createElement('div');
        dishesRow.className = 'dishes-row';
        
        dishes.forEach(dish => {
            const button = document.createElement('button');
            button.className = 'dish-button';
            
            // 画像とテキストを配置
            const img = document.createElement('img');
            img.className = 'dish-button-img';
            
            // CSVから画像パスを取得、なければデフォルト処理
            if (dish.image) {
                img.src = dish.image;
            } else {
                img.src = `images/${sanitizeFilename(dish.dish)}.jpg`;
            }
            
            img.alt = dish.dish;
            img.onerror = function() {
                // 画像が見つからない場合は絵文字を表示
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
            
            // 最初の料理を選択状態に
            if (dish.dish === selectedDishes[category]) {
                button.classList.add('selected');
            }
            
            button.addEventListener('click', () => {
                // 同じカテゴリーの他のボタンを解除
                dishesRow.querySelectorAll('.dish-button').forEach(btn => {
                    btn.classList.remove('selected');
                });
                
                // このボタンを選択
                button.classList.add('selected');
                selectedDishes[category] = dish.dish;
                
                // 栄養情報を更新
                updateNutrition();
            });
            
            dishesRow.appendChild(button);
        });
        
        categoryRow.appendChild(categoryLabel);
        categoryRow.appendChild(dishesRow);
        container.appendChild(categoryRow);
    });
    
    // 初期表示
    updateNutrition();
}

// 栄養情報を更新
function updateNutrition() {
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;
    let totalCalories = 0;
    
    // 選択された料理の栄養値を合計
    Object.entries(selectedDishes).forEach(([category, dishName]) => {
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
    
    // 基本情報を表示
    document.getElementById('total-calories').textContent = totalCalories.toFixed(1);
    document.getElementById('total-protein').textContent = totalProtein.toFixed(2);
    document.getElementById('total-fat').textContent = totalFat.toFixed(2);
    document.getElementById('total-carbs').textContent = totalCarbs.toFixed(2);
    
    // PFCのカロリー計算
    const proteinKcal = totalProtein * 4;
    const fatKcal = totalFat * 9;
    const carbsKcal = totalCarbs * 4;
    const totalPfcKcal = proteinKcal + fatKcal + carbsKcal;
    
    // パーセンテージ計算
    let proteinPercent = 0;
    let fatPercent = 0;
    let carbsPercent = 0;
    
    if (totalPfcKcal > 0) {
        proteinPercent = (proteinKcal / totalPfcKcal) * 100;
        fatPercent = (fatKcal / totalPfcKcal) * 100;
        carbsPercent = (carbsKcal / totalPfcKcal) * 100;
    }
    
    // PFCバーを更新
    document.getElementById('protein-segment').style.width = proteinPercent + '%';
    document.getElementById('fat-segment').style.width = fatPercent + '%';
    document.getElementById('carbs-segment').style.width = carbsPercent + '%';
    
    // パーセンテージラベルを更新
    updatePfcLabel('protein-percent', proteinPercent);
    updatePfcLabel('fat-percent', fatPercent);
    updatePfcLabel('carbs-percent', carbsPercent);
    
    // 詳細情報を表示
    document.getElementById('protein-kcal').textContent = proteinKcal.toFixed(1);
    document.getElementById('fat-kcal').textContent = fatKcal.toFixed(1);
    document.getElementById('carbs-kcal').textContent = carbsKcal.toFixed(1);
    
    document.getElementById('protein-percent-detail').textContent = proteinPercent.toFixed(1) + '%';
    document.getElementById('fat-percent-detail').textContent = fatPercent.toFixed(1) + '%';
    document.getElementById('carbs-percent-detail').textContent = carbsPercent.toFixed(1) + '%';
}

// PFCラベルを更新
function updatePfcLabel(elementId, percent) {
    const element = document.getElementById(elementId);
    if (percent > 8) {
        element.textContent = percent.toFixed(0) + '%';
        element.style.display = 'inline';
    } else {
        element.style.display = 'none';
    }
}

// ページ読み込み時にCSVを読み込み
document.addEventListener('DOMContentLoaded', loadCSV);