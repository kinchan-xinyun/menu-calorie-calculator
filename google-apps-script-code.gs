/**
 * スプレッドシートからデータを取得し、JSON形式で返す（GETリクエスト）。
 * CORSヘッダーを設定します。
 * @param {GoogleAppsScript.Events.DoGet} e イベントオブジェクト
 * @returns {GoogleAppsScript.Content.TextOutput} JSONデータとCORSヘッダー
 */
function doGet(e) {
  // CORSプリフライトリクエスト（OPTIONS）をdoGet内で処理する
  if (e.parameters && e.parameters.method === 'OPTIONS') {
    return handleCors();
  }
  
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダーをスキップしてデータを配列に変換
    const result = [];
    // i=1 から開始し、ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      // 1列目（category）が空でない行のみを処理
      if (data[i][0]) { 
        result.push({
          category: data[i][0] || '',
          dish: data[i][1] || '',
          protein: parseFloat(data[i][2]) || 0,
          fat: parseFloat(data[i][3]) || 0,
          carbs: parseFloat(data[i][4]) || 0,
          calories: parseFloat(data[i][5]) || 0,
          image: data[i][6] || ''
        });
      }
    }
    
    // 成功したJSONレスポンスを返す
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON)
      // CORSヘッダーを付与
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      
  } catch (error) {
    // エラーレスポンスを返す
    Logger.log('GET Error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  }
}


/**
 * データの追加または削除を処理する（POSTリクエスト）。
 * CORSヘッダーを設定します。
 * @param {GoogleAppsScript.Events.DoPost} e イベントオブジェクト
 * @returns {GoogleAppsScript.Content.TextOutput} 処理結果とCORSヘッダー
 */
function doPost(e) {
  // doPostでもOPTIONSリクエストを処理できるようにする（通常は発生しないが念のため）
  if (!e.postData) {
    return handleCors();
  }
  
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    // 削除処理
    if (data.action === 'delete') {
      const allData = sheet.getDataRange().getValues();
      let rowToDelete = -1;
      
      // 対象の行を探す (i=1からデータを検索し、スプレッドシートの行番号は i+1)
      for (let i = 1; i < allData.length; i++) {
        // dishとcategoryが完全に一致する行を探す
        if (allData[i][1] === data.dish && allData[i][0] === data.category) {
          rowToDelete = i + 1; // スプレッドシートの行番号（1始まり）
          break; // 最初に見つかった一致行のみを削除
        }
      }
      
      if (rowToDelete !== -1) {
        sheet.deleteRow(rowToDelete);
        var resultMessage = {success: true, action: 'delete', message: `Row ${rowToDelete} deleted.`};
      } else {
        var resultMessage = {success: false, action: 'delete', message: 'Target row not found.'};
      }
      
    // 追加処理
    } else if (data.action === 'add') {
      sheet.appendRow([
        data.category || '',
        data.dish || '',
        parseFloat(data.protein) || 0,
        parseFloat(data.fat) || 0,
        parseFloat(data.carbs) || 0,
        parseFloat(data.calories) || 0,
        data.image || ''
      ]);
      var resultMessage = {success: true, action: 'add'};
    } else {
      // actionが指定されていない場合
      var resultMessage = {success: false, error: 'Invalid action specified.'};
    }
    
    // 成功レスポンスを返す
    return ContentService
      .createTextOutput(JSON.stringify(resultMessage))
      .setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      
  } catch (error) {
    // エラーレスポンスを返す
    Logger.log('POST Error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  }
}

/**
 * プリフライトリクエスト (OPTIONS) を処理するためのヘルパー関数。
 * Google Apps ScriptではdoOptions()が機能しない場合があるため、
 * doGet/doPost の中で条件分岐で呼び出すのが最も確実な方法です。
 * @returns {GoogleAppsScript.Content.TextOutput} CORSヘッダーのみを含む空のレスポンス
 */
function handleCors() {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
}

