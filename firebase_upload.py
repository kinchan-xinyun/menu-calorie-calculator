import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import csv
import os
import glob

# 1. Firebase Admin SDKの初期化
# プロジェクトディレクトリ内のJSONファイルを自動検索
json_files = glob.glob('*.json')
firebase_json_files = [f for f in json_files if 'firebase' in f.lower() or 'adminsdk' in f.lower()]

if firebase_json_files:
    cred_file = firebase_json_files[0]
    print(f"Firebase認証ファイル '{cred_file}' を使用します。")
    cred = credentials.Certificate(cred_file)
    firebase_admin.initialize_app(cred)
else:
    print("エラー: Firebase Admin SDKの秘密鍵ファイル（JSON）が見つかりません。")
    print("Firebaseコンソールから秘密鍵をダウンロードして、このディレクトリに配置してください。")
    print("手順: Firebase Console > プロジェクトの設定 > サービスアカウント > 新しい秘密鍵の生成")
    exit(1)

db = firestore.client()

# 2. CSVファイルのパス
csv_file_path = 'menu.csv' # ファイル名を変更

# 3. Firestoreにデータを書き込むコレクション名
collection_name = 'menuItems' # 例: メニュー項目を保存するコレクション名

print(f"'{csv_file_path}' からデータを読み込み、Firestoreの '{collection_name}' コレクションに書き込みます...")

success_count = 0
error_count = 0

with open(csv_file_path, mode='r', encoding='utf-8') as file:
    csv_reader = csv.DictReader(file)
    rows = list(csv_reader)
    total_rows = len(rows)
    
    print(f"合計 {total_rows} 件のデータを処理します...\n")

    for row_number, row in enumerate(rows, start=1):
        try:
            # Firestoreに保存するドキュメントデータを準備
            # 日本語のフィールド名を英語にマッピングし、データ型を変換
            doc_data = {
                'category': row['カテゴリー'],
                'dishName': row['料理名'],  # JavaScriptと統一
                'protein': float(row['タンパク質']),
                'fat': float(row['脂質']),
                'carbohydrates': float(row['炭水化物']),  # JavaScriptと統一
                'totalCalories': float(row['総カロリー']),  # JavaScriptと統一
                'imageUrl': row['画像パス'],  # JavaScriptと統一
                'status': row['販売状態'],
                'displayOrder': int(row['表示順'])
            }

            # ドキュメントIDをカテゴリー_料理名で生成（一意性を確保）
            doc_id = f"{row['料理名']}"
            
            doc_ref = db.collection(collection_name).document(doc_id)
            doc_ref.set(doc_data)

            print(f"✓ [{row_number}/{total_rows}] {row['カテゴリー']} - {row['料理名']}")
            success_count += 1
            
        except KeyError as e:
            print(f"✗ [{row_number}/{total_rows}] エラー: 必要な列が見つかりません - {e}")
            error_count += 1
        except ValueError as e:
            print(f"✗ [{row_number}/{total_rows}] エラー: 数値変換に失敗 - {e}")
            error_count += 1
        except Exception as e:
            print(f"✗ [{row_number}/{total_rows}] エラー: {e}")
            error_count += 1

print("\n" + "="*50)
print(f"インポート処理が完了しました。")
print(f"成功: {success_count} 件")
print(f"失敗: {error_count} 件")
print("="*50)
