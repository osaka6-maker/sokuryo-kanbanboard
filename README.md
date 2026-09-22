```mermaid
erDiagram
    TASKS ||--o{ LOGS : "変更履歴として記録"
    SETTINGS_MASTER ||--o{ TASKS : "入力時の選択肢(マスター)を提供"
    SETTINGS_DESCRIPTIONS ||--o{ TASKS : "ステータス説明文を提供"

    TASKS {
        string ID PK "ドキュメントID (例: PJ-123456789)"
        string date "測量日(YYYY/MM/DD等)"
        string status "ステータス"
        string type "測量種別"
        string equipment "使用機器"
        string client "お客様名"
        string billing "請求先名"
        string site "現場名"
        string office "営業所"
        string salesperson "営業マン"
        string district "現場地区名"
        string refPoint "電子基準点名"
        string route "飛行ルート名"
        string dips "DIPS2.0登録"
        string ministry "管轄省庁"
        string standard "社内規格値"
        string mapUrl "現場位置(URL)"
        string meetUrl "集合場所(URL)"
        string officeLoc "事務所位置(URL)"
        string pjUrl "PJ(URL)"
        string chatUrl "Chat(URL)"
        string sharePath "共有パス"
        string image1 "画像1(Storage URL)"
        string image2 "画像2(Storage URL)"
        string slipImage "伝票画像(Storage URL)"
        string statusDate "ステータス変更日"
        
        string designRep "設計担当(カンマ区切り文字列)"
        string planRep "施工計画(カンマ区切り文字列)"
        string surveyRep "測量担当(カンマ区切り文字列)"
        string pointCloudRep "点群処理(カンマ区切り文字列)"
        string crossSectionRep "現況横断(カンマ区切り文字列)"
        string earthRep "土量(カンマ区切り文字列)"
        string outputRep "成果作成(カンマ区切り文字列)"
        string zeroYenRep "０円請求(カンマ区切り文字列)"

        %% Map(オブジェクト)型として保存される項目
        map checkStatus "成果物チェック状況 { 項目キー: boolean }"
        
        map upload_plan "施工計画書 { isUploaded: bool, user: string, date: YYYYMMDD, time: HH:mm, timestamp: Timestamp }"
        map upload_ysbase "YS・Base { 同上 }"
        map upload_musashi "現況横断武蔵 { 同上 }"
        map upload_route "飛行ルート { 同上 }"
        map upload_ortho "Photo・オルソ { 同上 }"
        map upload_hyoutei "標定点配置武蔵 { 同上 }"
        map upload_tsc "TSC観測データ { 同上 }"
        map upload_dgn "DGN { 同上 }"
        map upload_zip "成果物ZIP { 同上 }"
        map upload_tls "TLS_data { 同上 }"
        map upload_xpt "XPT・XPTC { 同上 }"
    }

    LOGS {
        string ID PK "自動生成ID"
        timestamp timestamp "操作日時"
        string userName "ユーザー名(email)"
        string taskId FK "対象案件ID (tasks.ID)"
        string actionType "操作種別"
        string details "詳細"
    }

    SETTINGS_MASTER {
        string ID PK "'masterData'"
        map masterData "マスター情報 { offices: [...], ministries: [...] }"
    }

    SETTINGS_DESCRIPTIONS {
        string ID PK "'descriptions'"
        string status_keys "各ステータス名(キー)と説明文(値)"
    }
