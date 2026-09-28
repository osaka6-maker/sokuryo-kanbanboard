
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
    import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

    // ▼▼▼ ご自身のFirebase設定に書き換えてください ▼▼▼
    const firebaseConfig = {
      apiKey: "AIzaSyA67b57zxXOoFbhOzJv8F5FY6BSH8exwoE",
      authDomain: "survey-signboard-app.firebaseapp.com",
      projectId: "survey-signboard-app",
      storageBucket: "survey-signboard-app.firebasestorage.app",
      messagingSenderId: "775964000204",
      appId: "1:775964000204:web:89dea349c34ccd57666769"
    };
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    
    // ★ Chromeのタブを閉じたときに自動ログアウト（セッションストレージに認証を保持）
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error("Persistence error:", err);
    });

    const db = getFirestore(app);
    const storage = getStorage(app);

    // ★ リロード時のログイン画面のチラつきを完全防止（CSSと連動）
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
      const mainApp = document.getElementById('main-app');
      if (mainApp) mainApp.classList.remove('hidden');
    } else {
      // 未ログイン状態ならログイン画面を表示させる
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.classList.add('show-login');
    }

    window.ASSIGNEES = {
      design: ['ー', '桒名', '丸岡', '鈴木', '西山', '奥山', '平岡', '武井', '酒井', '金原'],
      others: ['ー', '大林', '西山', '清水', '前田', '尾坂']
    };

    window.STATUS_LIST = [
      '予定', '測量前準備', '点群処理中', '横断作成中', '成果作成中', '設計待',
      '確認待', '０円請求未', 'まとめて提出', '共有移動未', '共有に移動済', '新宮担当'
    ];
    
    window.tasks = [];
    window.masterData = { offices: {}, ministries: [], equipments: [], checkMaster: [] };
    window.isSidebarOpen = true;
    window.currentSort = 'asc';
    window.currentOpenTaskId = null;
    window.isEditMode = false;
    window.filterText = '';
    window.filterRole = 'all';
    window.filterAssignee = '';
    window.globalStatusDescriptions = {};
    window.currentView = 'kanban'; 
    window.currentCalYear = new Date().getFullYear();
    window.currentCalMonth = new Date().getMonth();
    window.currentUser = null;
    
    // --- 初期化 ---
    applyFontSize(localStorage.getItem('appFontSize') || 'medium');
    const savedSort = localStorage.getItem('sortOrder');
    if (savedSort) {
      window.currentSort = savedSort;
      document.getElementById('sort-order').value = window.currentSort;
    }
    initFilters();
    setupDragAndDrop();

    // --- Firebase Auth ---
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        window.currentUser = user;
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userName', user.email);
        sessionStorage.setItem('userRole', '編集者');
        
        if (document.getElementById('user-display-name')) {
          document.getElementById('user-display-name').textContent = `👤 ${user.email}`;
        }
        document.getElementById('login-screen').classList.remove('show-login');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        await loadMasterDataFromFirebase();
        await loadUserNamesFromFirebase();
        setupRealtimeTasks();
      } else {
        window.currentUser = null;
        sessionStorage.removeItem('isLoggedIn');
        document.getElementById('login-screen').classList.add('show-login');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
      }
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-password').value.trim();
      const btn = document.getElementById('btn-login-submit');
      btn.innerHTML = '認証中...';
      btn.disabled = true;
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        showToast('ログインしました');
      } catch (err) {
        showToast('ログイン失敗: IDかパスワードが違います', 'error');
      } finally {
        btn.innerHTML = 'ログイン';
        btn.disabled = false;
      }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
      signOut(auth);
    });
        // --- Firestore Data Fetching ---
    window.userNamesMap = {};

    async function loadUserNamesFromFirebase() {
      try {
        const snap = await getDocs(collection(db, 'users'));
        window.userNamesMap = {};
        snap.forEach(docSnap => {
          const emailPrefix = docSnap.id.split('@')[0];
          window.userNamesMap[emailPrefix] = docSnap.data().name;
        });
      } catch (e) {
        console.error('User names load error:', e);
      }
    }

    async function loadMasterDataFromFirebase() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'masterData'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.masterData && typeof data.masterData === 'object') {
             window.masterData = data.masterData;
          } else if (data.masterJson) {
             window.masterData = JSON.parse(data.masterJson);
          }
          populateMasterDropdowns();
        }
        const descSnap = await getDoc(doc(db, 'settings', 'descriptions'));
        if (descSnap.exists()) {
          window.globalStatusDescriptions = descSnap.data();
          loadStatusDescriptions();
        }
      } catch (e) {
        console.error('Master data load error:', e);
      }
    }

    function setupRealtimeTasks() {
      const syncIcon = document.getElementById('sync-icon');
      if (syncIcon) syncIcon.classList.add('animate-spin', 'text-blue-400');
      
      onSnapshot(collection(db, 'tasks'), (snapshot) => {
        window.tasks = [];
        snapshot.forEach(docSnap => {
          const rawD = docSnap.data();
          const d = {};
          for (let key in rawD) {
            const cleanKey = key.replace(/\r?\n/g, '').trim();
            d[cleanKey] = rawD[key];
          }
          
          window.tasks.push({
            id: docSnap.id,
            date: d['測量日'] || '',
            status: d['ステータス'] || '予定',
            type: d['測量種別'] || '',
            equipment: d['使用機器'] || '',
            client: d['お客様名'] || '',
            billing: d['請求先名'] || '',
            site: d['現場名'] || '',
            office: d['営業所'] || '',
            salesperson: d['営業マン'] || '',
            district: d['現場地区名'] || '',
            refPoint: d['電子基準点名'] || '',
            route: d['飛行ルート名'] || '',
            dips: d['DIPS登録'] || '',
            ministry: d['管轄省庁'] || '',
            standard: d['社内規格値'] || '',
            mapUrl: d['現場位置'] || '',
            meetUrl: d['集合場所'] || '',
            officeLoc: d['事務所位置'] || '',
            pjUrl: d['PJ'] || '',
            chatUrl: d['Chat'] || '',
            sharePath: d['共有パス'] || '',
            image1: d['画像1'] || '',
            image2: d['画像2'] || '',
            slipImage: d['伝票画像'] || '',
            statusDate: d['ステータス変更日'] || '',
            
            checkStatus: d['成果物チェック状況'] || {},
            
            designRep: d['設計担当'] || '',
            planRep: d['施工計画'] || '',
            surveyRep: d['測量担当'] || '',
            pointCloudRep: d['点群処理'] || '',
            crossSectionRep: d['現況横断'] || '',
            hyouteitenRep: d['標定点配置図'] || '',
            outputRep: d['成果作成'] || '',
            zeroYenRep: d['０円請求'] || '',
            
            '施工計画書': d['施工計画書'] || null,
            'YS・Base': d['YS・Base'] || null,
            '現況横断武蔵': d['現況横断武蔵'] || null,
            '飛行ルート': d['飛行ルート'] || null,
            'Photo・オルソ': d['Photo・オルソ'] || null,
            '標定点配置武蔵': d['標定点配置武蔵'] || null,
            'TSC観測データ': d['TSC観測データ'] || null,
            'DGN': d['DGN'] || null,
            '成果物ZIP': d['成果物ZIP'] || null,
            'TLS_data': d['TLS_data'] || null,
            'XPT・XPTC': d['XPT・XPTC'] || null
          });
        });
        updateCurrentView();
        
        if (window.currentOpenTaskId && !document.getElementById('detail-modal').classList.contains('hidden')) {
           const updatedTask = window.tasks.find(t => t.id === window.currentOpenTaskId);
           if (updatedTask) window.openDetailModal(updatedTask);
        }
        if (syncIcon) syncIcon.classList.remove('animate-spin', 'text-blue-400');
      });
    }

    // --- Firebase Logs ---
    window.recordLog = async function(taskId, taskName, actionType, details) {
      if (!window.currentUser) return;
      try {
        await addDoc(collection(db, 'logs'), {
          timestamp: serverTimestamp(),
          userName: window.currentUser.email,
          taskId: taskId || '-',
          taskName: taskName || '-',
          actionType: actionType,
          details: details || ''
        });
      } catch (e) {
        console.error('Log error:', e);
      }
    };

    window.loadLogs = async function() {
      try {
        const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          const dateStr = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString('ja-JP') : '-';
          const tName = d.taskName ? d.taskName : '-';
          
          // 💡 VS Codeのエラー誤検知を防ぐため、文字列結合を安全な形に修正しました
          let rowHtml = '';
          rowHtml += '<tr class="hover:bg-slate-50 transition-colors">';
          rowHtml += '<td class="py-2.5 px-3 text-slate-500 whitespace-nowrap">' + dateStr + '</td>';
          rowHtml += '<td class="py-2.5 px-3 font-bold text-slate-700">' + d.userName + '</td>';
          rowHtml += '<td class="py-2.5 px-3 font-bold text-slate-800">' + tName + '</td>';
          rowHtml += '<td class="py-2.5 px-3 text-blue-600 font-bold text-[10px]">' + d.taskId + '</td>';
          rowHtml += '<td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-200 font-bold text-slate-800">' + d.actionType + '</span></td>';
          rowHtml += '<td class="py-2.5 px-3 text-slate-600 break-words max-w-[200px]">' + d.details + '</td>';
          rowHtml += '</tr>';
          
          tbody.innerHTML += rowHtml;
        });
      } catch(e) { console.error(e); }
    };

    // --- Update Methods for Firebase ---
    window.handleDrop = async function(id, stat) {
      const idx = window.tasks.findIndex(t => t.id === id);
      if (idx === -1 || window.tasks[idx].status === stat) return;
      try {
        const syncIcon = document.getElementById('sync-icon');
        if (syncIcon) syncIcon.classList.add('animate-spin', 'text-blue-400');
        const updateData = { 'ステータス': stat };
        if (stat === '設計待') {
          updateData['ステータス変更日'] = formatYYYYMMDD(new Date());
        } else {
          updateData['ステータス変更日'] = '';
        }
        await updateDoc(doc(db, 'tasks', id), updateData);
        const tName = (window.tasks[idx].client || '') + ' ' + (window.tasks[idx].site || '');
        await window.recordLog(id, tName, 'ステータス変更', stat);
        showToast('ステータスを変更しました');
      } catch(e) {
        showToast('更新失敗', 'error');
      } finally {
        const syncIcon = document.getElementById('sync-icon');
        if (syncIcon) syncIcon.classList.remove('animate-spin', 'text-blue-400');
      }
    };

    window.handleDropDate = async function(id, newDateStr) {
      const idx = window.tasks.findIndex(t => t.id === id);
      if (idx === -1 || formatYYYYMMDD(window.tasks[idx].date) === newDateStr) return;
      try {
        const syncIcon = document.getElementById('sync-icon');
        if (syncIcon) syncIcon.classList.add('animate-spin', 'text-blue-400');
        await updateDoc(doc(db, 'tasks', id), { '測量日': newDateStr });
        const tName = (window.tasks[idx].client || '') + ' ' + (window.tasks[idx].site || '');
        await window.recordLog(id, tName, '測量日変更', newDateStr);
        showToast(`測量日を ${newDateStr} に変更しました`);
      } catch(e) { showToast('更新失敗', 'error'); }
      finally { 
        const syncIcon = document.getElementById('sync-icon');
        if (syncIcon) syncIcon.classList.remove('animate-spin', 'text-blue-400'); 
      }
    };

    window.sendAssigneeChangeToFirebase = async function(roleId, val) {
      if (!window.currentOpenTaskId) return;
      try {
        const roleMap = { 'design': '設計担当', 'plan': '施工計画', 'survey': '測量担当', 'pointcloud': '点群処理', 'cross': '現況横断', 'hyouteiten': '標定点配置図', 'output': '成果作成', 'zeroyen': '０円請求' };
        const dbField = roleMap[roleId];
        await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), { [dbField]: val });
        const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
        const tName = t ? (t.client || '') + ' ' + (t.site || '') : '-';
        await window.recordLog(window.currentOpenTaskId, tName, '担当者更新', `${dbField} -> ${val}`);
        showToast('担当者を更新しました');
      } catch(e) { showToast('担当者更新に失敗', 'error'); }
    };

    window.handleCheckboxChange = function(el, r) {
      const cbs = document.getElementById('menu-' + r).querySelectorAll('input[type="checkbox"]');
      let sel = [];
      if (el.value === 'ー' && el.checked) {
        cbs.forEach(c => { if (c.value !== 'ー') c.checked = false; });
      } else if (el.value !== 'ー' && el.checked) {
        cbs.forEach(c => { if (c.value === 'ー') c.checked = false; });
      }
      cbs.forEach(c => { if (c.checked) sel.push(c.value); });
      if (sel.length === 0) {
        cbs.forEach(c => { if (c.value === 'ー') c.checked = true; });
        sel = ['ー'];
      }
      let disp = sel.join(', ');
      if (disp.length > 15) disp = disp.substring(0, 15) + '...';
      
      const displayEl = document.getElementById('displayText-' + r);
      if (displayEl) displayEl.textContent = disp;

      window.sendAssigneeChangeToFirebase(r, sel.join(', '));
    };
    window.handleUploadCheck = async function(fieldName, isChecked) {
      if (!window.currentOpenTaskId) return;
      
      // ① チェックされたユーザーのIDと名前を取得
      const userPrefix = window.currentUser.email.split('@')[0];
      const displayName = (window.userNamesMap && window.userNamesMap[userPrefix]) ? window.userNamesMap[userPrefix] : userPrefix;
      
      let val = null;
      if (isChecked) {
        const now = new Date();
        const yyyymmdd = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
        const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        val = {
          isUploaded: true,
          user: userPrefix,
          date: yyyymmdd,
          time: hhmm,
          timestamp: serverTimestamp() 
        };
      } else {
        val = { isUploaded: false, user: '', date: '', time: '' };
      }
      
      // ② アップロード項目と「各担当者」のプルダウン（データベースのフィールド名）の対応表
      const autoAssignMap = {
        '施工計画書': '施工計画',
        '成果物ZIP': '成果作成',
        '標定点配置武蔵': '標定点配置図',
        '現況横断武蔵': '現況横断'
      };

      try {
        // ③ アップロード状況を更新するデータ
        const updateData = { [fieldName]: val };
        
        // ④ 対応する項目がチェックされた場合、担当者も同時に更新する
        let autoAssignedRole = null;
        if (isChecked && autoAssignMap[fieldName]) {
          autoAssignedRole = autoAssignMap[fieldName];
          updateData[autoAssignedRole] = displayName; // Firebaseの担当者フィールドを上書き
        }

        await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), updateData);
        showToast('アップロード状況を更新しました');
        
        // ⑤ ログにも担当者自動割り当てを記録
        if (autoAssignedRole) {
          const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
          const tName = t ? (t.client || '') + ' ' + (t.site || '') : '-';
          await window.recordLog(window.currentOpenTaskId, tName, '担当者自動更新', `${autoAssignedRole} -> ${displayName}`);
          showToast(`${autoAssignedRole}の担当者を${displayName}さんに自動設定しました`);
        }
      } catch(e) { showToast('更新失敗', 'error'); }
    };

    window.handleDeliverableCheck = async function(itemKey, isChecked) {
      if (!window.currentOpenTaskId) return;
      const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
      
      let savedStatus = {};
      if (typeof t.checkStatus === 'object') {
        savedStatus = { ...t.checkStatus };
      } else if (typeof t.checkStatus === 'string') {
        try { savedStatus = JSON.parse(t.checkStatus || '{}'); } catch(e) {}
      }

      if (isChecked) savedStatus[itemKey] = true; 
      else delete savedStatus[itemKey];
      
      try {
        await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), { '成果物チェック状況': savedStatus });
      } catch(e) { showToast('チェック状態保存エラー', 'error'); }
    };

    // Firebase Storage Image Handling
    async function compressImageToWebP(file, maxWidth = 1280, quality = 0.8) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(); }, 'image/webp', quality);
        };
        img.src = URL.createObjectURL(file);
      });
    }

    window.handleImageUpload = async function(e, index) {
      const file = e.target.files[0];
      if (!file || !window.currentOpenTaskId) return;
      const overlay = document.getElementById('upload-overlay-' + index);
      if (overlay) overlay.classList.remove('hidden');
      try {
        const webpBlob = await compressImageToWebP(file);
        const dbField = index === 1 ? '画像1' : (index === 2 ? '画像2' : '伝票画像');
        const fileRef = ref(storage, 'tasks/' + window.currentOpenTaskId + '/' + dbField + '_' + Date.now() + '.webp');
        await uploadBytes(fileRef, webpBlob);
        const downloadUrl = await getDownloadURL(fileRef);
        
        // ① 更新するデータをまとめる（まずは画像のURL）
        const updateData = { [dbField]: downloadUrl };
        let autoAssignedRole = null;
        let displayName = '';
        
        // ② 伝票画像（index === 3）がアップロードされた場合、0円請求の担当者を自動設定する
        if (index === 3) {
          autoAssignedRole = '０円請求';
          const userPrefix = window.currentUser.email.split('@')[0];
          // Firebaseから取得済みの名前一覧から自分の表示名を取り出す
          displayName = (window.userNamesMap && window.userNamesMap[userPrefix]) ? window.userNamesMap[userPrefix] : userPrefix;
          updateData[autoAssignedRole] = displayName;
        }

        // ③ 画像URLと担当者を同時にFirebaseへ保存
        await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), updateData);
        
        const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
        const tName = t ? (t.client || '') + ' ' + (t.site || '') : '-';
        await window.recordLog(window.currentOpenTaskId, tName, '画像保存', dbField);
        showToast('画像を保存しました');
        
        // ④ 担当者自動更新が行われた場合、ログと画面通知（トースト）を出す
        if (autoAssignedRole) {
          await window.recordLog(window.currentOpenTaskId, tName, '担当者自動更新', `${autoAssignedRole} -> ${displayName}`);
          showToast(`${autoAssignedRole}の担当者を${displayName}さんに自動設定しました`);
        }
        
      } catch (err) {
        showToast('保存失敗', 'error');
      } finally {
        if (overlay) overlay.classList.add('hidden');
        e.target.value = ''; 
      }
    };

    window.deleteTargetImage = async function() {
      const targetName = window.targetImageIndex === 3 ? "伝票画像" : "画像" + window.targetImageIndex;
      if (!window.confirm(targetName + "を削除しますか？")) return;
      const gasField = window.targetImageIndex === 1 ? '画像1' : (window.targetImageIndex === 2 ? '画像2' : '伝票画像');
      try {
        await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), { [gasField]: '' });
        const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
        const tName = t ? (t.client || '') + ' ' + (t.site || '') : '-';
        await window.recordLog(window.currentOpenTaskId, tName, '画像削除', targetName);
        showToast(targetName + "を削除しました");
        document.getElementById('detail-img-' + window.targetImageIndex).classList.add('hidden');
        document.getElementById('detail-img-ph-' + window.targetImageIndex).classList.remove('hidden');
      } catch (e) { showToast('削除失敗', 'error'); }
      document.getElementById('image-context-menu').classList.add('hidden');
    };

    // Firebase Task Create/Update/Delete
    document.getElementById('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const taskData = {
        '測量日': document.getElementById('fm-date').value.replace(/-/g, '/'),
        'ステータス': document.getElementById('fm-status').value,
        '測量種別': document.getElementById('fm-type').value,
        '使用機器': document.getElementById('fm-equipment').value,
        'お客様名': document.getElementById('fm-client').value,
        '請求先名': document.getElementById('fm-billing').value,
        '現場名': document.getElementById('fm-site').value,
        '営業所': document.getElementById('fm-office').value,
        '営業マン': document.getElementById('fm-sales').value,
        '現場地区名': document.getElementById('fm-district').value, 
        '事務所位置': document.getElementById('fm-office-loc').value, 
        '管轄省庁': document.getElementById('fm-ministry').value,
        '社内規格値': document.getElementById('fm-standard').value,
        '飛行ルート名': document.getElementById('fm-route').value,
        'DIPS登録': document.getElementById('fm-dips').value,
        '電子基準点名': document.getElementById('fm-ref-point').value,
        '現場位置': document.getElementById('fm-mapUrl').value,
        '集合場所': document.getElementById('fm-meetUrl').value,
        'PJ': document.getElementById('fm-pjUrl').value,
        'Chat': document.getElementById('fm-chatUrl').value,
        '共有パス': document.getElementById('fm-sharePath').value
      };
      const btn = document.getElementById('btn-save-task');
      btn.innerHTML = '🔄 保存中...'; btn.disabled = true;
      try {
        const tName = (taskData['お客様名'] || '') + ' ' + (taskData['現場名'] || '');
        if (window.isEditMode) {
          const oldTask = window.tasks.find(x => x.id === window.currentOpenTaskId) || {};
          const fieldMap = {
            '測量日': 'date', 'ステータス': 'status', '測量種別': 'type', '使用機器': 'equipment',
            'お客様名': 'client', '請求先名': 'billing', '現場名': 'site', '営業所': 'office',
            '営業マン': 'salesperson', '現場地区名': 'district', '事務所位置': 'officeLoc',
            '管轄省庁': 'ministry', '社内規格値': 'standard', '飛行ルート名': 'route',
            'DIPS登録': 'dips', '電子基準点名': 'refPoint', '現場位置': 'mapUrl',
            '集合場所': 'meetUrl', 'PJ': 'pjUrl', 'Chat': 'chatUrl', '共有パス': 'sharePath'
          };
          let changes = [];
          for (let jpKey in fieldMap) {
            const enKey = fieldMap[jpKey];
            let oldVal = String(oldTask[enKey] || '').trim();
            let newVal = String(taskData[jpKey] || '').trim();
            if(enKey === 'date') oldVal = oldVal.replace(/-/g, '/'); // 比較用に日付フォーマットを揃える
            if (oldVal !== newVal) {
              let sOld = oldVal.length > 10 ? oldVal.substring(0, 10) + '..' : (oldVal || '空');
              let sNew = newVal.length > 10 ? newVal.substring(0, 10) + '..' : (newVal || '空');
              changes.push(`${jpKey}: ${sOld}→${sNew}`);
            }
          }
          let detailStr = changes.length > 0 ? changes.join(', ') : '変更なし';
          if (detailStr.length > 100) detailStr = detailStr.substring(0, 100) + '...';

          await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), taskData);
          await window.recordLog(window.currentOpenTaskId, tName, '案件編集', detailStr);
          showToast('案件を更新しました');
        } else {
          const newId = "PJ-" + new Date().getTime();
          taskData['ID'] = newId;
          await setDoc(doc(db, 'tasks', newId), taskData);
          await window.recordLog(newId, tName, '新規作成', '新規作成しました');
          showToast('新規案件を追加しました');
        }
        closeTaskModal();
      } catch (err) { showToast('保存失敗', 'error'); }
      finally { btn.innerHTML = '内容を保存する'; btn.disabled = false; }
    });

    const btnDelete = document.getElementById('btn-delete-task');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        if (!window.currentOpenTaskId) return;
        if (!window.confirm('復元できません。本当に削除しますか？')) return;
        try {
          await deleteDoc(doc(db, 'tasks', window.currentOpenTaskId));
          const t = window.tasks.find(x => x.id === window.currentOpenTaskId);
          const tName = t ? (t.client || '') + ' ' + (t.site || '') : '-';
          await window.recordLog(window.currentOpenTaskId, tName, '案件削除', '削除しました');
          showToast('案件を削除しました');
          closeTaskModal();
        } catch (err) { showToast('削除失敗', 'error'); }
      });
    }

    document.getElementById('btn-save-settings').addEventListener('click', async () => {
      const descs = {};
      window.STATUS_LIST.forEach(s => {
        const input = document.getElementById('desc-input-' + s);
        if (input) descs[s] = input.value.trim();
      });
      try {
        await setDoc(doc(db, 'settings', 'descriptions'), descs);
        window.globalStatusDescriptions = descs;
        loadStatusDescriptions();
        showToast('設定を保存しました');
        document.getElementById('settings-modal').classList.add('hidden');
      } catch(e) { showToast('設定の保存に失敗', 'error'); }
    });

    // ==========================================
    // UI関数群
    // ==========================================
    const fontSizeSelect = document.getElementById('font-size-selector');
    if(fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const size = e.target.value; localStorage.setItem('appFontSize', size); applyFontSize(size);
      });
    }

    function applyFontSize(size) {
      const root = document.documentElement;
      if (size === 'small') root.style.fontSize = '12px';
      else if (size === 'large') root.style.fontSize = '16px';
      else root.style.fontSize = '14px';
      const selector = document.getElementById('font-size-selector');
      if(selector) selector.value = size;
    }

    function initFilters() { 
      const sel = document.getElementById('search-assignee'); 
      if(!sel) return;
      sel.innerHTML = '<option value="">（全員表示）</option><option value="-">- (未設定)</option>';
      const all = new Set([...window.ASSIGNEES.design, ...window.ASSIGNEES.others]); 
      all.delete('ー'); 
      Array.from(all).sort().forEach(n => {
        const opt = document.createElement('option'); opt.value = n; opt.textContent = n; sel.appendChild(opt);
      }); 
    }

    function populateMasterDropdowns() {
      const officeSelect = document.getElementById('fm-office');
      const eqSelect = document.getElementById('fm-equipment');
      const minSelect = document.getElementById('fm-ministry');
      const searchOffice = document.getElementById('search-office');
      const searchEq = document.getElementById('search-eq');
      
      let officeHtml = '<option value="">（未選択）</option>';
      let sOfficeHtml = '<option value="">営業所</option>';
      Object.keys(window.masterData.offices || {}).forEach(o => { 
        officeHtml += '<option value="' + o + '">' + o + '</option>'; 
        sOfficeHtml += '<option value="' + o + '">' + o + '</option>'; 
      });
      if(officeSelect) officeSelect.innerHTML = officeHtml;
      if(searchOffice) searchOffice.innerHTML = sOfficeHtml;
      
      let eqHtml = '<option value="">（未選択）</option>';
      let sEqHtml = '<option value="">機器</option>';
      (window.masterData.equipments || []).forEach(e => { 
        eqHtml += '<option value="' + e + '">' + e + '</option>'; 
        sEqHtml += '<option value="' + e + '">' + e + '</option>'; 
      });
      if(eqSelect) eqSelect.innerHTML = eqHtml;
      if(searchEq) searchEq.innerHTML = sEqHtml;
      
      let minHtml = '<option value="">ー</option>';
      (window.masterData.ministries || []).forEach(m => { minHtml += '<option value="' + m + '">' + m + '</option>'; });
      if(minSelect) minSelect.innerHTML = minHtml;
    }

    const fmOffice = document.getElementById('fm-office');
    if(fmOffice) {
      fmOffice.addEventListener('change', (e) => {
        const salesSelect = document.getElementById('fm-sales');
        if(!salesSelect) return;
        let salesHtml = '<option value="">（未選択）</option>';
        const reps = window.masterData.offices[e.target.value] || [];
        reps.forEach(r => { salesHtml += '<option value="' + r + '">' + r + '</option>'; });
        salesSelect.innerHTML = salesHtml;
      });
    }

    const searchOfficeSelect = document.getElementById('search-office');
    if (searchOfficeSelect) {
      searchOfficeSelect.addEventListener('change', (e) => {
        const salesSelect = document.getElementById('search-sales');
        if(!salesSelect) return;
        let salesHtml = '<option value="">営業マン</option>';
        const reps = window.masterData.offices[e.target.value] || [];
        reps.forEach(r => { salesHtml += '<option value="' + r + '">' + r + '</option>'; });
        salesSelect.innerHTML = salesHtml;
      });
    }

    const btnToggleSearch = document.getElementById('btn-toggle-search');
    if(btnToggleSearch) {
      btnToggleSearch.addEventListener('click', () => {
        const c = document.getElementById('search-bar-container'); 
        if(c) {
          c.classList.toggle('hidden');
          if (!c.classList.contains('hidden')) document.getElementById('search-text').focus();
        }
      });
    }

    window.updateCurrentView = function() {
      if (window.currentView === 'kanban' || window.currentView === 'shared') {
        renderBoard();
      } else if (window.currentView === 'calendar') {
        renderCalendar();
      }
    }

    const btnApplySearch = document.getElementById('btn-apply-search');
    if (btnApplySearch) {
      btnApplySearch.addEventListener('click', () => {
        window.filterText = document.getElementById('search-text').value.toLowerCase();
        window.filterYear = document.getElementById('search-year').value;
        window.filterMonth = document.getElementById('search-month').value;
        window.filterOffice = document.getElementById('search-office').value;
        window.filterSales = document.getElementById('search-sales').value;
        window.filterType = document.getElementById('search-type').value;
        window.filterEq = document.getElementById('search-eq').value;
        window.filterRole = document.getElementById('search-role').value;
        window.filterAssignee = document.getElementById('search-assignee').value;
        window.updateCurrentView();
      });
    }

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        document.getElementById('search-text').value = '';
        document.getElementById('search-year').value = '';
        document.getElementById('search-month').value = '';
        document.getElementById('search-office').value = '';
        document.getElementById('search-sales').innerHTML = '<option value="">営業マン</option>';
        document.getElementById('search-type').value = '';
        document.getElementById('search-eq').value = '';
        document.getElementById('search-role').value = 'all';
        document.getElementById('search-assignee').value = '';

        window.filterText = '';
        window.filterYear = '';
        window.filterMonth = '';
        window.filterOffice = '';
        window.filterSales = '';
        window.filterType = '';
        window.filterEq = '';
        window.filterRole = 'all';
        window.filterAssignee = '';

        window.updateCurrentView();
      });
    }

    const sortOrder = document.getElementById('sort-order');
    if(sortOrder) {
      sortOrder.addEventListener('change', (e) => {
        window.currentSort = e.target.value; localStorage.setItem('sortOrder', window.currentSort); window.updateCurrentView();
      });
    }

    function getFilteredAndSortedTasks() {
      let f = window.tasks;
      if (window.filterText) f = f.filter(t => (t.client && t.client.toLowerCase().includes(window.filterText)) || (t.site && t.site.toLowerCase().includes(window.filterText)));
      
      if (window.filterYear || window.filterMonth) {
        f = f.filter(t => {
          const d = formatYYYYMMDD(t.date);
          if (!d || d === '未定') return false;
          const y = d.substring(0, 4);
          const m = d.substring(4, 6);
          if (window.filterYear && y !== window.filterYear) return false;
          if (window.filterMonth && m !== window.filterMonth) return false;
          return true;
        });
      }

      if (window.filterOffice) f = f.filter(t => t.office === window.filterOffice);
      if (window.filterSales) f = f.filter(t => t.salesperson === window.filterSales);
      if (window.filterType) f = f.filter(t => t.type === window.filterType);
      if (window.filterEq) f = f.filter(t => t.equipment === window.filterEq);

      if (window.filterAssignee) {
        f = f.filter(t => {
          const isUnassigned = (v1, v2) => { const s1 = String(v1||'').trim(); const s2 = String(v2||'').trim(); return (s1===''||s1==='ー') && (s2===''||s2==='ー'); };
          const hasAssignee = (v1, v2, target) => { return (v1 && String(v1).includes(target)) || (v2 && String(v2).includes(target)); };
          const m = { 'design':['designRep','設計担当'], 'plan':['planRep','施工計画'], 'survey':['surveyRep','測量担当'], 'pointcloud':['pointCloudRep','点群処理'], 'cross':['crossSectionRep','現況横断'], 'output':['outputRep','成果作成'], 'zeroyen':['zeroYenRep','０円請求'], 'hyouteiten':['hyouteitenRep','標定点配置図'] };
          if (window.filterRole === 'all') { 
            if (window.filterAssignee === '-') return Object.values(m).some(keys => isUnassigned(t[keys[0]], t[keys[1]]));
            else return Object.values(m).some(keys => hasAssignee(t[keys[0]], t[keys[1]], window.filterAssignee));
          } else { 
            const keys = m[window.filterRole];
            if (window.filterAssignee === '-') return isUnassigned(t[keys[0]], t[keys[1]]);
            else return hasAssignee(t[keys[0]], t[keys[1]], window.filterAssignee);
          }
        });
      }
      return f.sort((a, b) => {
        if (!a.date && b.date) return -1; if (a.date && !b.date) return 1; if (!a.date && !b.date) return 0;
        return window.currentSort === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date);
      });
    }

    function formatYYYYMMDD(dateStr) {
      if (!dateStr || dateStr === "未定" || dateStr === "") return "未定";
      let cleanDate = dateStr.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
      const d = new Date(cleanDate);
      if (isNaN(d.getTime())) return dateStr;
      return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    }

    function formatDisplayDate(dateStr) {
      if (!dateStr || dateStr === "未定" || dateStr === "") return "未定";
      let cleanDate = dateStr.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
      const d = new Date(cleanDate);
      if (isNaN(d.getTime())) return dateStr;
      return d.getFullYear() + '年' + String(d.getMonth() + 1).padStart(2, '0') + '月' + String(d.getDate()).padStart(2, '0') + '日';
    }

    function formatDateForInput(dateStr) {
      if (!dateStr || dateStr === "未定" || dateStr === "") return "";
      const d = new Date(dateStr); if (isNaN(d.getTime())) return "";
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function getIconSvg(type, eq, sizeClass) { 
      if(!sizeClass) sizeClass = "w-3.5 h-3.5";
      let color = "#22c55e"; 
      const t = type ? String(type).trim() : '';
      const e = eq ? String(eq).trim() : '';
      
      if (t.indexOf("起工") !== -1) color = "#f97316"; 
      else if (t.indexOf("出来形") !== -1) color = "#3b82f6"; 
      
      let shape = '<polygon points="8,2 14,13 2,13" fill="' + color + '" />'; 
      if (e.indexOf("TLS") !== -1) shape = '<polygon points="8,1.5 14.5,5.25 14.5,10.75 8,14.5 1.5,10.75 1.5,5.25" fill="none" stroke="' + color + '" stroke-width="2" />'; 
      else if (e.indexOf("ULS") !== -1 || e.indexOf("M400") !== -1 || e.indexOf("M600") !== -1) shape = '<polygon points="8,1 15,5 15,11 8,15 1,11 1,5" fill="' + color + '" />'; 
      
      let svgHtml = '';
      svgHtml += '<svg class="' + sizeClass + ' shrink-0 mr-1" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">';
      svgHtml += shape;
      svgHtml += '</svg>';
      return svgHtml;
    }

    function updateSearchButtonState() {
      const btn = document.getElementById('btn-toggle-search'); 
      const countEl = document.getElementById('filtered-count');
      if(!btn || !countEl) return;
      const count = countEl.textContent;
      const isFiltered = window.filterText !== '' || window.filterAssignee !== '' || window.filterYear !== '' || window.filterMonth !== '' || window.filterOffice !== '' || window.filterSales !== '' || window.filterType !== '' || window.filterEq !== '';

      if (isFiltered) {
        btn.classList.add('bg-blue-600', 'text-white', 'border-blue-500'); 
        btn.classList.remove('bg-slate-700', 'text-blue-200', 'border-slate-600'); 
        btn.innerHTML = '🔍 検索中 (' + count + '件)';
      } else {
        btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500'); 
        btn.classList.add('bg-slate-700', 'text-blue-200', 'border-slate-600'); 
        btn.innerHTML = '🔍 検索・絞り';
      }
    }

    function renderBoard() {
      document.querySelectorAll('.task-list').forEach(list => list.innerHTML = '');
      document.querySelectorAll('.count').forEach(el => el.textContent = '0');
      const filtered = getFilteredAndSortedTasks();
      const countEl = document.getElementById('filtered-count');
      if(countEl) countEl.textContent = filtered.length;
      
      filtered.forEach(task => {
        const zones = document.querySelectorAll('.drop-zone[data-status="' + task.status + '"]');
        if (zones.length === 0) return;
        
        zones.forEach(zone => {
          const countSpan = zone.querySelector('.count');
          if(countSpan) countSpan.textContent = parseInt(countSpan.textContent) + 1;
          
          const card = document.createElement('article');
          card.draggable = true; 
          let isDelayed = false;
          
          if (task.date && ["点群処理中", "横断作成中", "成果作成中", "設計待", "確認待"].includes(task.status)) {
            if ((new Date() - new Date(task.date)) / (1000 * 60 * 60 * 24) >= 14) isDelayed = true;
          }
          
          const isSidebar = ["まとめて提出", "共有移動未"].includes(task.status) && zone.closest('#view-kanban') !== null;
          const fDate = formatDisplayDate(task.date);
          const dIcon = isDelayed ? '<span title="測量日から2週間超過">⚠️</span> ' : '';
          
          let cardHtml = '';
          if (isSidebar) { 
            card.className = "bg-white p-2 rounded shadow border border-slate-200 cursor-pointer hover:border-blue-400 transition-all flex flex-col shrink-0 select-none"; 
            cardHtml += '<header class="flex justify-between items-center text-slate-500 mb-0.5 gap-1 shrink-0">';
            cardHtml += '<div class="flex items-center shrink-0 min-w-0 text-slate-800">' + getIconSvg(task.type, task.equipment) + '<span class="font-bold text-[11px] truncate leading-none">' + (task.client || '-') + '</span></div>';
            cardHtml += '<span class="font-bold text-slate-500 text-[10px] shrink-0">' + fDate + '</span></header>';
            cardHtml += '<div class="truncate text-slate-600 text-[11px] leading-tight">' + (task.site || '-') + '</div>';
          } else { 
            card.className = "select-none " + (isDelayed ? "bg-yellow-100 border-yellow-400 shadow-yellow-300" : "bg-white border-slate-200") + " rounded-lg shadow-sm border cursor-pointer hover:shadow-md hover:border-blue-400 transition-all flex flex-row overflow-hidden shrink-0 min-h-[85px]"; 
            
            let thumbHtml = '';
            if(task.image1) {
               thumbHtml += '<div class="w-20 shrink-0 bg-slate-200 border-r ' + (isDelayed ? 'border-yellow-300' : 'border-slate-200') + '">';
               thumbHtml += '<img src="' + task.image1 + '" class="w-full h-full object-cover" /></div>';
            }
            
            let footerCenterHtml = '';
            if (task.status === '設計待') {
              const designRep = task.designRep || '未設定'; 
              let daysPassedText = '-日'; 
              if (task.statusDate) {
                const today = new Date(); const startDate = new Date(task.statusDate);
                today.setHours(0,0,0,0); startDate.setHours(0,0,0,0);
                const diffTime = today.getTime() - startDate.getTime(); 
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                daysPassedText = diffDays + '日'; 
              }
              footerCenterHtml += '<div class="flex items-center gap-1 min-w-0 shrink px-1 justify-center">';
              footerCenterHtml += '<span class="text-[10px] font-bold text-cyan-800 bg-cyan-100 border border-cyan-300 px-1 py-0.5 rounded truncate max-w-[60px]" title="' + designRep + '">📐' + designRep + '</span>';
              footerCenterHtml += '<span class="text-[10px] font-bold text-red-600 bg-white border border-red-200 px-1 py-0.5 rounded shadow-sm shrink-0 whitespace-nowrap">' + daysPassedText + '経過</span></div>';
            }
            
            // バッジの表示内容と状態を判定するロジック
            let badgeText = '標定点配置図';
            let isBadgeActive = false;
            let badgeActiveClass = 'bg-blue-600 text-white border border-blue-600 shadow-sm';

            if (task.status === '予定' || task.status === '測量前準備') {
              // 予定・測量前準備の場合は「施工計画書」バッジにする（有効時は黄緑色）
              badgeText = '施工計画書';
              badgeActiveClass = 'bg-lime-500 text-white border border-lime-500 shadow-sm'; 
              
              const rawPlan = task['施工計画書'];
              if (rawPlan && typeof rawPlan === 'object') {
                isBadgeActive = rawPlan.isUploaded;
              } else if (typeof rawPlan === 'string') {
                isBadgeActive = (rawPlan.startsWith('済') || rawPlan === 'true');
              }
            } else {
              // それ以外のステータスは従来の「標定点配置図」バッジ
              const rawHyoutei = task['標定点配置武蔵'];
              if (rawHyoutei && typeof rawHyoutei === 'object') {
                isBadgeActive = rawHyoutei.isUploaded;
              } else if (typeof rawHyoutei === 'string') {
                isBadgeActive = (rawHyoutei.startsWith('済') || rawHyoutei === 'true');
              }
            }

            // バッジのクラス切り替え
            const dynamicBadgeClass = isBadgeActive
              ? badgeActiveClass
              : 'bg-slate-50 text-slate-600 border border-dashed border-slate-400';

            let contentHtml = '';
            contentHtml += '<div class="flex-1 flex flex-col min-w-0 p-2.5 h-full">';
            contentHtml += '<header class="text-[11px] text-slate-500 mb-1 flex justify-between items-center font-medium shrink-0 gap-1">';
            contentHtml += '<div class="flex items-center min-w-0 ' + (isDelayed ? 'text-yellow-800' : 'text-slate-800') + '">' + getIconSvg(task.type, task.equipment) + '<span class="font-black text-[13px] truncate leading-tight">' + (task.client || '-') + '</span></div>';
            contentHtml += '<span class="font-bold tracking-tighter leading-none shrink-0 ' + (isDelayed ? 'text-yellow-700' : 'text-slate-500') + '">' + fDate + '</span></header>';
            
            // ★ 現場名を1行表示（はみ出す場合は「...」）にするため、line-clamp-2 を truncate に変更し、高さ指定を解除
            contentHtml += '<div class="text-[13px] font-bold ' + (isDelayed ? 'text-yellow-900' : 'text-slate-700') + ' mb-1.5 truncate flex-1">' + (task.site || '-') + '</div>';
            
            // 新しいフッターレイアウト
            contentHtml += '<footer class="flex items-center shrink-0 border-t ' + (isDelayed ? 'border-yellow-200' : 'border-slate-100') + ' pt-1.5 mt-auto w-full gap-2">';
            
            // 左側：営業所 ＋ 営業マンを隣接させる
            contentHtml += '<div class="flex items-center gap-1.5 min-w-0 flex-1">';
            contentHtml += '<span class="text-[10px] font-bold ' + (isDelayed ? 'bg-yellow-50 text-yellow-700' : 'bg-slate-100 text-slate-600') + ' px-1.5 py-0.5 rounded truncate shrink-0 max-w-[55%]">' + (task.office || '-') + '</span>';
            contentHtml += '<span class="text-[10px] font-bold ' + (isDelayed ? 'text-yellow-800' : 'text-slate-500') + ' truncate shrink-0 max-w-[45%]">👤 ' + (task.salesperson || '-') + '</span>';
            contentHtml += '</div>';

            // 中央：設計待の日数など（既存の仕組みを維持）
            contentHtml += footerCenterHtml;

            // 右側：動的バッジ（★ 共有管理タブ以外の場合のみ表示）
            const isSharedView = zone.closest('#view-shared') !== null;
            if (!isSharedView) {
              // CSSの文字色強制ルール（#334155）を打ち消すため、有効時のみ直接白色を指定する
              const activeStyle = isBadgeActive ? ' style="color: #FFFFFF !important;"' : '';
              contentHtml += '<span class="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded shrink-0 ml-auto ' + dynamicBadgeClass + '"' + activeStyle + '>' + badgeText + '</span>';
            }
            
            contentHtml += '</footer></div>';
            
            cardHtml = thumbHtml + contentHtml;
          }
          
          card.innerHTML = cardHtml;
          card.addEventListener('click', () => openDetailModal(task)); 
          card.addEventListener('dragstart', (e) => { 
            e.dataTransfer.setData('taskId', task.id); 
            setTimeout(() => card.classList.add('opacity-40'), 0); 
          }); 
          card.addEventListener('dragend', () => card.classList.remove('opacity-40')); 
          const tList = zone.querySelector('.task-list');
          if(tList) tList.appendChild(card);
        });
      }); 
      updateSearchButtonState();
    }

    function setupDragAndDrop() {
      document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => { zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', (e) => {
          e.preventDefault(); zone.classList.remove('drag-over');
          window.handleDrop(e.dataTransfer.getData('taskId'), zone.getAttribute('data-status'));
        });
      });
      }

    function loadStatusDescriptions() {
      const descs = window.globalStatusDescriptions; 
      document.querySelectorAll('.status-desc').forEach(el => {
        const key = el.getAttribute('data-status-key');
        if (descs[key]) { el.textContent = descs[key]; el.classList.remove('hidden'); } 
        else { el.textContent = ''; el.classList.add('hidden'); }
      });
    }

    function renderSettingsDescInputs() { 
      const descs = window.globalStatusDescriptions; 
      const container = document.getElementById('status-desc-inputs');
      if(!container) return;
      
      let cHtml = '';
      window.STATUS_LIST.forEach(s => {
        cHtml += '<div class="flex flex-col gap-1.5">';
        cHtml += '<label class="text-xs font-bold text-slate-500">' + s + '</label>';
        cHtml += '<input type="text" id="desc-input-' + s + '" value="' + (descs[s] || '') + '" placeholder="説明なし" class="border border-slate-300 rounded p-2 text-sm outline-none focus:border-blue-500" />';
        cHtml += '</div>';
      });
      container.innerHTML = cHtml;
    }

    const btnSettings = document.getElementById('btn-settings');
    if(btnSettings) {
      btnSettings.addEventListener('click', () => { 
        renderSettingsDescInputs(); 
        document.getElementById('settings-modal').classList.remove('hidden'); 
      });
    }

    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    if(btnCancelSettings) {
      btnCancelSettings.addEventListener('click', () => { document.getElementById('settings-modal').classList.add('hidden'); });
    }
    
    window.openDetailModal = function(task) {
      window.currentOpenTaskId = task.id; 
      
      const btnChat = document.getElementById('detail-btn-chat');
      if (task.chatUrl) {
        btnChat.href = task.chatUrl;
        btnChat.style.opacity = '1'; btnChat.style.pointerEvents = 'auto'; btnChat.style.filter = 'none';
      } else {
        btnChat.href = '#';
        btnChat.style.opacity = '0.5'; btnChat.style.pointerEvents = 'none'; btnChat.style.filter = 'grayscale(100%)';
      }

      const btnPj = document.getElementById('detail-btn-pj');
      if (task.pjUrl) {
        btnPj.href = task.pjUrl;
        btnPj.style.opacity = '1'; btnPj.style.pointerEvents = 'auto'; btnPj.style.filter = 'none';
      } else {
        btnPj.href = '#';
        btnPj.style.opacity = '0.5'; btnPj.style.pointerEvents = 'none'; btnPj.style.filter = 'grayscale(100%)';
      }

      document.getElementById('detail-title-icon').innerHTML = getIconSvg(task.type, task.equipment, 'w-10 h-10');
      document.getElementById('detail-title-main').textContent = task.client || 'お客様名未設定';
      document.getElementById('detail-subtitle').textContent = task.site || '現場名未設定';
      document.getElementById('detail-date').textContent = formatDisplayDate(task.date);
      
      const statusColors = { 
        "予定": "bg-slate-300 text-slate-800 border-slate-400", 
        "測量前準備": "bg-yellow-200 text-yellow-800 border-yellow-400", 
        "点群処理中": "bg-blue-200 text-blue-800 border-blue-400", 
        "横断作成中": "bg-orange-200 text-orange-800 border-orange-400", 
        "成果作成中": "bg-indigo-200 text-indigo-800 border-indigo-400", 
        "設計待": "bg-cyan-200 text-cyan-800 border-cyan-400", 
        "確認待": "bg-purple-200 text-purple-800 border-purple-400", 
        "０円請求未": "bg-red-200 text-red-800 border-red-400", 
        "まとめて提出": "bg-gray-200 text-gray-800 border-gray-400", 
        "共有移動未": "bg-pink-200 text-pink-800 border-pink-400", 
        "共有に移動済": "bg-green-200 text-green-800 border-green-400", 
        "新宮担当": "bg-teal-200 text-teal-800 border-teal-400" 
      };
      
      const statusEl = document.getElementById('detail-status');
      statusEl.textContent = task.status || '予定';
      statusEl.className = 'font-bold border px-2 py-0.5 rounded shadow-sm ' + (statusColors[task.status] || statusColors["予定"]);
      
      document.getElementById('detail-type').textContent = task.type || '未設定'; 
      document.getElementById('detail-equipment').textContent = task.equipment || '未設定';
      document.getElementById('detail-office').textContent = task.office || '未設定';
      document.getElementById('detail-sales').textContent = task.salesperson || '未設定';
      document.getElementById('detail-billing').textContent = task.billing || '未設定';
      document.getElementById('detail-district').textContent = task.district || '未設定';
      document.getElementById('detail-ref-point').textContent = task.refPoint || '未設定';
      document.getElementById('detail-route').textContent = task.route || '未設定';
      
      document.getElementById('detail-dips-container').innerHTML = renderRadioGroup('DIPS登録', ['未登録', '登録済'], task.dips);
      const ministriesOpts = window.masterData.ministries.length > 0 ? window.masterData.ministries : ['国交省', '農水省', '民間'];
      document.getElementById('detail-ministry-container').innerHTML = renderRadioGroup('管轄省庁', ministriesOpts, task.ministry);
      document.getElementById('detail-standard-container').innerHTML = renderRadioGroup('社内規格値', ['なし', '80％', '50％'], task.standard);
      
      document.getElementById('detail-share-path').textContent = task.sharePath || '未登録';
      
      let dTypeClass = 'flex-1 min-w-0 text-sm font-bold truncate ';
      if (task.type && task.type.indexOf("起工") !== -1) dTypeClass += "text-orange-600";
      else dTypeClass += "text-blue-600";
      document.getElementById('detail-type').className = dTypeClass;
      
      const img1 = document.getElementById('detail-img-1'); const ph1 = document.getElementById('detail-img-ph-1');
      if (task.image1) { img1.src = task.image1; img1.classList.remove('hidden'); ph1.classList.add('hidden'); } else { img1.src = ''; img1.classList.add('hidden'); ph1.classList.remove('hidden'); }
      const img2 = document.getElementById('detail-img-2'); const ph2 = document.getElementById('detail-img-ph-2');
      if (task.image2) { img2.src = task.image2; img2.classList.remove('hidden'); ph2.classList.add('hidden'); } else { img2.src = ''; img2.classList.add('hidden'); ph2.classList.remove('hidden'); }
      const img3 = document.getElementById('detail-img-3'); const ph3 = document.getElementById('detail-img-ph-3');
      if (task.slipImage) { img3.src = task.slipImage; img3.classList.remove('hidden'); ph3.classList.add('hidden'); } else { img3.src = ''; img3.classList.add('hidden'); ph3.classList.remove('hidden'); }
      
      const roles = [
        { id: 'design', key: 'designRep', jp: '設計担当', list: window.ASSIGNEES.design, selectColorClass: 'bg-white' },
        { id: 'plan', key: 'planRep', jp: '施工計画', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'survey', key: 'surveyRep', jp: '測量担当', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'pointcloud', key: 'pointCloudRep', jp: '点群処理', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'cross', key: 'crossSectionRep', jp: '現況横断', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'hyouteiten', key: 'hyouteitenRep', jp: '標定点配置図', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'output', key: 'outputRep', jp: '成果作成', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' },
        { id: 'zeroyen', key: 'zeroYenRep', jp: '０円請求', list: window.ASSIGNEES.others, selectColorClass: 'bg-white' }
      ];
      
      const cont = document.getElementById('assignees-container'); 
      let rolesHtml = '';
      roles.forEach((r, index) => {
        let selected = (task[r.key]) ? task[r.key].split(',').map(s => s.trim()) : ['ー'];
        let disp = selected.join(', '); 
        if (disp.length > 12) disp = disp.substring(0, 12) + '...';
        
        let optsHtml = '';
        r.list.forEach(opt => { 
          const checked = selected.includes(opt) ? 'checked' : '';
          optsHtml += '<label class="multi-select-item"><input type="checkbox" value="' + opt + '" ' + checked + ' onchange="handleCheckboxChange(this, \'' + r.id + '\')" />' + opt + '</label>'; 
        });
        selected.forEach(v => { 
          if (!r.list.includes(v) && v !== 'ー') { 
            optsHtml += '<label class="multi-select-item"><input type="checkbox" value="' + v + '" checked onchange="handleCheckboxChange(this, \'' + r.id + '\')" />' + v + ' (外)</label>'; 
          } 
        });
        
        const menuClass = 'multi-select-menu open-up'; 
        const isRightEdge = (index % 4 === 3); 
        const borderClass = isRightEdge ? 'md:pr-3' : 'md:border-r md:border-slate-300 md:pr-3 md:mr-3';
        
        rolesHtml += '<div class="' + borderClass + ' select-none">';
        rolesHtml += '<div class="text-slate-500 font-bold text-xs mb-1.5">' + r.jp + '</div>';
        rolesHtml += '<div class="multi-select-dropdown" id="dropdown-' + r.id + '">';
        rolesHtml += '<button type="button" class="multi-select-button ' + r.selectColorClass + ' shadow-sm border border-slate-300 w-full hover:bg-slate-50 transition-colors" onclick="toggleMultiSelect(\'' + r.id + '\')">';
        rolesHtml += '<span id="displayText-' + r.id + '" class="truncate">' + disp + '</span></button>';
        rolesHtml += '<div class="' + menuClass + '" id="menu-' + r.id + '">' + optsHtml + '</div></div></div>';
      });
      cont.innerHTML = rolesHtml;
      document.addEventListener('click', closeAllMultiSelects);
      
      const mapDiv = document.getElementById('detail-map');
      if(task.mapUrl) {
        mapDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-blue-500 text-base">📍</span><a href="' + task.mapUrl + '" target="_blank" class="text-blue-600 font-bold hover:underline truncate">現場位置 (Google Maps)</a></div>';
      } else {
        mapDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-slate-300 text-base">📍</span><span class="text-slate-400 font-medium">現場位置 未登録</span></div>';
      }
      
      const meetDiv = document.getElementById('detail-meet-map');
      if(task.meetUrl) {
        meetDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-emerald-500 text-base">📍</span><a href="' + task.meetUrl + '" target="_blank" class="text-emerald-600 font-bold hover:underline truncate">集合場所 (Google Maps)</a></div>';
      } else {
        meetDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-slate-300 text-base">📍</span><span class="text-slate-400 font-medium">集合場所 未登録</span></div>';
      }

      const officeDiv = document.getElementById('detail-office-loc');
      if(task.officeLoc) {
        officeDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-indigo-500 text-base">🏢</span><a href="' + task.officeLoc + '" target="_blank" class="text-indigo-600 font-bold hover:underline truncate">事務所位置 (Google Maps)</a></div>';
      } else {
        officeDiv.innerHTML = '<div class="flex items-center gap-2"><span class="text-slate-300 text-base">🏢</span><span class="text-slate-400 font-medium">事務所位置 未登録</span></div>';
      }
      
      // ご指定の順番の配列（縦1列に並べる）
      const uploadItems = [
        '施工計画書', '飛行ルート', 'TSC観測データ', 'TLS_data', 'YS・Base', 
        'Photo・オルソ', 'DGN', 'XPT・XPTC', '現況横断武蔵', '標定点配置武蔵', '成果物ZIP'
      ];
      const uploadCont = document.getElementById('upload-status-container'); 
      let uploadHtml = '';
      
      uploadItems.forEach((item) => {
        const rawVal = task[item];
        let isChecked = false;
        let text = '';
        
        // オブジェクトと文字列の両対応ロジック
        if (rawVal && typeof rawVal === 'object') {
          isChecked = rawVal.isUploaded;
          if (isChecked && rawVal.user) {
            // ★ window.userNamesMap から取得。取れなければ rawVal.user をそのまま使う
            const displayName = (window.userNamesMap && window.userNamesMap[rawVal.user]) ? window.userNamesMap[rawVal.user] : rawVal.user;
            const dateTimeStr = ((rawVal.date || '') + ' ' + (rawVal.time || '')).trim();
            text = dateTimeStr ? (displayName + ' ｜ ' + dateTimeStr) : displayName;
          }
        } else if (typeof rawVal === 'string') {
          isChecked = (rawVal.startsWith('済') || rawVal === 'true');
          if (isChecked && rawVal.replace('済', '').trim().length > 0) {
            text = rawVal.replace(/^済\s*/, '').replace(/^\(/, '').replace(/\)$/, '');
            if (window.userNamesMap) {
              for (const [prefix, name] of Object.entries(window.userNamesMap)) {
                if (text.includes(prefix)) {
                  text = text.replace(new RegExp(prefix + '\\s*'), name + ' ｜ ');
                  break;
                }
              }
            }
          }
        }

        // textがある場合は右側に青いバッジとして配置する
        let infoHtml = '';
        if (text) {
          infoHtml = '<div class="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap shrink-0">' + text + '</div>';
        }
            
        uploadHtml += '<div class="flex items-center justify-between border-b border-dashed border-slate-200 last:border-0 py-2.5">';
        uploadHtml += '<label class="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-blue-600 transition-colors font-bold min-w-0">';
        uploadHtml += '<input type="checkbox" class="w-4 h-4 cursor-pointer shrink-0" ' + (isChecked ? 'checked' : '') + ' onchange="handleUploadCheck(\'' + item + '\', this.checked)" />';
        uploadHtml += '<span class="truncate text-sm" title="' + item + '">' + item + '</span></label>';
        uploadHtml += infoHtml;
        uploadHtml += '</div>';
      });
      uploadCont.innerHTML = uploadHtml;

      const btnToggleCheck = document.getElementById('btn-toggle-check'); 
      const chkCont = document.getElementById('deliverable-check-container'); 
      const chkTitle = document.getElementById('deliverable-check-title'); 
      
      // 機材が未設定、またはTLS以外の別機材（Hovermap等）の場合は、デフォルトでULSとして扱う
      let eqType = 'ULS'; 
      if (task.equipment && task.equipment.indexOf('TLS') !== -1) {
        eqType = 'TLS';
      }
      // 余計な空白が入っている場合を考慮して trim() で取り除く
      const ministryType = (task.ministry || '民間').trim(); 
      const surveyType = (task.type || '起工').trim();
      const baseSurveyType = surveyType.replace('測量', '');
      
      let targetChecks = [];
      if (eqType) {
        targetChecks = (window.masterData.checkMaster || []).filter(c => {
          if (!c.key) return false;
          return c.key.indexOf(ministryType) !== -1 && 
                 c.key.indexOf(eqType) !== -1 && 
                 c.key.indexOf(baseSurveyType) !== -1;
        });

        // ★追加: 国交省や農水省で専用のリストが登録されていない場合は、「民間」のリストを代替表示する
        if (targetChecks.length === 0 && ministryType !== '民間') {
          targetChecks = (window.masterData.checkMaster || []).filter(c => {
            if (!c.key) return false;
            return c.key.indexOf('民間') !== -1 && 
                   c.key.indexOf(eqType) !== -1 && 
                   c.key.indexOf(baseSurveyType) !== -1;
          });
        }
      }
      
      if (targetChecks.length === 0) {
        btnToggleCheck.classList.add('hidden'); 
        chkCont.innerHTML = '';
      } else {
        btnToggleCheck.classList.remove('hidden'); 
        btnToggleCheck.classList.add('flex'); 
        if (chkTitle) chkTitle.innerHTML = '📋 ' + ministryType + ' ' + eqType + surveyType + '成果チェック';
        
        let savedStatus = {}; 
        if (typeof task.checkStatus === 'object') {
          savedStatus = task.checkStatus;
        } else if (typeof task.checkStatus === 'string') {
          try { savedStatus = JSON.parse(task.checkStatus || '{}'); } catch(e) {}
        }

        let checkHtml = ''; 
        let currentLargeCat = ''; 
        let currentMidCat = ''; 
        
        targetChecks.forEach(c => {
          if (currentLargeCat !== c.largeCat) { 
            currentLargeCat = c.largeCat; 
            checkHtml += '<div class="font-bold text-sm text-white bg-slate-600 px-3 py-1.5 rounded shadow-sm mt-4 mb-2 flex items-center gap-2 sticky top-0 z-10"><span class="text-lg">📁</span>' + currentLargeCat + '</div>'; 
          }
          if (c.midCat && currentMidCat !== c.midCat) { 
            currentMidCat = c.midCat; 
            checkHtml += '<div class="font-bold text-xs text-slate-700 bg-slate-200 border-l-4 border-slate-500 px-2 py-1 mt-3 mb-1 ml-1 rounded-r shadow-sm w-max max-w-[95%]">' + currentMidCat + '</div>'; 
          }
          const itemKey = c.midCat + '_' + c.item; 
          const isChecked = savedStatus[itemKey] ? 'checked' : '';
          
          checkHtml += '<div class="flex items-start text-sm pl-4 py-2 hover:bg-blue-50 rounded transition-colors border-b border-dashed border-slate-200 last:border-0">';
          checkHtml += '<label class="flex items-start gap-2.5 cursor-pointer w-full">';
          checkHtml += '<input type="checkbox" class="w-4 h-4 mt-[3px] cursor-pointer text-blue-600 rounded border-slate-300 shrink-0" ' + isChecked + ' onchange="handleDeliverableCheck(\'' + itemKey + '\', this.checked)" />';
          checkHtml += '<div class="flex-1 leading-relaxed text-slate-800 font-medium">' + c.item + '</div>';
          checkHtml += '</label></div>';
        });
        chkCont.innerHTML = checkHtml;
      }
      document.getElementById('detail-modal').classList.remove('hidden');
    }

    window.renderRadioGroup = function(fieldName, options, currentVal) {
      let rHtml = '<div class="flex flex-col gap-y-2">';
      options.forEach(opt => {
        const checked = (opt === currentVal) ? 'checked' : '';
        rHtml += '<label class="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors">';
        rHtml += '<input type="radio" name="radio-' + fieldName + '" value="' + opt + '" ' + checked + ' class="w-4 h-4 cursor-pointer text-blue-600 focus:ring-blue-500 border-gray-300" onchange="handleRadioChange(\'' + fieldName + '\', this.value)" />';
        rHtml += '<span>' + opt + '</span></label>';
      });
      rHtml += '</div>'; 
      return rHtml;
    }

    window.handleRadioChange = async function(fieldName, value) {
      if (!window.currentOpenTaskId) return;
      try { await updateDoc(doc(db, 'tasks', window.currentOpenTaskId), { [fieldName]: value }); showToast(fieldName + 'を更新しました'); } catch(e) { showToast('更新失敗', 'error'); }
    }

    window.openEditFromDetail = function() {
      const idToEdit = window.currentOpenTaskId; closeDetailModal(); window.openTaskModal(idToEdit);
    }

    window.closeDetailModal = function() { 
      document.getElementById('detail-modal').classList.add('hidden'); 
      window.currentOpenTaskId = null; 
      document.removeEventListener('click', closeAllMultiSelects); 
      const article = document.getElementById('detail-article'); 
      const panel = document.getElementById('deliverable-check-panel');
      if(panel && article) {
        panel.classList.remove('w-[420px]', 'opacity-100'); 
        panel.classList.add('w-0', 'opacity-0'); 
        article.classList.remove('w-[1420px]', 'max-w-[1420px]'); 
        article.classList.add('w-[1000px]', 'max-w-[1000px]');
      }
      if (currentTodoUnsubscribe) {
        currentTodoUnsubscribe();
        currentTodoUnsubscribe = null;
      }
      closeTodoForm();
    }

    window.toggleDeliverableCheck = function() {
      const article = document.getElementById('detail-article'); 
      const panel = document.getElementById('deliverable-check-panel');
      if(!panel || !article) return;
      
      if (panel.classList.contains('w-0')) { 
        article.classList.remove('w-[1000px]', 'max-w-[1000px]'); 
        article.classList.add('w-[1420px]', 'max-w-[1420px]'); 
        panel.classList.remove('w-0', 'opacity-0'); 
        panel.classList.add('w-[420px]', 'opacity-100'); 
      } else { 
        panel.classList.remove('w-[420px]', 'opacity-100'); 
        panel.classList.add('w-0', 'opacity-0'); 
        setTimeout(() => { 
          article.classList.remove('w-[1420px]', 'max-w-[1420px]'); 
          article.classList.add('w-[1000px]', 'max-w-[1000px]'); 
        }, 300); 
      }
    }

    window.toggleMultiSelect = function(roleId) {
      const m = document.getElementById('menu-' + roleId); 
      if(!m) return;
      const o = m.classList.contains('open');
      document.querySelectorAll('.multi-select-menu').forEach(x => x.classList.remove('open'));
      if (!o) m.classList.add('open');
    }

    function closeAllMultiSelects(e) {
      if (e.target.closest('.multi-select-dropdown')) return;
      document.querySelectorAll('.multi-select-menu').forEach(m => m.classList.remove('open'));
    }

    window.openTaskModal = function(taskId) {
      window.isEditMode = !!taskId; 
      window.currentOpenTaskId = taskId; 
      document.getElementById('modal-title').innerHTML = window.isEditMode ? '📝 案件情報の編集' : '➕ 新規案件の追加';
      document.getElementById('task-form').reset(); 
      populateMasterDropdowns(); 
      
      if (window.isEditMode) {
        document.getElementById('btn-delete-task').classList.remove('hidden');
        const t = window.tasks.find(x => x.id === taskId);
        if (t) {
          document.getElementById('edit-title-icon').innerHTML = getIconSvg(t.type, t.equipment, 'w-10 h-10');
          document.getElementById('fm-date').value = formatDateForInput(t.date);
          document.getElementById('fm-status').value = t.status || '予定';
          document.getElementById('fm-type').value = t.type || '';
          document.getElementById('fm-equipment').value = t.equipment || '';
          document.getElementById('fm-client').value = t.client || '';
          document.getElementById('fm-billing').value = t.billing || '';
          document.getElementById('fm-site').value = t.site || '';
          document.getElementById('fm-office').value = t.office || '';
          
          const reps = window.masterData.offices[t.office] || []; 
          const salesSelect = document.getElementById('fm-sales'); 
          let salesHtml = '<option value="">（未選択）</option>'; 
          reps.forEach(r => { salesHtml += '<option value="' + r + '">' + r + '</option>'; });
          if(salesSelect) salesSelect.innerHTML = salesHtml;
          
          document.getElementById('fm-sales').value = t.salesperson || '';
          document.getElementById('fm-district').value = t.district || ''; 
          document.getElementById('fm-office-loc').value = t.officeLoc || ''; 
          document.getElementById('fm-ministry').value = t.ministry || '';
          document.getElementById('fm-standard').value = t.standard || '';
          document.getElementById('fm-route').value = t.route || '';
          document.getElementById('fm-dips').value = t.dips || '';
          document.getElementById('fm-ref-point').value = t.refPoint || '';
          document.getElementById('fm-mapUrl').value = t.mapUrl || '';
          document.getElementById('fm-meetUrl').value = t.meetUrl || '';
          document.getElementById('fm-pjUrl').value = t.pjUrl || '';
          document.getElementById('fm-chatUrl').value = t.chatUrl || '';
          document.getElementById('fm-sharePath').value = t.sharePath || '';
        }
      } else {
        document.getElementById('btn-delete-task').classList.add('hidden');
        document.getElementById('fm-status').value = '予定';
        document.getElementById('edit-title-icon').innerHTML = '✨';
      }
      document.getElementById('task-modal').classList.remove('hidden');
    }

    window.closeTaskModal = function() { 
      document.getElementById('task-modal').classList.add('hidden'); 
      window.currentOpenTaskId = null; 
    }

    const btnNewTask = document.getElementById('btn-new-task');
    if(btnNewTask) btnNewTask.addEventListener('click', () => window.openTaskModal(null));

    window.handleContextMenu = function(e, index) {
      e.preventDefault(); 
      const task = window.tasks.find(t => t.id === window.currentOpenTaskId);
      if (!task || (index === 1 && !task.image1) || (index === 2 && !task.image2) || (index === 3 && !task.slipImage)) return;
      window.targetImageIndex = index;
      const contextMenu = document.getElementById('image-context-menu');
      if(contextMenu) {
        contextMenu.style.left = e.clientX + 'px'; 
        contextMenu.style.top = e.clientY + 'px'; 
        contextMenu.classList.remove('hidden');
      }
    }

    document.addEventListener('click', () => {
      const cMenu = document.getElementById('image-context-menu');
      if(cMenu) cMenu.classList.add('hidden');
    });

    window.viewImageFullscreen = function() {
      const task = window.tasks.find(t => t.id === window.currentOpenTaskId);
      const imgSrc = window.targetImageIndex === 1 ? task.image1 : (window.targetImageIndex === 2 ? task.image2 : task.slipImage);
      if (imgSrc) { 
        document.getElementById('viewer-img').src = imgSrc; 
        document.getElementById('image-viewer-modal').classList.remove('hidden'); 
      }
    }

    window.closeImageViewer = function() { 
      document.getElementById('image-viewer-modal').classList.add('hidden'); 
      document.getElementById('viewer-img').src = ''; 
    }
    
    // --- Calendar Views ---
    window.switchView = function(view) {
      window.currentView = view;
      ['kanban', 'shared', 'calendar', 'logs'].forEach(v => {
        const vEl = document.getElementById('view-' + v);
        if(vEl) vEl.classList.toggle('hidden', v !== view);
        
        const tEl = document.getElementById('tab-' + v);
        if(tEl) {
          tEl.classList.toggle('bg-slate-50', v === view);
          tEl.classList.toggle('bg-slate-300', v !== view);
        }
      });
      if (view === 'logs') window.loadLogs();
      else window.updateCurrentView();
    }

    window.changeMonth = function(diff) {
      window.currentCalMonth += diff;
      if (window.currentCalMonth < 0) { window.currentCalMonth = 11; window.currentCalYear--; }
      else if (window.currentCalMonth > 11) { window.currentCalMonth = 0; window.currentCalYear++; }
      renderCalendar();
    }

    function renderCalendar() {
      if (window.currentView !== 'calendar') return;
      const grid = document.getElementById('calendar-grid'); 
      if(!grid) return;
      grid.innerHTML = '';
      const firstDay = new Date(window.currentCalYear, window.currentCalMonth, 1);
      const lastDay = new Date(window.currentCalYear, window.currentCalMonth + 1, 0);
      document.getElementById('calendar-month-title').textContent = window.currentCalYear + '年 ' + (window.currentCalMonth + 1) + '月';
      
      const startDayOfWeek = firstDay.getDay(); 
      const totalDays = lastDay.getDate();
      const filteredTasks = getFilteredAndSortedTasks(); 
      const prevMonthLastDay = new Date(window.currentCalYear, window.currentCalMonth, 0).getDate();
      
      let dayCount = 1; 
      let nextMonthDayCount = 1; 
      let gridHtml = '';
      
      for (let i = 0; i < 42; i++) {
        let displayDate = ""; 
        let isCurrentMonth = false; 
        let cellDateStr = "";
        let targetYear = window.currentCalYear; 
        let targetMonth = window.currentCalMonth;
        
        if (i < startDayOfWeek) { 
          displayDate = prevMonthLastDay - startDayOfWeek + i + 1; 
          targetMonth = window.currentCalMonth - 1; 
        } else if (dayCount <= totalDays) { 
          displayDate = dayCount; 
          isCurrentMonth = true; 
          dayCount++; 
        } else { 
          displayDate = nextMonthDayCount; 
          nextMonthDayCount++; 
          targetMonth = window.currentCalMonth + 1; 
        }
        
        if (targetMonth < 0) { targetMonth = 11; targetYear--; } 
        else if (targetMonth > 11) { targetMonth = 0; targetYear++; }
        
        cellDateStr = targetYear + String(targetMonth + 1).padStart(2, '0') + String(displayDate).padStart(2, '0');
        const isToday = new Date().toDateString() === new Date(targetYear, targetMonth, displayDate).toDateString();
        const todayClass = isToday ? "bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-md text-sm font-black" : (isCurrentMonth ? "text-slate-700 w-7 h-7 flex items-center justify-center text-sm font-bold" : "text-slate-400 w-7 h-7 flex items-center justify-center text-sm font-bold");
        
        let cellClass = "min-h-[120px] flex flex-col p-2 drop-zone-cal transition-colors border ";
        if (!isCurrentMonth) {
          cellClass += "bg-slate-50 border-slate-200 opacity-60";
        } else if (i % 7 === 0) { // 日曜日
          cellClass += "bg-red-50 border-slate-100";
        } else if (i % 7 === 6) { // 土曜日
          cellClass += "bg-blue-50 border-slate-100";
        } else {
          cellClass += "bg-white border-slate-100";
        }
        
        const dayTasks = filteredTasks.filter(t => formatYYYYMMDD(t.date) === cellDateStr);
        let tasksHtml = '';
        
        dayTasks.forEach(task => {
          let isDelayed = false;
          if (["点群処理中", "横断作成中", "成果作成中", "設計待", "確認待"].includes(task.status)) { 
            if ((new Date() - new Date(task.date)) / (1000 * 60 * 60 * 24) >= 14) isDelayed = true; 
          }
          const dragAttr = 'draggable="true" ondragstart="handleDragStartCalendar(event, \'' + task.id + '\')" ondragend="handleDragEndCalendar(event)"';
          
          let stColor = "bg-white border-slate-300 text-slate-800 hover:border-blue-500 hover:bg-blue-50";
          if(task.status === "予定") stColor = "bg-slate-100 border-slate-400 text-slate-700 hover:border-blue-500";
          else if(task.status === "設計待") stColor = "bg-cyan-100 border-cyan-300 text-cyan-900 hover:border-cyan-600";
          else if(task.status === "確認待") stColor = "bg-purple-100 border-purple-300 text-purple-900 hover:border-purple-600";
          else if(task.status === "０円請求未") stColor = "bg-red-100 border-red-300 text-red-900 hover:border-red-600";
          
          let exClass = isDelayed ? 'border-yellow-500 bg-yellow-100 shadow-yellow-200/50' : '';
          
          tasksHtml += '<div class="' + stColor + ' border-2 rounded shadow-sm px-1.5 py-1 mb-1.5 cursor-pointer transition-all select-none ' + exClass + '" onclick="window.openDetailModalFromId(\'' + task.id + '\')" ' + dragAttr + '>';
          tasksHtml += '<div class="flex items-center text-[11px] min-w-0">';
          tasksHtml += getIconSvg(task.type, task.equipment, 'w-3.5 h-3.5 mr-1 shrink-0');
          tasksHtml += '<span class="font-bold truncate mr-1.5 shrink-0 max-w-[50%]">' + (task.client || '-') + '</span>';
          tasksHtml += '<span class="text-slate-600 font-medium truncate">' + (task.site || '-') + '</span>';
          tasksHtml += '</div></div>';
        });
        
        const cDateAttr = targetYear + '/' + String(targetMonth + 1).padStart(2, '0') + '/' + String(displayDate).padStart(2, '0');
        gridHtml += '<div class="' + cellClass + '" data-date="' + cDateAttr + '">';
        gridHtml += '<header class="mb-1.5 flex justify-end"><span class="' + todayClass + '">' + displayDate + '</span></header>';
        gridHtml += '<div class="flex-1 overflow-y-auto px-0.5 pb-1 space-y-1">' + tasksHtml + '</div></div>';
      }
      
      grid.innerHTML = gridHtml;
      setupCalendarDragAndDrop();
    }

    window.openDetailModalFromId = function(taskId) {
      const task = window.tasks.find(t => t.id === taskId); 
      if(task) openDetailModal(task);
    }

    window.handleDragStartCalendar = function(e, taskId) { 
      e.dataTransfer.setData('taskId', taskId); 
      setTimeout(() => e.target.classList.add('opacity-40'), 0); 
    }

    window.handleDragEndCalendar = function(e) { 
      e.target.classList.remove('opacity-40'); 
    }

    function setupCalendarDragAndDrop() {
      document.querySelectorAll('.drop-zone-cal').forEach(zone => {
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('bg-blue-50'); });
        zone.addEventListener('dragleave', () => { zone.classList.remove('bg-blue-50'); });
        zone.addEventListener('drop', (e) => {
          e.preventDefault(); 
          zone.classList.remove('bg-blue-50');
          const taskId = e.dataTransfer.getData('taskId'); 
          const newDateStr = zone.getAttribute('data-date');
          if(taskId && newDateStr) window.handleDropDate(taskId, newDateStr);
        });
      });
    }

    let toastTimeout;
    function showToast(msg, type) {
      const isErr = (type === 'error');
      const toast = document.getElementById('toast'); 
      document.getElementById('toast-msg').innerText = msg; 
      document.getElementById('toast-icon').innerText = isErr ? '⚠️' : '✅';
      
      toast.className = 'fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-2xl text-white flex items-center gap-3 z-[110] transition-all duration-300 transform translate-y-0 opacity-100 ' + (isErr ? 'bg-red-600' : 'bg-slate-800');
      
      toast.classList.remove('hidden'); 
      clearTimeout(toastTimeout);
      
      toastTimeout = setTimeout(() => { 
          toast.classList.add('translate-y-20', 'opacity-0'); 
          setTimeout(() => toast.classList.add('hidden'), 300); 
        }, 3000);
      }

      // ==========================================
      // ToDo機能のロジック
      // ==========================================
      let currentTodoUnsubscribe = null;
      window.allTodos = []; // 全タスクデータを保持

      // ====== タブ切り替えの拡張 ======
      window.switchView = function(view) {
        window.currentView = view;
        ['kanban', 'shared', 'tasks', 'calendar', 'logs'].forEach(v => {
          const vEl = document.getElementById('view-' + v);
          if(vEl) vEl.classList.toggle('hidden', v !== view);
          
          const tEl = document.getElementById('tab-' + v);
          if(tEl) {
            // アクティブタブのスタイル
            if (v === view) {
              tEl.className = "px-5 py-2 bg-white border-t border-l border-r border-slate-300 rounded-t-lg font-bold text-blue-700 relative top-[1px] shadow-sm z-10 transition-colors cursor-pointer";
            } else {
              tEl.className = "px-5 py-2 bg-slate-300 border border-slate-300 rounded-t-lg font-bold text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer";
            }
          }
        });
        
        if (view === 'logs') window.loadLogs();
        else if (view === 'tasks') renderTasksTab();
        else window.updateCurrentView();
      }

      // ====== アプリ起動時に全ToDoを監視 ======
      function setupRealtimeTodos() {
        const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'));
        onSnapshot(q, (snapshot) => {
          window.allTodos = [];
          snapshot.forEach(docSnap => {
            window.allTodos.push({ id: docSnap.id, ...docSnap.data() });
          });
          // 開いている画面に合わせて再描画
          if (window.currentView === 'tasks') renderTasksTab();
          if (window.currentOpenTaskId) loadTodosForTask(window.currentOpenTaskId);
        });
      }

      // ログイン後に呼び出し
      const originalAuthChanged = onAuthStateChanged;
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          window.currentUser = user;
          sessionStorage.setItem('isLoggedIn', 'true');
          sessionStorage.setItem('userName', user.email);
          sessionStorage.setItem('userRole', '編集者');
          document.getElementById('login-screen').classList.add('hidden');
          document.getElementById('main-app').classList.remove('hidden');
          
          await loadMasterDataFromFirebase();
          await loadUserNamesFromFirebase(); // ← これが終わるのを待ってから下を実行する
          
          // ユーザー名マップが取得できたらプルダウンや設定画面を初期化する
          initTaskSettings();   
          populateTodoAssignees(); 
          
          setupRealtimeTasks();
          setupRealtimeTodos(); 
        } else {
          document.getElementById('login-screen').classList.remove('hidden');
          document.getElementById('main-app').classList.add('hidden');
        }
      });

      // ====== 案件詳細モーダル用 ======
      const originalOpenDetailModal = window.openDetailModal;
      window.openDetailModal = function(task) {
        originalOpenDetailModal(task);
        loadTodosForTask(task.id);
        populateTodoAssignees(null); // モーダル内のフォーム用
      };

      const originalCloseDetailModal = window.closeDetailModal;
      window.closeDetailModal = function() {
        originalCloseDetailModal();
        closeTodoForm();
      };

      // 複数選択チェックボックスの生成
      function populateTodoAssignees(selectedArray) {
        const container = document.getElementById('form-todo-assignees');
        if (!container) return;
        let html = '';
        const selected = selectedArray || [];
        if (window.userNamesMap) {
          for (const [emailPrefix, name] of Object.entries(window.userNamesMap)) {
            const isChecked = selected.includes(emailPrefix) ? 'checked' : '';
            html += `<label class="flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                      <input type="checkbox" value="${emailPrefix}" ${isChecked} class="todo-assignee-cb w-3 h-3 text-blue-600">
                      ${name}
                    </label>`;
          }
        }
        container.innerHTML = html;
      }

      // 詳細モーダル用ToDoリストの描画
      function loadTodosForTask(taskId) {
        const container = document.getElementById('todo-list-container');
        if(!container) return;
        const taskTodos = window.allTodos.filter(t => t.taskId === taskId).sort((a,b) => a.order - b.order);

        if (taskTodos.length === 0) {
          container.innerHTML = '<div class="text-center text-[11px] text-slate-400 mt-6">タスクはありません</div>';
          return;
        }

        container.innerHTML = '';
        taskTodos.forEach(todo => {
          const li = document.createElement('li');
          li.className = `todo-item relative py-3 border-b border-slate-100 flex items-start gap-3 group px-2 -mx-2 transition-colors ${todo.isCompleted ? 'todo-completed opacity-60 bg-slate-50' : 'hover:bg-slate-50 cursor-pointer'}`;
          
          // 担当者表示の生成
          let assigneesHtml = '';
          const assignees = Array.isArray(todo.assignees) ? todo.assignees : (todo.assignee ? [todo.assignee] : []);
          if (assignees.length > 0) {
            assigneesHtml += `<span class="flex items-center gap-1">`;
            // ★ 1人目の名前
            const primaryName = (window.userNamesMap && window.userNamesMap[assignees[0]]) ? window.userNamesMap[assignees[0]] : assignees[0];
            assigneesHtml += `<span class="material-icons-outlined" style="font-size: 14px;">person_outline</span>${primaryName}`;
            
            // ★ 2人目の名前（いれば追加）
            if (assignees.length > 1) {
              const secondaryName = (window.userNamesMap && window.userNamesMap[assignees[1]]) ? window.userNamesMap[assignees[1]] : assignees[1];
              assigneesHtml += `、${secondaryName}`;
            }
            
            // ★ 3人目以降はバッジ化
            if (assignees.length > 2) {
              assigneesHtml += `<span class="ml-1 text-[10px] bg-slate-200 text-slate-600 px-1 rounded rounded-full" title="他 ${assignees.length - 2} 名">+${assignees.length - 2}</span>`;
            }
            assigneesHtml += `</span>`;
          }

          let dateHtml = '';
          if (todo.dueDate) {
            const d = new Date(todo.dueDate);
            dateHtml = `<span class="flex items-center gap-1 ${!todo.isCompleted && new Date() > d ? 'text-red-500' : ''}"><span class="material-icons-outlined" style="font-size: 14px;">calendar_today</span>${d.getMonth()+1}/${d.getDate()}</span>`;
          }

          li.innerHTML = `
            <div class="pt-0.5">
              <input type="checkbox" ${todo.isCompleted ? 'checked' : ''} onchange="toggleTodoComplete('${todo.id}', this.checked)" class="task-checkbox">
            </div>
            <div class="flex-1 min-w-0 flex flex-col" onclick="openTodoEditForm('${todo.id}')">
              <span class="text-[13px] font-medium text-slate-700 leading-snug ${todo.isCompleted ? 'line-through' : ''}">${todo.title}</span>
              <div class="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                ${assigneesHtml}
                ${dateHtml}
              </div>
            </div>
          `;
          container.appendChild(li);
        });
      }

      // 詳細モーダル用：フォーム開閉
      const btnShowTodo = document.getElementById('btn-show-todo-form');
      const todoForm = document.getElementById('todo-edit-form');
      const todoBackdrop = document.getElementById('todo-form-backdrop');
      const btnCancelTodo = document.getElementById('btn-cancel-todo');
      const btnSaveTodo = document.getElementById('btn-save-todo');
      const btnDeleteTodo = document.getElementById('btn-delete-todo');

      if(btnShowTodo) {
        btnShowTodo.addEventListener('click', () => {
          document.getElementById('form-todo-id').value = '';
          document.getElementById('form-todo-title').value = '';
          document.getElementById('form-todo-date').value = '';
          populateTodoAssignees([]);
          btnDeleteTodo.classList.add('hidden');
          todoForm.classList.remove('hidden');
          todoBackdrop.classList.remove('hidden');
          document.getElementById('form-todo-title').focus();
        });
      }

      window.openTodoEditForm = function(id) {
        const todo = window.allTodos.find(t => t.id === id);
        if(!todo) return;
        document.getElementById('form-todo-id').value = id;
        document.getElementById('form-todo-title').value = todo.title;
        document.getElementById('form-todo-date').value = todo.dueDate || '';
        const assignees = Array.isArray(todo.assignees) ? todo.assignees : (todo.assignee ? [todo.assignee] : []);
        populateTodoAssignees(assignees);
        
        btnDeleteTodo.classList.remove('hidden');
        todoForm.classList.remove('hidden');
        todoBackdrop.classList.remove('hidden');
        document.getElementById('form-todo-title').focus();
      };

      function closeTodoForm() {
        if(todoForm) todoForm.classList.add('hidden');
        if(todoBackdrop) todoBackdrop.classList.add('hidden');
      }
      if(btnCancelTodo) btnCancelTodo.addEventListener('click', closeTodoForm);
      if(todoBackdrop) todoBackdrop.addEventListener('click', closeTodoForm);

      // モーダルからの保存処理
      if(btnSaveTodo) {
        btnSaveTodo.addEventListener('click', async () => {
          const title = document.getElementById('form-todo-title').value.trim();
          if (!title) return;
          const dueDate = document.getElementById('form-todo-date').value;
          const todoId = document.getElementById('form-todo-id').value;
          
          const selectedAssignees = [];
          document.querySelectorAll('.todo-assignee-cb:checked').forEach(cb => selectedAssignees.push(cb.value));

          btnSaveTodo.disabled = true;
          btnSaveTodo.innerHTML = '保存中...';
          try {
            if (todoId) {
              await updateDoc(doc(db, 'todos', todoId), { title, assignees: selectedAssignees, dueDate });
            } else {
              const order = document.getElementById('todo-list-container').children.length;
              await addDoc(collection(db, 'todos'), {
                taskId: window.currentOpenTaskId,
                title,
                assignees: selectedAssignees,
                dueDate,
                isCompleted: false,
                order: order,
                createdAt: serverTimestamp()
              });
            }
            closeTodoForm();
          } catch(e) {
            showToast('ToDoの保存に失敗', 'error');
          } finally {
            btnSaveTodo.disabled = false;
            btnSaveTodo.innerHTML = '保存';
          }
        });
      }

      if(btnDeleteTodo) {
        btnDeleteTodo.addEventListener('click', async () => {
          const todoId = document.getElementById('form-todo-id').value;
          if(!todoId) return;
          try {
            await deleteDoc(doc(db, 'todos', todoId));
            closeTodoForm();
          } catch(e) { showToast('削除失敗', 'error'); }
        });
      }

      window.toggleTodoComplete = async function(todoId, isCompleted) {
        try {
          const updateData = { isCompleted };
          
          if (isCompleted) {
            // 完了になった場合は、今日の日付を YYYY/MM/DD 形式で記録する
            const now = new Date();
            const todayStr = now.getFullYear() + '/' + 
                             String(now.getMonth() + 1).padStart(2, '0') + '/' + 
                             String(now.getDate()).padStart(2, '0');
            updateData.completedAt = todayStr;
          } else {
            // 未完了に戻された場合は、完了日をクリアする
            updateData.completedAt = "";
          }

          await updateDoc(doc(db, 'todos', todoId), updateData);
        } catch(e) {
          console.error("ToDoの完了状態の更新に失敗しました:", e);
        }
      };


      // ==========================================
      // タスクタブ（一覧表示）のロジック
      // ==========================================
      let visibleAssignees = [];

      function initTaskSettings() {
        // ローカルストレージから表示設定を読み込み
        const saved = localStorage.getItem('taskTabAssignees');
        if (saved) {
          visibleAssignees = JSON.parse(saved);
        } else {
          // デフォルトは自分だけ表示
          if (window.currentUser) {
            visibleAssignees = [window.currentUser.email.split('@')[0]];
          }
        }
        renderTaskSettings();
      }

      function renderTaskSettings() {
        const container = document.getElementById('settings-task-assignees');
        if (!container || !window.userNamesMap) return;
        let html = '';
        for (const [emailPrefix, name] of Object.entries(window.userNamesMap)) {
          const isChecked = visibleAssignees.includes(emailPrefix) ? 'checked' : '';
          html += `<label class="flex items-center gap-2 cursor-pointer bg-slate-50 p-2 rounded border border-slate-200 hover:bg-blue-50 transition-colors">
                    <input type="checkbox" value="${emailPrefix}" ${isChecked} class="settings-assignee-cb w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500">
                    <span class="text-[12px] font-bold text-slate-700">${name}</span>
                  </label>`;
        }
        container.innerHTML = html;
      }

      // 設定モーダルの保存ボタンに連動させる
      document.getElementById('btn-save-settings').addEventListener('click', () => {
        // 元の説明文保存処理は既存のままなので、その前に担当者設定を保存
        const cbs = document.querySelectorAll('.settings-assignee-cb:checked');
        visibleAssignees = Array.from(cbs).map(cb => cb.value);
        localStorage.setItem('taskTabAssignees', JSON.stringify(visibleAssignees));
        
        if(window.currentView === 'tasks') renderTasksTab(); // 再描画
      });

      window.renderTasksTab = function() {
        const container = document.getElementById('view-tasks');
        if (!container) return;
        container.innerHTML = ''; // クリア

        if (visibleAssignees.length === 0) {
          container.innerHTML = '<div class="p-10 w-full text-center text-slate-400 font-bold">設定から表示する担当者を選択してください。</div>';
          return;
        }

        visibleAssignees.forEach(assigneeId => {
          const name = window.userNamesMap[assigneeId] || assigneeId;
          const section = document.createElement('section');
          section.className = "flex-1 flex flex-col h-full overflow-hidden px-4 task-column transition-all";
          section.dataset.assignee = assigneeId;
          
          // その担当者に関わるタスクを抽出（未完了と完了）
          const myTodos = window.allTodos.filter(t => {
            const arr = Array.isArray(t.assignees) ? t.assignees : (t.assignee ? [t.assignee] : []);
            return arr.includes(assigneeId);
          });
          const activeTodos = myTodos.filter(t => !t.isCompleted);
          const completedTodos = myTodos.filter(t => t.isCompleted);

          let activeHtml = '';
          if (activeTodos.length === 0) {
            activeHtml = `<div class="p-4 text-center text-slate-400 text-[11px] font-bold">タスクはありません</div>`;
          } else {
            activeTodos.forEach(todo => {
              // 関連案件情報の取得
              const parentTask = window.tasks.find(pt => pt.id === todo.taskId);
              let clientName = parentTask ? parentTask.client : '案件未設定';
              let dateStr = parentTask && parentTask.date ? formatYYYYMMDD(parentTask.date) : '';
              let isDelayed = false;
              if (dateStr && dateStr !== '未定') {
                const dateVal = new Date(dateStr.substring(0,4), parseInt(dateStr.substring(4,6))-1, dateStr.substring(6,8));
                if ((new Date() - dateVal) / (1000 * 60 * 60 * 24) >= 14) isDelayed = true;
              }

              // カードHTML
              activeHtml += `
                <article class="todo-item flex items-start gap-3 py-2.5 px-2.5 ${isDelayed ? 'bg-yellow-100 hover:bg-yellow-200 border-yellow-400' : 'bg-white hover:bg-slate-50 border-slate-200'} border rounded-lg shadow-sm transition-all cursor-pointer group" draggable="true" data-id="${todo.id}">
                  <input type="checkbox" onchange="toggleTodoComplete('${todo.id}', this.checked)" class="task-checkbox shrink-0 mt-0.5 ${isDelayed ? 'border-yellow-500' : ''}">
                  <div class="flex-1 min-w-0 flex flex-col gap-2" onclick="openDetailModalFromId('${todo.taskId}')">
                    <span class="text-[13px] font-bold ${isDelayed ? 'text-yellow-900' : 'text-slate-800'} leading-snug">${todo.title}</span>
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span class="${isDelayed ? 'text-yellow-800' : 'text-slate-500'} flex items-center gap-1 truncate max-w-[150px]">
                        <span class="material-icons-outlined" style="font-size: 13px;">business</span>${clientName}
                      </span>
                      ${dateStr ? `<span class="${isDelayed ? 'text-red-600 bg-red-50 px-1 font-bold' : 'text-slate-500'} flex items-center gap-1"><span class="material-icons-outlined" style="font-size: 13px;">${isDelayed ? 'warning_amber' : 'event'}</span>${dateStr}</span>` : ''}
                    </div>
                  </div>
                </article>
              `;
            });
          }

          let compHtml = '';
          completedTodos.forEach(todo => {
            const parentTask = window.tasks.find(pt => pt.id === todo.taskId);
            let clientName = parentTask ? parentTask.client : '-';
            compHtml += `
              <article class="flex items-start gap-3 py-2.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg opacity-60">
                <input type="checkbox" checked onchange="toggleTodoComplete('${todo.id}', this.checked)" class="task-checkbox shrink-0 mt-0.5">
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                  <span class="text-[13px] font-bold text-slate-500 line-through leading-snug">${todo.title}</span>
                  <div class="flex text-[11px] text-slate-400 gap-1"><span class="material-icons-outlined" style="font-size: 13px;">business</span>${clientName}</div>
                </div>
              </article>
            `;
          });

          section.innerHTML = `
            <header class="py-3 shrink-0 flex justify-between items-center mb-1">
              <div class="font-bold text-[15px] text-slate-800 flex items-center gap-2">${name}</div>
            </header>
            <div class="flex-1 overflow-y-auto pb-4">
              <div class="auto-grid content-start mb-6 drop-target-list">
                ${activeHtml}
              </div>
              <div class="completed-section">
                <button class="flex items-center gap-2 text-[12px] font-bold text-slate-500 hover:text-slate-700 transition-colors py-2 px-1 w-full text-left" onclick="this.parentElement.classList.toggle('open')">
                  <span class="material-icons-outlined toggle-icon transition-transform" style="font-size: 16px;">play_arrow</span>
                  完了 (${completedTodos.length}件)
                </button>
                <div class="completed-list auto-grid mt-1 pt-2 border-t border-slate-100">
                  ${compHtml}
                </div>
              </div>
            </div>
          `;
          container.appendChild(section);
        });

        setupTaskTabDragAndDrop();
      };

      // タスクタブ用：担当者変更ドラッグ＆ドロップ
      function setupTaskTabDragAndDrop() {
        const columns = document.querySelectorAll('.task-column');
        let draggedTodoEl = null;

        document.querySelectorAll('.drop-target-list .todo-item').forEach(item => {
          item.addEventListener('dragstart', (e) => {
            draggedTodoEl = item;
            setTimeout(() => item.classList.add('dragging'), 0);
          });
          item.addEventListener('dragend', () => {
            if(draggedTodoEl) draggedTodoEl.classList.remove('dragging');
            draggedTodoEl = null;
            columns.forEach(col => col.classList.remove('drag-over'));
          });
        });

        columns.forEach(column => {
          column.addEventListener('dragover', (e) => { e.preventDefault(); column.classList.add('drag-over'); });
          column.addEventListener('dragleave', () => { column.classList.remove('drag-over'); });
          column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');
            if (draggedTodoEl) {
              const todoId = draggedTodoEl.dataset.id;
              const targetAssignee = column.dataset.assignee;
              const sourceAssignee = draggedTodoEl.closest('.task-column').dataset.assignee;
              if (targetAssignee && targetAssignee !== sourceAssignee) {
                // Firebaseのデータを更新 (配列内の担当者を入れ替える)
                const todoData = window.allTodos.find(t => t.id === todoId);
                if (todoData) {
                  let assignees = Array.isArray(todoData.assignees) ? todoData.assignees : (todoData.assignee ? [todoData.assignee] : []);
                  assignees = assignees.filter(a => a !== sourceAssignee); // 元の担当者を外す
                  if (!assignees.includes(targetAssignee)) assignees.push(targetAssignee); // 新しい担当者を追加
                  try {
                    await updateDoc(doc(db, 'todos', todoId), { assignees });
                    showToast('担当者を変更しました');
                  } catch(err) { showToast('変更失敗', 'error'); }
                }
              }
            }
          });
        });
      }
